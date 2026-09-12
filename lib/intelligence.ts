import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError, getDatabase, getSnapshot, transaction } from "./db";
import { teacherSnapshot, saveTeacherEntity } from "./teacher-db";
import { analyzeTeacher } from "../ml/teacher/pattern-engine";
import { predictionTopics } from "../ml/teacher/prediction-topics";
import { studentFeatures, baselineResult } from "../ml/student/features";
import { activeStudentModel } from "../ml/student/service";
import { predictResult, solveStudyTime } from "../ml/student/prediction";
import { studyPriorities } from "../ml/priority/study-priority";
import { normalize, setMetrics } from "../ml/common/text";
import { recommendStudyTime } from "./recommendationEngine";

export function testPrediction(testId: string) {
  const data = getSnapshot(),
    teacherData = teacherSnapshot();
  const test = data.tests.find((t) => t.id === testId);
  if (!test) throw new AppError("Test neexistuje.", 404);
  const link = teacherData.links.find((l) => l.testId === testId);
  const materialIds: string[] = link ? JSON.parse(link.materialIds) : [];
  const teacherHistory = link?.teacherId
    ? analyzeTeacher(teacherData, link.teacherId, materialIds, test.date)
    : null;
  const features = studentFeatures(test, data);
  let model = activeStudentModel();
  if (
    data.results.length < 30 ||
    !model?.features.includes(`subject=${test.subjectId}`)
  )
    model = null;
  let expected = baselineResult(features);
  try {
    expected = predictResult(features, model);
  } catch {
    model = null;
  }
  const baseline = recommendStudyTime(test, data);
  const time = solveStudyTime(
    features,
    test.targetPercent,
    model,
    baseline.minutes,
  );
  const topicEvidence = predictionTopics(
    teacherData,
    teacherHistory,
    test,
    materialIds,
  );
  const teacher = teacherHistory
    ? { ...teacherHistory, topics: topicEvidence }
    : null;
  const priorities = studyPriorities(test, data, topicEvidence, time.minutes);
  const uncertainty = model ? Math.max(8, model.mae * 1.5) : 20;
  return {
    testId,
    teacherId: link?.teacherId ?? null,
    createdAt: new Date().toISOString(),
    expected: Math.round(expected),
    lowerResult: Math.max(0, Math.round(expected - uncertainty)),
    upperResult: Math.min(100, Math.round(expected + uncertainty)),
    source: model ? "Personalizovaný model" : "Baseline",
    modelVersion: model?.version ?? null,
    confidence: model
      ? model.numberOfSamples >= 80 && model.mae <= 6
        ? "Vysoká"
        : "Stredná"
      : "Nízka",
    features,
    time,
    teacher,
    priorities,
    target: test.targetPercent,
    reasons: [
      ...baseline.reasons,
      `Odhad výsledku používa náročnosť ${test.difficulty}/5, pripravenosť ${features.readiness} %, ${features.sessions} záznamov učenia a ${features.worksheetCount} starších označených odpovedí.`,
      model
        ? `Model bol overený mimo tréningovej časti histórie; MAE ${model.mae.toFixed(1)} percentuálneho bodu.`
        : "Zatiaľ nie je dostatok historických údajov alebo overený model pre tento predmet. Výsledok je hrubý deterministický odhad.",
    ],
    warning: baseline.warning,
  };
}
export function savePrediction(testId: string) {
  const test = getSnapshot().tests.find((t) => t.id === testId);
  if (!test || !["planned", "preparing"].includes(test.status))
    throw new AppError("Predikciu možno uložiť pred napísaním testu.");
  const payload = testPrediction(testId),
    id = randomUUID();
  getDatabase()
    .prepare(
      "INSERT INTO TeacherPrediction(id,testId,teacherId,payload,createdAt) VALUES(?,?,?,?,?)",
    )
    .run(
      id,
      testId,
      payload.teacherId,
      JSON.stringify(payload),
      payload.createdAt,
    );
  return id;
}
export function evaluatePrediction(input: unknown) {
  const value = z
    .object({
      id: z.string().uuid(),
      topics: z.array(z.string().trim().min(1).max(200)).max(100),
      styles: z
        .array(
          z.enum([
            "multiple_choice",
            "short_answer",
            "definition",
            "explanation",
            "calculation",
            "comparison",
            "diagram",
            "fill_in",
            "essay",
            "true_false",
          ]),
        )
        .max(10),
    })
    .parse(input);
  const row = teacherSnapshot().predictions.find((p) => p.id === value.id);
  if (!row) throw new AppError("Predikcia neexistuje.");
  const test = getSnapshot().tests.find((t) => t.id === row.testId)!;
  if (!["written", "evaluated"].includes(test.status))
    throw new AppError("Najprv označ test ako napísaný alebo pridaj výsledok.");
  const payload = JSON.parse(row.payload) as ReturnType<typeof testPrediction>;
  const predicted =
    payload.teacher?.topics.filter((t) => t.score >= 35).map((t) => t.name) ??
    [];
  const styles =
    payload.teacher?.styles.filter((s) => s.percent >= 15).map((s) => s.type) ??
    [];
  const topicMetrics = setMetrics(predicted, value.topics),
    styleMetrics = setMetrics(styles, value.styles);
  transaction(() => {
    const db = getDatabase();
    db.prepare(
      "UPDATE TeacherPrediction SET actualTopics=?,actualStyles=?,precision=?,recall=?,stylePrecision=?,styleRecall=? WHERE id=?",
    ).run(
      JSON.stringify(value.topics),
      JSON.stringify(value.styles),
      topicMetrics.precision,
      topicMetrics.recall,
      styleMetrics.precision,
      styleMetrics.recall,
      value.id,
    );
  });
  // A completed test becomes fresh evidence once, including subsequent corrections.
  if (row.teacherId) {
    const source = `molot:${test.id}`;
    const previous = teacherSnapshot().documents.find(
      (d) => d.source === source,
    );
    saveTeacherEntity(
      "documents",
      {
        teacherId: row.teacherId,
        subjectId: test.subjectId,
        kind: "test",
        title: test.title,
        date: test.date,
        topics: value.topics.join(", "),
        testType: value.styles.join(", "),
        source,
        notes: "Témy a štýly ručne potvrdené po teste.",
      },
      previous?.id,
    );
  }
  return {
    ...topicMetrics,
    stylePrecision: styleMetrics.precision,
    styleRecall: styleMetrics.recall,
  };
}
export function actualTopicChart(testId: string) {
  return teacherSnapshot()
    .predictions.filter((p) => p.testId === testId && p.actualTopics !== null)
    .flatMap((p) => {
      const payload = JSON.parse(p.payload) as ReturnType<
        typeof testPrediction
      >;
      const actual = JSON.parse(p.actualTopics!) as string[];
      return (payload.teacher?.topics ?? []).map((t) => ({
        name: t.name,
        predicted: t.score,
        actual: actual.some((a) => normalize(a) === normalize(t.name))
          ? 100
          : 0,
      }));
    });
}
