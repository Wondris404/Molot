import { spawn } from "node:child_process";
import path from "node:path";

// Keep telemetry disabled for dev, build, and production without changing global settings.
const child = spawn(
  process.execPath,
  [path.resolve("node_modules/next/dist/bin/next"), ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
