import type { Test } from "../../lib/types";
import { normalize, splitTopics } from "../common/text";
import type { TeacherAnalysis, TeacherSnapshot, TopicEvidence } from "./types";

// Teacher profiles retain the entire history. An upcoming exam uses only its
// explicit syllabus when topics or learning materials have been selected.
export function predictionTopics(
  data: TeacherSnapshot,
  analysis: TeacherAnalysis | null,
  test: Pick<Test, "subjectId" | "topics">,
  materialIds: string[],
): TopicEvidence[] {
  const notes = data.documents.filter(
    (d) =>
      d.kind === "notes" &&
      d.subjectId === test.subjectId &&
      materialIds.includes(d.id),
  );
  const materialTopics = data.topics.filter((t) =>
    notes.some((d) => d.id === t.documentId),
  );
  const explicit = splitTopics(test.topics);
  if (!notes.length && !explicit.length) return analysis?.topics ?? [];
  const names = new Map<string, string>();
  for (const name of [
    ...explicit,
    ...notes.flatMap((d) => splitTopics(d.topics)),
    ...materialTopics.map((t) => t.name),
  ]) {
    const key = normalize(name);
    if (key) names.set(key, name);
  }
  return [...names]
    .map(([key, name]): TopicEvidence => {
      const historical = analysis?.topics.find(
        (t) => normalize(t.name) === key,
      );
      if (historical) return { ...historical, name };
      return {
        name,
        score: 0,
        count: 0,
        totalTests: analysis?.testCount ?? 0,
        points: 0,
        recency: 0,
        repeated: 0,
        materialImportance: Math.max(
          0,
          ...materialTopics
            .filter((t) => normalize(t.name) === key)
            .map((t) => t.importance),
        ),
        priority: "Nízka",
        evidence:
          "Téma zo zadaného učiva; bez historického výskytu v dostupných testoch.",
      };
    })
    .sort((a, b) => b.score - a.score);
}
