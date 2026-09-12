import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const root = process.cwd();
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const environment = { ...process.env, CARGO_HOME: path.join(root, ".cache/cargo"), CARGO_TARGET_DIR: path.join(root, "src-tauri/target"), NEXT_TELEMETRY_DISABLED: "1" };
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, env: environment, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};
if (!process.argv.includes("--skip-checks")) {
  run(process.execPath, ["node_modules/eslint/bin/eslint.js", "."]);
  run(process.execPath, [
    "node_modules/tsx/dist/cli.mjs",
    "--test",
    "tests/core.test.ts",
    "tests/global.test.ts",
    "tests/intelligence.test.ts",
    "tests/documents.test.ts",
    "tests/result-recommendation.test.ts",
    "tests/backup-regressions.test.ts",
    "tests/prediction-regressions.test.ts",
    "tests/mini-ai.test.ts",
  ]);
}
if (!process.argv.includes("--skip-prepare")) run(process.execPath, ["scripts/desktop.mjs", "prepare"]);
run(process.execPath, ["scripts/release-audit.mjs"]);
const bundle = path.join(root, "src-tauri/target/release/bundle/nsis");
rmSync(bundle, { recursive: true, force: true, maxRetries: 3 });
run(process.execPath, ["node_modules/@tauri-apps/cli/tauri.js", "build", "--bundles", "nsis"]);
const source = readdirSync(bundle)
  .map((name) => path.join(bundle, name))
  .find((file) => path.basename(file).includes(version) && /-setup\.exe$/i.test(file) && statSync(file).isFile());
if (!source) throw new Error("NSIS installer was not created.");
const output = path.join(root, "release", version);
// Each release is immutable from the point of view of other versions. Rebuilding
// one version replaces only that version's generated files.
rmSync(output, { recursive: true, force: true, maxRetries: 3 });
mkdirSync(output, { recursive: true });
const name = `Molot-Setup-${version}.exe`;
const installer = path.join(output, name);
cpSync(source, installer);
const sha256 = createHash("sha256").update(readFileSync(installer)).digest("hex");
writeFileSync(path.join(output, "SHA256SUMS.txt"), `${sha256}  ${name}\n`);
writeFileSync(path.join(output, "README-INSTALL.txt"), `MOLOT ${version}\n\n1. Stiahni ${name}.\n2. Otvor inštalátor a dokonči kroky.\n3. Molot spustíš z ponuky Štart alebo z plochy.\n\nNode.js, Python ani vývojárske nástroje netreba. Local AI modely sú voliteľné a nie sú súčasťou inštalátora. Odinštalovanie ponechá osobné dáta, pokiaľ výslovne nezaškrtneš ich odstránenie.\n\nAplikácia zatiaľ nie je digitálne podpísaná. Windows môže pri novom neznámom programe zobraziť SmartScreen upozornenie.\n`);
console.log(`Release created: ${installer}\nSHA-256: ${sha256}`);
