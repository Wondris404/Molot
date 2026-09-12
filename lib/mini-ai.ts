import type { SmartInput } from "./smart-input";
import type { Subject } from "./types";
import {
  downloadMiniAi,
  miniAiCandidate,
  miniAiModelPath,
  miniAiRuntimePath,
  miniAiStatus,
  removeMiniAiFile,
} from "@/ml/mini-ai/model";
import { interpretSmartInputWithMiniAi } from "@/ml/mini-ai/router";
import { shutdownMiniAiRuntime } from "@/ml/mini-ai/runtime";

export {
  downloadMiniAi,
  miniAiCandidate,
  miniAiModelPath,
  miniAiRuntimePath,
  miniAiStatus,
};

export function removeMiniAi() {
  shutdownMiniAiRuntime();
  return removeMiniAiFile();
}

// Compatibility facade for the existing Smart Add API. The implementation is
// routed through task-specific prompts and validated schemas in MOLOT 3.5.
export async function interpretWithMiniAi(
  text: string,
  subjects: Subject[],
  baselineKind: SmartInput["kind"] = "unknown",
) {
  return interpretSmartInputWithMiniAi(text, subjects, baselineKind);
}
