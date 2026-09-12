import { spawnSync } from "node:child_process";
import path from "node:path";
import { mkdirSync, cpSync, existsSync, readFileSync, rmSync } from "node:fs";
const root = process.cwd();
process.env.CARGO_HOME = path.join(root, ".cache/cargo");
process.env.CARGO_TARGET_DIR = path.join(root, "src-tauri/target");
process.env.NEXT_TELEMETRY_DISABLED = "1";
function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const mode = process.argv[2] || "dev";
if (mode === "prepare") {
  if (!process.argv.includes("--skip-build"))
    run(process.execPath, ["scripts/next-local.mjs", "build"]);
  const resources = path.join(root, "desktop/resources");
  // Generated release input: rebuild from a clean directory so stale files
  // cannot enter an installer.
  rmSync(resources, { recursive: true, force: true, maxRetries: 3 });
  mkdirSync(resources, { recursive: true });
  cpSync(".next/standalone", path.join(resources, "server"), {
    recursive: true,
    dereference: true,
    // Exclude only top-level user data. The API itself lives in app/api/data.
    filter: (source) => path.relative(path.resolve(".next/standalone"), path.resolve(source)).split(path.sep)[0] !== "data",
  });
  cpSync(".next/static", path.join(resources, "server/.next/static"), {
    recursive: true,
  });
  cpSync(
    "node_modules/pdfjs-dist",
    path.join(resources, "server/node_modules/pdfjs-dist"),
    { recursive: true },
  );
  cpSync(".cache/python", path.join(resources, "python"), {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(path.resolve(".cache/python"), path.resolve(source));
      return !/(^|[\\/])(pymupdf|fitz|pymupdf-.*\.dist-info)([\\/]|$)/i.test(relative)
        && !/(^|[\\/])(test|tests)([\\/]|$)/i.test(relative)
        && !/(^|[\\/])sklearn[\\/]datasets[\\/]data([\\/]|$)/i.test(relative);
    },
  });
  mkdirSync(path.join(resources, "node"), { recursive: true });
  cpSync(".cache/node/node.exe", path.join(resources, "node/node.exe"));
  if (existsSync(".cache/llama/llama-server.exe"))
    cpSync(".cache/llama", path.join(resources, "llama"), { recursive: true });
  cpSync("ml/python", path.join(resources, "engine"), { recursive: true });
  cpSync(".cache/tessdata", path.join(resources, "tessdata"), {
    recursive: true,
  });
  for (const dependency of [
    "tesseract.js",
    "tesseract.js-core",
    "wasm-feature-detect",
    "bmp-js",
    "idb-keyval",
    "is-url",
    "node-fetch",
    "opencollective-postinstall",
    "regenerator-runtime",
    "zlibjs",
    "whatwg-url",
    "tr46",
    "webidl-conversions",
  ])
    cpSync(
      `node_modules/${dependency}`,
      path.join(resources, "server/node_modules", dependency),
      { recursive: true },
    );
  const server = path.join(resources, "server");
  const routes = JSON.parse(readFileSync(path.join(server, ".next/server/app-paths-manifest.json"), "utf8"));
  for (const [route, filename] of Object.entries(routes)) {
    if (!existsSync(path.join(server, ".next/server", filename))) throw new Error(`Desktop package is missing route ${route}: ${filename}`);
  }
} else {
  if (!existsSync("desktop/resources/server/server.js"))
    throw new Error("Najprv spusti npm run desktop:prepare.");
  process.env.MOLOT_DESKTOP_RESOURCES = path.join(root, "desktop/resources");
  if (mode === "dev") process.env.MOLOT_DATA_DIR ||= path.join(root, "data");
  run(process.execPath, [
    "node_modules/@tauri-apps/cli/tauri.js",
    mode === "build" ? "build" : "dev",
    ...(mode === "build" ? ["--no-bundle"] : []),
  ]);
  if (mode === "build") {
    mkdirSync("desktop/release", { recursive: true });
    cpSync("src-tauri/target/release/molot.exe", "desktop/release/Molot.exe");
    cpSync("desktop/resources", "desktop/release/resources", {
      recursive: true,
    });
  }
}
