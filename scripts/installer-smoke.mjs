import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const version = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile("package.json", "utf8"))).version;
const installer = path.resolve(process.argv[2] || `release/${version}/Molot-Setup-${version}.exe`);
if (!existsSync(installer)) throw new Error(`Installer not found: ${installer}`);

const installDirectory = path.resolve("data", `test-install-${randomUUID()}`);
const smokeData = path.resolve("data", `test-installer-data-${randomUUID()}`);
let uninstaller;
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    timeout: 180_000,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} exited with ${result.status}`);
};

try {
  run(installer, ["/S", `/D=${installDirectory}`]);
  const executables = readdirSync(installDirectory)
    .filter((name) => /molot\.exe$/i.test(name) && !/^uninstall/i.test(name))
    .map((name) => path.join(installDirectory, name))
    .filter((file) => statSync(file).isFile());
  if (executables.length !== 1) throw new Error(`Installed MOLOT executable was not found in ${installDirectory}.`);
  run(process.execPath, ["scripts/desktop-smoke.mjs"], {
    env: { ...process.env, MOLOT_SMOKE_EXE: executables[0], MOLOT_SMOKE_DATA_DIR: smokeData },
    timeout: 240_000,
  });
  uninstaller = readdirSync(installDirectory)
    .map((name) => path.join(installDirectory, name))
    .find((file) => /^uninstall.*\.exe$/i.test(path.basename(file)));
  if (!uninstaller) throw new Error("NSIS uninstaller was not created.");
  run(uninstaller, ["/S"]);
  for (let attempt = 0; attempt < 50 && existsSync(executables[0]); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (existsSync(executables[0])) throw new Error("Uninstall left the application executable behind.");
  console.log(`Installer smoke passed. Isolated persisted data: ${smokeData}`);
} finally {
  if (uninstaller && existsSync(uninstaller)) {
    spawnSync(uninstaller, ["/S"], { windowsHide: true, timeout: 180_000 });
  }
  // Installation binaries are disposable; persisted smoke evidence stays under data/.
  rmSync(installDirectory, { recursive: true, force: true, maxRetries: 3 });
}
