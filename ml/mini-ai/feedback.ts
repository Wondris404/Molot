import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { modelsDirectory } from "@/lib/paths";
import { miniAiCandidate } from "./model";
import type { SmartInput } from "@/lib/smart-input";

export interface MiniAiFeedback {
  task: "smart_input";
  suggested: SmartInput;
  confirmed: SmartInput;
  accepted: boolean;
}

export function recordMiniAiFeedback(feedback: MiniAiFeedback) {
  mkdirSync(modelsDirectory, { recursive: true });
  const record = {
    version: 1,
    model: miniAiCandidate.id,
    promptFamily: miniAiCandidate.promptFamily,
    createdAt: new Date().toISOString(),
    ...feedback,
  };
  appendFileSync(
    path.join(modelsDirectory, "mini-ai-feedback.jsonl"),
    `${JSON.stringify(record)}\n`,
  );
  return { ok: true };
}
