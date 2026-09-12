import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { miniAiPrompts } from "../ml/mini-ai/prompts";
import { miniAiJsonSchemas, miniAiSchemas, type MiniAiTaskName } from "../ml/mini-ai/schemas";
import { refineMiniAiOutput } from "../ml/mini-ai/router";

interface BenchmarkCase {
  id: string;
  category: string;
  task: MiniAiTaskName;
  input: Record<string, unknown>;
  context?: { subjects?: string[]; topics?: string[]; language?: "sk" | "en" };
  expected: unknown;
}
interface InferenceResult {
  output: unknown | null;
  rawOutput?: unknown | null;
  rawSchemaValid?: boolean;
  jsonValid: boolean;
  schemaValid: boolean;
  latencyMs: number;
  error: string | null;
}

const root = process.cwd();
const runtime = path.resolve(".cache/llama/llama-server.exe");
const model = path.resolve(process.env.MOLOT_MINI_AI_MODEL || ".cache/mini-ai-benchmark/Qwen3-0.6B-Q8_0.gguf");
if (!existsSync(runtime) || !existsSync(model)) throw new Error("Chýba lokálny benchmark runtime alebo model.");
const cases = JSON.parse(readFileSync("ml/mini-ai/benchmark.json", "utf8")) as BenchmarkCase[];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function equal(actual: unknown, expected: unknown): boolean {
  if (typeof actual === "string" && typeof expected === "string") return normalize(actual) === normalize(expected);
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length) return false;
    const remaining = [...actual];
    return expected.every((item) => {
      const index = remaining.findIndex((candidate) => equal(candidate, item));
      if (index < 0) return false;
      remaining.splice(index, 1);
      return true;
    });
  }
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object") return false;
    return Object.entries(expected).every(([key, value]) => equal((actual as Record<string, unknown>)[key], value));
  }
  return Object.is(actual, expected);
}
function countFields(actual: unknown, expected: unknown): { correct: number; total: number } {
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    return Object.entries(expected).reduce((sum, [key, value]) => {
      const nested = countFields(actual && typeof actual === "object" ? (actual as Record<string, unknown>)[key] : undefined, value);
      return { correct: sum.correct + nested.correct, total: sum.total + nested.total };
    }, { correct: 0, total: 0 });
  }
  return { correct: equal(actual, expected) ? 1 : 0, total: 1 };
}
async function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") { reject(new Error("No free port.")); return; }
      server.close(() => resolve(address.port));
    });
  });
}
function processStats(pid: number) {
  const command = `$p=Get-Process -Id ${pid}; Write-Output ($p.WorkingSet64.ToString() + '|' + $p.TotalProcessorTime.Ticks.ToString())`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], { encoding: "utf8", windowsHide: true });
  const values = result.stdout.trim().split("|").map(Number);
  return { workingSetBytes: values[0] || 0, cpuSeconds: (values[1] || 0) / 10_000_000 };
}
async function waitForServer(port: number, child: ChildProcess) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (child.exitCode !== null) throw new Error("llama-server exited during load.");
    try { const response = await fetch(`http://127.0.0.1:${port}/health`); if (response.ok) return; }
    catch { /* loading */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("llama-server load timeout.");
}
async function infer(port: number, item: BenchmarkCase, mode: "legacy" | "3.5"): Promise<InferenceResult> {
  const prompt = miniAiPrompts[item.task];
  const instruction = mode === "3.5" ? prompt.instruction : "You extract structured information for MOLOT. Return only one compact JSON object. Never invent missing values. /no_think";
  const started = performance.now();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model: "local", temperature: 0, seed: 35, max_tokens: prompt.maxTokens,
        messages: [
          { role: "system", content: instruction },
          { role: "user", content: JSON.stringify({ task: item.task, input: item.input, context: item.context ?? {} }) },
        ],
        response_format: mode === "3.5" ? { type: "json_object", schema: miniAiJsonSchemas[item.task] } : { type: "json_object" },
        cache_prompt: false,
        chat_template_kwargs: { enable_thinking: false }, reasoning_effort: "none",
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = body.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, "").trim() ?? "";
    let output: unknown = null;
    try { output = JSON.parse(raw) as unknown; }
    catch { return { output: null, jsonValid: false, schemaValid: false, latencyMs: performance.now() - started, error: "invalid JSON" }; }
    const refined = mode === "3.5"
      ? refineMiniAiOutput(item.task, item.input as never, item.context ?? {}, output)
      : output;
    return { output: refined, rawOutput: output, rawSchemaValid: miniAiSchemas[item.task].safeParse(output).success, jsonValid: true, schemaValid: miniAiSchemas[item.task].safeParse(refined).success, latencyMs: performance.now() - started, error: null };
  } catch (error) {
    return { output: null, jsonValid: false, schemaValid: false, latencyMs: performance.now() - started, error: error instanceof Error ? error.message : "unknown" };
  }
}

