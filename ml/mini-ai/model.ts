import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { modelsDirectory, runtimeDirectory } from "@/lib/paths";

export const miniAiCandidate = {
  id: "qwen3-0.6b-q8",
  displayName: "MOLOT Mini AI",
  technicalName: "Qwen3 0.6B Q8_0",
  approximateSizeMb: 639,
  license: "Apache-2.0",
  sha256: "9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031",
  url: "https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf",
  promptFamily: "molot-3.5",
} as const;

export const miniAiModelPath = path.join(modelsDirectory, "molot-mini-ai.gguf");
export const miniAiRuntimePath = path.join(runtimeDirectory, "llama", "llama-server.exe");

export function miniAiStatus() {
  const installed = existsSync(miniAiModelPath);
  const runtimeAvailable = existsSync(miniAiRuntimePath);
  return {
    installed,
    ready: installed && runtimeAvailable,
    size: installed ? statSync(miniAiModelPath).size : 0,
    runtimeAvailable,
    candidate: miniAiCandidate,
  };
}

export async function downloadMiniAi() {
  mkdirSync(modelsDirectory, { recursive: true });
  const temporary = `${miniAiModelPath}.part`;
  if (existsSync(temporary)) unlinkSync(temporary);
  const response = await fetch(miniAiCandidate.url, { redirect: "follow" });
  if (!response.ok || !response.body)
    throw new Error("Model sa nepodarilo stiahnuť.");
  const digest = createHash("sha256");
  const verifier = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      digest.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(response.body as never),
      verifier,
      createWriteStream(temporary, { flags: "wx" }),
    );
    const hash = digest.digest("hex");
    if (hash !== miniAiCandidate.sha256)
      throw new Error("Kontrola stiahnutého modelu zlyhala.");
    renameSync(temporary, miniAiModelPath);
    return miniAiStatus();
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

export function removeMiniAiFile() {
  if (existsSync(miniAiModelPath)) unlinkSync(miniAiModelPath);
  return miniAiStatus();
}
