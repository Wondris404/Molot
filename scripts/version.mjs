import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version || "")) {
  console.error("Použitie: npm run version:set -- 0.4.0");
  process.exit(1);
}

for (const filename of ["package.json", "package-lock.json"]) {
  const document = JSON.parse(readFileSync(filename, "utf8"));
  document.version = version;
  if (document.packages?.[""]) document.packages[""].version = version;
  writeFileSync(filename, `${JSON.stringify(document, null, 2)}\n`);
}

const cargoFile = "src-tauri/Cargo.toml";
const cargo = readFileSync(cargoFile, "utf8").replace(
  /^(\[package\][\s\S]*?\nversion\s*=\s*)"[^"]+"/m,
  `$1"${version}"`,
);
writeFileSync(cargoFile, cargo);
console.log(`MOLOT version set to ${version}.`);
