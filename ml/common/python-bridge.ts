import { spawn } from "node:child_process";
import path from "node:path";
import { runtimeDirectory } from "../../lib/paths";
import { logEvent } from "../../lib/logger";

export function callPython<T>(
  payload: Record<string, unknown>,
  timeoutMs = 120000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const script =
      process.env.MOLOT_ENGINE_SCRIPT ||
      path.join(process.cwd(), "ml/python/engine.py");
    const child = spawn(
      path.join(runtimeDirectory, "python/python.exe"),
      ["-I", script],
      {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PYTHONDONTWRITEBYTECODE: "1",
          OMP_NUM_THREADS: "2",
        },
      },
    );
    let output = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Lokálny engine prekročil časový limit."));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (text: string) => {
      output += text;
      if (output.length > 8_000_000) child.kill();
    });
    // Do not store document content or Python tracebacks in logs.
    child.stderr.resume();
    child.on("error", () => {
      clearTimeout(timeout);
      logEvent("engine_unavailable");
      reject(new Error("Lokálny prediction engine nie je dostupný."));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        logEvent("engine_failed", { code: code ?? -1 });
        reject(
          new Error(
            "Lokálny engine zlyhal. Ostatné funkcie Molotu sú dostupné.",
          ),
        );
        return;
      }
      try {
        const result = JSON.parse(output);
        if (result.error) throw new Error(String(result.error));
        resolve(result as T);
      } catch {
        reject(new Error("Lokálny engine nevrátil platný výsledok."));
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(payload));
  });
}
