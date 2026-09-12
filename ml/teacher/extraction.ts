import { normalize } from "../common/text";
import type { MaterialTopic, TeacherQuestion } from "./types";
export function suggestQuestions(
  text: string,
  topics: MaterialTopic[],
): Omit<TeacherQuestion, "id" | "createdAt" | "documentId">[] {
  const blocks = text
    .split(/\n\s*(?=\d+[.)]\s)|\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5)
    .slice(0, 200);
  return blocks.map((text) => {
    const clean = normalize(text);
    const topic = topics.find((t) =>
      [t.name, ...t.keywords.split(/[,;]+/)].some(
        (word) => word.trim().length > 1 && clean.includes(normalize(word)),
      ),
    );
    const questionType = /vypoc|calculate|ries/.test(clean)
      ? "calculation"
      : /defin/.test(clean)
        ? "definition"
        : /vysvet|explain/.test(clean)
          ? "explanation"
          : /porov|compare/.test(clean)
            ? "comparison"
            : /nakres|diagram|oznac.*obraz/.test(clean)
              ? "diagram"
              : /pravda|true.*false/.test(clean)
                ? "true_false"
                : /a\).*b\)/s.test(text)
                  ? "multiple_choice"
                  : "short_answer";
    const points = text.match(/(\d+(?:[.,]\d+)?)\s*(?:bod|point)/i);
    return {
      text: text.slice(0, 10000),
      topic: topic?.name || "",
      subtopic: "",
      questionType,
      points: points ? Number(points[1].replace(",", ".")) : null,
      keywords: "",
    };
  });
}
export function suggestTopics(text: string): string[] {
  return [
    ...new Set(
      text
        .split("\n")
        .map((s) => s.replace(/^\s*(?:#+|[-•]|\d+[.)])\s*/, "").trim())
        .filter((s) => s.length > 2 && s.length < 90 && !/[?.]$/.test(s)),
    ),
  ].slice(0, 60);
}
