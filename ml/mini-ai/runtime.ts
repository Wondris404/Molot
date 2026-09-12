import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { logEvent } from "@/lib/logger";
import {
  miniAiModelPath,
  miniAiRuntimePath,
  miniAiStatus,
} from "./model";

interface RuntimeState {
  child: ChildProcess | null;
  port: number | null;
  start: Promise<number> | null;
  activeRequests: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
  handlersInstalled: boolean;
}

const globalRuntime = globalThis as typeof globalThis & {
  __molotMiniAiRuntime?: RuntimeState;
};
const state = (globalRuntime.__molotMiniAiRuntime ??= {
  child: null,
  port: null,
  start: null,
  activeRequests: 0,
  idleTimer: null,
  handlersInstalled: false,
});
const idleMs = 5 * 60_000;

async function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Voľný lokálny port sa nenašiel."));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

function clearIdleTimer() {
  if (state.idleTimer) clearTimeout(state.idleTimer);
  state.idleTimer = null;
}

function scheduleIdleShutdown() {
  clearIdleTimer();
  state.idleTimer = setTimeout(() => {
    if (state.activeRequests === 0) shutdownMiniAiRuntime();
  }, idleMs);
  state.idleTimer.unref?.();
}

export function shutdownMiniAiRuntime() {
  clearIdleTimer();
  if (state.child && state.child.exitCode === null) state.child.kill();
  state.child = null;
  state.port = null;
  state.start = null;
}

async function health(port: number) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(1_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function startRuntime() {
  if (!miniAiStatus().ready)
    throw new Error("Lokálne rozpoznávanie nie je nainštalované.");
  const port = await freePort();
  const child = spawn(
    miniAiRuntimePath,
    [
      "-m",
      miniAiModelPath,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "-c",
      "3072",
      "-np",
      "1",
      "--no-webui",
    ],
    {
      cwd: path.dirname(miniAiRuntimePath),
      windowsHide: true,
      stdio: "ignore",
    },
  );
  state.child = child;
  state.port = port;
  child.once("exit", (code) => {
    if (state.child === child) {
      state.child = null;
      state.port = null;
      state.start = null;
    }
    if (code && code !== 0) logEvent("mini_ai_runtime_exit", { code });
  });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) break;
    if (await health(port)) {
      logEvent("mini_ai_runtime_ready", { port });
      return port;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  shutdownMiniAiRuntime();
  throw new Error("Lokálne rozpoznávanie sa nespustilo.");
}

async function ensureRuntime() {
  if (state.child && state.child.exitCode === null && state.port) {
    if (await health(state.port)) return state.port;
    shutdownMiniAiRuntime();
  }
  state.start ??= startRuntime().finally(() => {
    state.start = null;
  });
  return state.start;
}

function installExitHandlers() {
  if (state.handlersInstalled) return;
  state.handlersInstalled = true;
  process.once("exit", shutdownMiniAiRuntime);
  process.once("SIGINT", shutdownMiniAiRuntime);
  process.once("SIGTERM", shutdownMiniAiRuntime);
}

export interface StructuredInferenceRequest {
  instruction: string;
  input: unknown;
  schema: Record<string, unknown>;
  maxTokens: number;
}

export async function inferStructured(
  request: StructuredInferenceRequest,
): Promise<unknown> {
  installExitHandlers();
  clearIdleTimer();
  state.activeRequests += 1;
  try {
    const port = await ensureRuntime();
    const response = await fetch(
      `http://127.0.0.1:${port}/v1/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(90_000),
        body: JSON.stringify({
          model: "local",
          temperature: 0,
          seed: 35,
          max_tokens: request.maxTokens,
          messages: [
            { role: "system", content: request.instruction },
            { role: "user", content: JSON.stringify(request.input) },
          ],
          response_format: { type: "json_object", schema: request.schema },
          cache_prompt: false,
          chat_template_kwargs: { enable_thinking: false },
          reasoning_effort: "none",
        }),
      },
    );
    if (!response.ok)
      throw new Error(`Lokálne rozpoznávanie neodpovedalo (${response.status}).`);
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = body.choices?.[0]?.message?.content
      ?.replace(/<think>[\s\S]*?<\/think>/g, "")
      .trim();
    if (!raw) throw new Error("Lokálne rozpoznávanie vrátilo prázdny výsledok.");
    return JSON.parse(raw) as unknown;
  } finally {
    state.activeRequests = Math.max(0, state.activeRequests - 1);
    if (state.activeRequests === 0) scheduleIdleShutdown();
  }
}
