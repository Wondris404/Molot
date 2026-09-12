import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const root = process.cwd();
const requestedVersion = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(requestedVersion || "")) {
  throw new Error("Použitie: npm run version:preserve -- 0.3.0");
}

const installerName = `Molot-Setup-${requestedVersion}.exe`;
const legacyDirectory = path.join(root, "release");
const targetDirectory = path.join(legacyDirectory, requestedVersion);
const sourceInstaller = path.join(legacyDirectory, installerName);
const targetInstaller = path.join(targetDirectory, installerName);

mkdirSync(targetDirectory, { recursive: true });
if (existsSync(sourceInstaller) && !existsSync(targetInstaller)) copyFileSync(sourceInstaller, targetInstaller);
for (const filename of ["SHA256SUMS.txt", "README-INSTALL.txt"]) {
  const source = path.join(legacyDirectory, filename);
  const target = path.join(targetDirectory, filename);
  if (existsSync(source) && !existsSync(target)) copyFileSync(source, target);
}
if (!existsSync(targetInstaller)) throw new Error(`Stabilný inštalátor sa nenašiel: ${targetInstaller}`);

const hash = createHash("sha256").update(readFileSync(targetInstaller)).digest("hex");
const manifest = {
  product: "MOLOT",
  version: requestedVersion,
  status: "stable-preserved",
  installer: installerName,
  installerBytes: statSync(targetInstaller).size,
  sha256: hash,
  preservedAt: new Date().toISOString(),
  note: "Stable release preserved before the MOLOT 3.5 AI Improvement work.",
};
writeFileSync(path.join(targetDirectory, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(path.join(targetDirectory, "SHA256SUMS.txt"), `${hash}  ${installerName}\n`);
console.log(`Preserved MOLOT ${requestedVersion}: ${targetInstaller}`);
