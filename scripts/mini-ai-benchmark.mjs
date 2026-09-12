import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
const runtime = path.resolve(".cache/llama/llama-cli.exe");
const model = path.resolve(process.env.MOLOT_MINI_AI_MODEL || ".cache/mini-ai-benchmark/Qwen3-0.6B-Q8_0.gguf");
if (!existsSync(runtime) || !existsSync(model)) throw new Error("Chýba lokálny benchmark runtime alebo model.");
const cases = JSON.parse(readFileSync("ml/mini-ai/benchmark.json", "utf8"));
let passed = 0;
for (const item of cases) {
  const prompt = `You extract structured information for MOLOT. Return ONLY one compact JSON object, no markdown and no explanation. Use these exact field names when applicable: ${JSON.stringify(Object.keys(item.expected))}. Input: ${JSON.stringify(item.input)} /no_think`;
  const run = spawnSync(runtime, ["-m", model, "-p", prompt, "-n", "180", "--temp", "0", "--no-display-prompt", "--simple-io"], { encoding: "utf8", windowsHide: true, maxBuffer: 2_000_000 });
  const raw = `${run.stdout}\n${run.stderr}`;
  const candidates = raw.match(/\{[^\r\n]*\}/g) || [];
  const match = candidates.at(-1);
  let output = null;
  try { output = match ? JSON.parse(match) : null; } catch { output = null; }
  const ok = output && Object.entries(item.expected).every(([key, expected]) => JSON.stringify(output[key]) === JSON.stringify(expected));
  console.log(`${ok ? "PASS" : "FAIL"} ${item.id}: ${output ? JSON.stringify(output) : `invalid JSON (${raw.slice(-300).replace(/\s+/g, " ")})`}`);
  if (ok) passed++;
}
console.log(`Mini AI benchmark: ${passed}/${cases.length}`);
if (passed !== cases.length) process.exitCode = 1;
