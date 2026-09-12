import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cacheDirectory } from "@/lib/paths";

const folder = path.join(cacheDirectory, "mini-ai");

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export function miniAiCacheKey(value: unknown) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

export function readMiniAiCache(key: string): unknown | null {
  const file = path.join(folder, `${key}.json`);
  if (!existsSync(file)) return null;
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as {
      value?: unknown;
    };
    return value.value ?? null;
  } catch {
    return null;
  }
}

export function writeMiniAiCache(key: string, value: unknown) {
  mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `${key}.json`);
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(
    temporary,
    JSON.stringify({ createdAt: new Date().toISOString(), value }),
  );
  renameSync(temporary, file);
}
