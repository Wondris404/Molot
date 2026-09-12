import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || "desktop/resources");
for (const file of ["node/node.exe", "python/python.exe", "engine/engine.py", "server/server.js"])
  if (!existsSync(path.join(root, file))) throw new Error(`Missing release component: ${file}`);
const forbidden = /(^|[\\/])(data|uploads|teacher-tests|backups|logs)([\\/]|$)|(^|[\\/])molot\.sqlite(-wal|-shm)?$|\.gguf$|(^|[\\/])\.env|(^|[\\/])(pymupdf|fitz|pymupdf-.*\.dist-info)([\\/]|$)/i;
const files = [];
const walk = (folder) => {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const item = path.join(folder, entry.name);
    if (entry.isDirectory()) walk(item);
    else if (entry.isFile()) files.push(path.relative(root, item).replaceAll("\\", "/"));
  }
};
walk(root);
for (const file of files) {
  // Package fixtures are code shipped by the embedded Python runtime, not a
  // Molot data folder. All other data/upload/log paths remain blocked.
  const packageFixture = /^python\/Lib\/site-packages\/.+\/(?:test|tests)\/data\//i.test(file)
    || /^python\/Lib\/site-packages\/.+\.dist-info\/licenses\/data\//i.test(file)
    // This is the compiled local API route, not an application data directory.
    || /^server\/\.next\/server\/app\/api\/data\//i.test(file);
  if (forbidden.test(file) && !packageFixture) throw new Error(`Forbidden release file: ${file}`);
}
console.log(`Release audit passed: ${files.length} bundled files; no personal database, uploads, logs or AI models.`);
