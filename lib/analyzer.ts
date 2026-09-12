/** Extension point for a future opt-in OCR/AI analyzer. The local app never fabricates answers. */
export interface AnalysisQuestion {
  question: string;
  topic: string;
  answer: string;
  isCorrect: boolean | null;
  confidence: number | null;
}
export interface AnalysisOutput {
  status: "manual" | "review-required";
  questions: AnalysisQuestion[];
  message: string;
}
export interface MaterialAnalyzer {
  id: string;
  analyze(input: {
    bytes: Uint8Array;
    mimeType: string;
    name: string;
  }): Promise<AnalysisOutput>;
}
export const manualAnalyzer: MaterialAnalyzer = {
  id: "local-manual",
  async analyze() {
    return {
      status: "manual",
      questions: [],
      message:
        "Materiál je pripravený na ručné označenie otázok. Automatické rozpoznávanie odpovedí zatiaľ nie je pripojené.",
    };
  },
};
