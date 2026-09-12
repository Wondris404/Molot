import { normalize, splitTopics, textSimilarity } from "../common/text";
import {
  questionTypes,
  type TeacherSnapshot,
  type TeacherAnalysis,
} from "./types";

export function analyzeTeacher(
  data: TeacherSnapshot,
  teacherId: string,
  materialIds: string[] = [],
  cutoff = "9999-12-31",
): TeacherAnalysis {
  const teacher = data.teachers.find((t) => t.id === teacherId);
  const documents = data.documents.filter(
    (d) =>
      d.teacherId === teacherId &&
      d.kind === "test" &&
      (!d.date || d.date < cutoff),
  );
  const documentIds = new Set(documents.map((d) => d.id));
  const questions = data.questions.filter((q) => documentIds.has(q.documentId));
  const notes = data.documents.filter(
    (d) =>
      d.kind === "notes" &&
      d.subjectId === teacher?.subjectId &&
      (materialIds.length
        ? materialIds.includes(d.id)
        : !d.teacherId || d.teacherId === teacherId),
  );
  const materialTopics = data.topics.filter((t) =>
    notes.some((d) => d.id === t.documentId),
  );
  const names = new Map<string, string>();
  for (const name of [
    ...materialTopics.map((t) => t.name),
    ...questions.flatMap((q) => splitTopics(q.topic)),
    ...documents.flatMap((d) => splitTopics(d.topics)),
  ])
    names.set(normalize(name), name);
  const repetitions: TeacherAnalysis["repetitions"] = [];
  for (let i = 0; i < questions.length; i++)
    for (let j = i + 1; j < questions.length; j++) {
      if (questions[i].documentId === questions[j].documentId) continue;
      const similarity = textSimilarity(questions[i].text, questions[j].text);
      if (similarity >= 0.75)
        repetitions.push({
          firstId: questions[i].id,
          secondId: questions[j].id,
          similarity,
        });
    }
  const reference = cutoff === "9999-12-31" ? Date.now() : Date.parse(cutoff);
  const recency = (date: string) =>
    date
      ? Math.exp(-Math.max(0, (reference - Date.parse(date)) / 86400000) / 730)
      : 0.35;
  const recencyTotal = documents.reduce((sum, d) => sum + recency(d.date), 0);
  const totalPoints = questions.reduce((sum, q) => sum + (q.points ?? 0), 0);
  const weightTotal =
    Object.values(data.weights).reduce((a, b) => a + b, 0) || 1;
  const topics = [...names]
    .map(([key, name]) => {
      const aliases = materialTopics
        .filter((t) => normalize(t.name) === key)
        .flatMap((t) => splitTopics(t.keywords))
        .map(normalize);
      const matching = questions.filter(
        (q) =>
          splitTopics(q.topic).some((t) => normalize(t) === key) ||
          [key, ...aliases].some(
            (term) =>
              term.length > 1 && ` ${normalize(q.text)} `.includes(` ${term} `),
          ),
      );
      const seen = documents.filter(
        (d) =>
          matching.some((q) => q.documentId === d.id) ||
          splitTopics(d.topics).some((t) => normalize(t) === key),
      );
      const points = matching.reduce((sum, q) => sum + (q.points ?? 0), 0);
      const repeated = repetitions.filter((p) =>
        matching.some((q) => q.id === p.firstId || q.id === p.secondId),
      ).length;
      const materialImportance = Math.max(
        0,
        ...materialTopics
          .filter((t) => normalize(t.name) === key)
          .map((t) => t.importance),
      );
      const frequency = seen.length / Math.max(1, documents.length);
      const recent =
        seen.reduce((sum, d) => sum + recency(d.date), 0) /
        Math.max(0.01, recencyTotal);
      const components = {
        frequency,
        recency: recent,
        points: points / Math.max(1, totalPoints),
        repetition: Math.min(1, repeated / Math.max(1, documents.length - 1)),
        material: materialImportance,
      };
      const score = documents.length
        ? Math.round(
            (100 *
              Object.entries(data.weights).reduce(
                (sum, [k, v]) =>
                  sum + v * components[k as keyof typeof components],
                0,
              )) /
              weightTotal,
          )
        : 0;
      return {
        name,
        score,
        count: seen.length,
        totalTests: documents.length,
        points,
        recency: Math.round(100 * recent),
        repeated,
        materialImportance,
        priority:
          score >= 65
            ? ("Vysoká" as const)
            : score >= 35
              ? ("Stredná" as const)
              : ("Nízka" as const),
        evidence: `${seen.length} z ${documents.length} historických testov · ${points} označených bodov · ${repeated} podobných dvojíc otázok`,
      };
    })
    .sort((a, b) => b.score - a.score);
  // A confirmed whole-test style is one observation when individual questions
  // were not entered. Never fabricate a question count from this metadata.
  const observedStyles = [
    ...questions.map((q) => q.questionType),
    ...documents
      .filter((d) => !questions.some((q) => q.documentId === d.id))
      .flatMap((d) =>
        splitTopics(d.testType).filter((type) => type in questionTypes),
      ),
  ];
  const styles = Object.entries(questionTypes)
    .map(([type, name]) => ({
      type,
      name,
      count: observedStyles.filter((style) => style === type).length,
      percent:
        (100 * observedStyles.filter((style) => style === type).length) /
        Math.max(1, observedStyles.length),
    }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);
  return {
    topics,
    styles,
    testCount: documents.length,
    confidence:
      documents.length >= 12
        ? "Vysoká"
        : documents.length >= 4
          ? "Stredná"
          : "Nízka",
    timeline: documents
      .filter((d) => d.date)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        name: d.date,
        count: new Set(
          [
            ...splitTopics(d.topics),
            ...questions
              .filter((q) => q.documentId === d.id)
              .flatMap((q) => splitTopics(q.topic)),
          ]
            .map(normalize)
            .filter(Boolean),
        ).size,
        points: questions
          .filter((q) => q.documentId === d.id)
          .reduce((sum, q) => sum + (q.points ?? 0), 0),
      })),
    repetitions,
  };
}
