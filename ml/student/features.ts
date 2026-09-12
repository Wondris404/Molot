import type { Snapshot, Test } from "../../lib/types";
import { currentReadiness, average, studiedMinutes } from "../../lib/analytics";

export type Features = Record<string, string | number>;
export interface TrainingSample {
  id: string;
  date: string;
  features: Features;
  target: number;
  baseline: number;
}
export function studentFeatures(
  test: Test,
  data: Snapshot,
  historical = false,
): Features {
  const result = historical
    ? data.results.find((r) => r.testId === test.id)
    : undefined;
  const cutoff = `${test.date}T${test.time || "00:00"}:00`;
  const before = (date: string) =>
    new Date(date).getTime() < new Date(cutoff).getTime();
  const sessions = data.sessions.filter((s) => {
    if (s.testId !== test.id) return false;
    if (!historical || s.date < test.date) return true;
    // Same-day preparation counts only when its end is known to precede the exam.
    if (s.date !== test.date || !test.time || !s.startTime) return false;
    const end =
      new Date(`${s.date}T${s.startTime}:00`).getTime() + s.minutes * 60000;
    return end <= new Date(cutoff).getTime();
  });
  const readiness = data.readiness.filter(
    (r) => r.testId === test.id && (!historical || before(r.recordedAt)),
  );
  const answers = data.errors.filter((e) => {
    if (e.subjectId !== test.subjectId) return false;
    if (e.testId === test.id) {
      // A linked worksheet completed before the exam is preparation. Exam
      // outcomes and answers entered after the exam must never become predictors.
      const material = data.materials.find((m) => m.id === e.materialId);
      return Boolean(
        material &&
        material.subjectId === test.subjectId &&
        before(material.createdAt) &&
        before(e.createdAt) &&
        e.date <= test.date,
      );
    }
    return !historical || (e.date < test.date && before(e.createdAt));
  });
  const prior = data.results.filter((r) => {
    const previous = data.tests.find((t) => t.id === r.testId);
    return (
      previous &&
      previous.subjectId === test.subjectId &&
      previous.date < test.date &&
      r.testId !== test.id
    );
  });
  const minutes =
    result?.actualStudyMinutes ??
    (historical
      ? sessions.reduce((sum, s) => sum + s.minutes, 0)
      : studiedMinutes(data, test.id));
  const firstDate = sessions.map((s) => s.date).sort()[0];
  return {
    subject: test.subjectId,
    topic:
      test.topics
        .split(/[,;\n]/)[0]
        .trim()
        .toLocaleLowerCase("sk") || "unknown",
    difficulty: test.difficulty,
    target: test.targetPercent,
    logMinutes: Math.log1p(minutes),
    sessions: sessions.length,
    preparationDays: firstDate
      ? Math.max(0, (Date.parse(test.date) - Date.parse(firstDate)) / 86400000)
      : 0,
    readiness:
      result?.readinessBefore ??
      currentReadiness({ ...data, readiness }, test.id) ??
      50,
    readinessMissing: result || readiness.length ? 0 : 1,
    readinessChange:
      readiness.length > 1
        ? [...readiness].sort((a, b) =>
            b.recordedAt.localeCompare(a.recordedAt),
          )[0].percent -
          [...readiness].sort((a, b) =>
            a.recordedAt.localeCompare(b.recordedAt),
          )[0].percent
        : 0,
    worksheetAccuracy: answers.length
      ? (100 * answers.filter((a) => a.isCorrect).length) / answers.length
      : 50,
    worksheetCount: answers.length,
    errorCount: answers.filter((a) => !a.isCorrect).length,
    knowledgeErrors: answers.filter(
      (a) => !a.isCorrect && a.errorType === "knowledge",
    ).length,
    carelessErrors: answers.filter(
      (a) => !a.isCorrect && a.errorType === "careless",
    ).length,
    priorPerformance: average(prior.map((r) => r.percentage)) ?? 65,
    priorCount: prior.length,
  };
}
export function baselineResult(features: Features): number {
  const n = (key: string) => Number(features[key]);
  const evidence = n("worksheetCount")
    ? n("worksheetAccuracy")
    : n("priorPerformance");
  return Math.min(
    99,
    Math.max(
      5,
      18 +
        0.36 * n("readiness") +
        0.22 * n("priorPerformance") +
        0.12 * evidence +
        8 * Math.log1p(Math.expm1(n("logMinutes")) / 60) -
        4 * (n("difficulty") - 3),
    ),
  );
}
export function trainingSamples(data: Snapshot): TrainingSample[] {
  return data.tests
    .filter((t) => data.results.some((r) => r.testId === t.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((test) => {
      const features = studentFeatures(test, data, true);
      return {
        id: test.id,
        date: test.date,
        features,
        baseline: baselineResult(features),
        target: data.results.find((r) => r.testId === test.id)!.percentage,
      };
    });
}