async function main() {
const port = await freePort();
const child = spawn(runtime, ["-m", model, "--host", "127.0.0.1", "--port", String(port), "-c", "3072", "-np", "1", "--no-webui"], { cwd: path.dirname(runtime), windowsHide: true, stdio: "ignore" });
const loadStarted = performance.now();
let peakWorkingSetBytes = 0;
try {
  await waitForServer(port, child);
  const loadMs = performance.now() - loadStarted;
  const initialStats = processStats(child.pid!);
  peakWorkingSetBytes = initialStats.workingSetBytes;
  const rows: Array<Record<string, unknown>> = [];
  for (const item of cases) {
    const legacy = await infer(port, item, "legacy");
    const current = await infer(port, item, "3.5");
    peakWorkingSetBytes = Math.max(peakWorkingSetBytes, processStats(child.pid!).workingSetBytes);
    const legacyFields = countFields(legacy.output, item.expected);
    const currentFields = countFields(current.output, item.expected);
    const rawFields = countFields(current.rawOutput, item.expected);
    rows.push({
      id: item.id, category: item.category, task: item.task, expected: item.expected,
      legacy: { ...legacy, exact: equal(legacy.output, item.expected), ...legacyFields },
      currentRaw: { output: current.rawOutput, exact: equal(current.rawOutput, item.expected), jsonValid: current.jsonValid, schemaValid: current.rawSchemaValid ?? false, latencyMs: current.latencyMs, ...rawFields },
      current: { ...current, exact: equal(current.output, item.expected), ...currentFields },
    });
    console.log(`${currentFields.correct === currentFields.total ? "PASS" : "FAIL"} ${item.id} · old ${legacyFields.correct}/${legacyFields.total} · 3.5 ${currentFields.correct}/${currentFields.total}`);
  }
  const finalStats = processStats(child.pid!);
  const summarize = (mode: "legacy" | "currentRaw" | "current") => {
    const selected = rows.map((row) => row[mode] as Record<string, number | boolean>);
    const correct = selected.reduce((sum, row) => sum + Number(row.correct), 0);
    const total = selected.reduce((sum, row) => sum + Number(row.total), 0);
    const categories = [...new Set(cases.map((item) => item.category))].map((category) => {
      const indices = cases.map((item, index) => item.category === category ? index : -1).filter((index) => index >= 0);
      const categoryRows = indices.map((index) => selected[index]);
      const categoryCorrect = categoryRows.reduce((sum, row) => sum + Number(row.correct), 0);
      const categoryTotal = categoryRows.reduce((sum, row) => sum + Number(row.total), 0);
      return { category, cases: indices.length, fieldAccuracy: categoryTotal ? categoryCorrect / categoryTotal : 0 };
    });
    return {
      cases: selected.length,
      exactCases: selected.filter((row) => row.exact).length,
      fieldAccuracy: total ? correct / total : 0,
      jsonValidity: selected.filter((row) => row.jsonValid).length / selected.length,
      schemaValidity: selected.filter((row) => row.schemaValid).length / selected.length,
      averageLatencyMs: selected.reduce((sum, row) => sum + Number(row.latencyMs), 0) / selected.length,
      categories,
    };
  };
  const result = {
    benchmarkVersion: "3.5.0-v2", createdAt: new Date().toISOString(), syntheticDataOnly: true,
    model: { name: "Qwen3 0.6B Q8_0", bytes: statSync(model).size },
    runtime: { loadMs, peakWorkingSetBytes, cpuSeconds: Math.max(0, finalStats.cpuSeconds - initialStats.cpuSeconds) },
    legacy: summarize("legacy"), currentRaw: summarize("currentRaw"), current: summarize("current"), rows,
  };
  const resultsDirectory = path.join(root, "ml/mini-ai/results");
  const failuresDirectory = path.join(root, "ml/mini-ai/failures");
  mkdirSync(resultsDirectory, { recursive: true }); mkdirSync(failuresDirectory, { recursive: true });
  writeFileSync(path.join(resultsDirectory, "3.5.0.json"), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(path.join(failuresDirectory, "3.5.0.json"), `${JSON.stringify({ benchmarkVersion: result.benchmarkVersion, syntheticDataOnly: true, description: "Raw-model failures retained with the corrected deterministic-plus-semantic pipeline output.", rows: rows.filter((row) => !(row.currentRaw as Record<string, boolean>).exact) }, null, 2)}\n`);
  console.log(`MOLOT 3.5 pipeline field accuracy: ${(result.current.fieldAccuracy * 100).toFixed(1)}% (raw model ${(result.currentRaw.fieldAccuracy * 100).toFixed(1)}%, legacy ${(result.legacy.fieldAccuracy * 100).toFixed(1)}%)`);
  console.log(`JSON validity: ${(result.current.jsonValidity * 100).toFixed(1)}% · schema validity: ${(result.current.schemaValidity * 100).toFixed(1)}%`);
  console.log(`Load ${(loadMs / 1000).toFixed(2)}s · peak RAM ${(peakWorkingSetBytes / 1048576).toFixed(1)} MiB · mean latency ${(result.current.averageLatencyMs / 1000).toFixed(2)}s`);
} finally {
  if (child.exitCode === null) child.kill();
}
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
