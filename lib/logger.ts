import {
  appendFileSync,
  mkdirSync,
  statSync,
  renameSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import { dataDirectory } from "./paths";

export function logEvent(
  event: string,
  details: Record<string, string | number | boolean> = {},
) {
  try {
    const folder = path.join(dataDirectory, "logs");
    mkdirSync(folder, { recursive: true });
    const file = path.join(folder, "molot.jsonl");
    if (existsSync(file) && statSync(file).size > 2_000_000)
      renameSync(file, path.join(folder, `molot-${Date.now()}.jsonl`));
    appendFileSync(
      file,
      JSON.stringify({ at: new Date().toISOString(), event, ...details }) +
        "\n",
    );
  } catch {
    console.error("Molot: lokálny log nie je dostupný.");
  }
}
