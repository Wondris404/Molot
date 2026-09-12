import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  copyFileSync,
} from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { zipSync, unzipSync } from "fflate";
import { analyzeTeacher } from "../ml/teacher/pattern-engine";
import { suggestQuestions } from "../ml/teacher/extraction";
import { studyPriorities } from "../ml/priority/study-priority";
import { studentFeatures } from "../ml/student/features";
import { predictResult, type PortableModel } from "../ml/student/prediction";
import type { TrainingResult } from "../ml/student/service";

delete process.env.MOLOT_DATA_DIR;
process.env.MOLOT_DATA_SUBDIR = `test-intelligence-${randomUUID()}`;

test("teacher evidence, frozen predictions, safe backup and persistence", async () => {
  const { saveEntity, getSnapshot, getDatabase, databasePath } =
    await import("../lib/db");
  const { saveTeacherEntity, teacherSnapshot, saveTestLink } =
    await import("../lib/teacher-db");
  const { testPrediction, savePrediction, evaluatePrediction } =
    await import("../lib/intelligence");
  const { createBackup, importBackup } = await import("../lib/backups");
  const { teacherDirectory } = await import("../lib/paths");
  const subjectId = saveEntity("subjects", {
    name: "TEST Biology",
    color: "#88aa55",
  });
  saveEntity("grades", {
    subjectId,
    value: 2,
    weight: 2,
    date: "2026-01-01",
    assessmentType: "TEST",
  });
  const teacherId = saveTeacherEntity("teachers", {
    subjectId,
    name: "TEST Teacher",
  });
  const notesId = saveTeacherEntity("documents", {
    subjectId,
    teacherId,
    kind: "notes",
    title: "TEST Notes",
  });
  saveTeacherEntity("topics", {
    documentId: notesId,
    name: "Fotosyntéza",
    keywords: "PSII",
    importance: 1,
  });
  saveTeacherEntity("topics", {
    documentId: notesId,
    name: "Dýchanie",
    importance: 1,
  });
  const docIds = ["2026-01-10", "2026-02-10"].map((date) =>
    saveTeacherEntity("documents", {
      subjectId,
      teacherId,
      kind: "test",
      title: `TEST ${date}`,
      date,
    }),
  );
  for (const documentId of docIds)
    saveTeacherEntity("questions", {
      documentId,
      text: "Vysvetli priebeh fotosyntézy a funkciu PSII.",
      topic: "Fotosyntéza",
      questionType: "explanation",
      points: 4,
    });
  assert.throws(() =>
    saveTeacherEntity("questions", {
      documentId: notesId,
      text: "Wrong parent",
      questionType: "diagram",
    }),
  );
  let teacher = analyzeTeacher(
    teacherSnapshot(),
    teacherId,
    [notesId],
    "2026-03-10",
  );
  assert.equal(teacher.testCount, 2);
  assert.equal(teacher.confidence, "Nízka");
  assert.equal(teacher.topics.find((t) => t.name === "Fotosyntéza")?.count, 2);
  assert.equal(teacher.topics.find((t) => t.name === "Dýchanie")?.count, 0);
  assert.equal(teacher.repetitions.length, 1);
  assert.equal(teacher.styles[0].percent, 100);
  const suggestions = suggestQuestions(
    "1. Vysvetli PSII. (4 body)\n2. Nakresli diagram bunky.",
    teacherSnapshot().topics,
  );
  assert.equal(suggestions.length, 2);
  assert.equal(suggestions[0].topic, "Fotosyntéza");
  assert.equal(suggestions[0].points, 4);
  assert.equal(
    teacherSnapshot().questions.length,
    2,
    "suggestions never become facts automatically",
  );
  const testValues = {
    subjectId,
    title: "TEST Future",
    date: "2026-03-10",
    difficulty: 4,
    targetPercent: 85,
    plannedMinutes: 240,
    status: "planned",
    topics: "Fotosyntéza, Dýchanie",
  };
  const testId = saveEntity("tests", testValues);
  saveEntity("sessions", {
    subjectId,
    testId,
    date: "2026-03-08",
    minutes: 120,
    topic: "Fotosyntéza",
  });
  saveEntity("readiness", {
    testId,
    percent: 60,
    recordedAt: "2026-03-09T10:00:00Z",
  });
  saveEntity("errors", {
    subjectId,
    question: "TEST weak topic",
    topic: "Fotosyntéza",
    isCorrect: false,
    errorType: "knowledge",
    date: "2026-03-01",
  });
  saveTestLink({ testId, teacherId, materialIds: [notesId] });
  const prediction = testPrediction(testId);
  assert.equal(prediction.source, "Baseline");
  assert.ok(Number.isFinite(prediction.expected));
  const priorities = studyPriorities(
    getSnapshot().tests[0],
    getSnapshot(),
    teacher.topics,
    270,
  );
  assert.equal(priorities.rows[0].name, "Fotosyntéza");
  assert.equal(
    priorities.rows.reduce(
      (sum, row) => sum + row.minutes,
      priorities.reviewMinutes,
    ),
    270,
  );
  const predictionId = savePrediction(testId);
  const frozen = teacherSnapshot().predictions[0].payload;
  assert.throws(() =>
    evaluatePrediction({
      id: predictionId,
      topics: ["Fotosyntéza"],
      styles: ["diagram"],
    }),
  );
  saveEntity("results", {
    testId,
    earnedPoints: 42,
    maxPoints: 50,
    percentage: 0,
    grade: 2,
    actualStudyMinutes: 180,
    readinessBefore: 60,
    perceivedDifficulty: 4,
  });
  assert.equal(getSnapshot().results[0].percentage, 84);
  evaluatePrediction({
    id: predictionId,
    topics: ["Fotosyntéza"],
    styles: ["diagram"],
  });
  evaluatePrediction({
    id: predictionId,
    topics: ["Fotosyntéza", "Dýchanie"],
    styles: ["diagram"],
  });
  assert.equal(
    teacherSnapshot().documents.filter((d) => d.source === `molot:${testId}`)
      .length,
    1,
  );
  assert.equal(teacherSnapshot().predictions[0].payload, frozen);
  teacher = analyzeTeacher(
    teacherSnapshot(),
    teacherId,
    [notesId],
    "2026-04-01",
  );
  assert.equal(teacher.testCount, 3);
  assert.equal(teacher.styles.find((s) => s.type === "diagram")?.count, 1);
  assert.equal(teacher.timeline.at(-1)?.count, 2);
  assert.equal(
    analyzeTeacher(teacherSnapshot(), teacherId, [notesId], "2026-03-10")
      .testCount,
    2,
    "future/outcome test excluded at prediction cutoff",
  );
  const featuresBefore = studentFeatures(
    getSnapshot().tests[0],
    getSnapshot(),
    true,
  );
  saveEntity("errors", {
    subjectId,
    testId,
    question: "TEST outcome",
    topic: "Fotosyntéza",
    isCorrect: false,
    errorType: "knowledge",
    date: "2026-03-10",
  });
  assert.deepEqual(
    studentFeatures(getSnapshot().tests[0], getSnapshot(), true),
    featuresBefore,
    "target exam answers cannot leak into training features",
  );
  mkdirSync(teacherDirectory, { recursive: true });
  const stored = `${randomUUID()}.txt`;
  writeFileSync(path.join(teacherDirectory, stored), "TEST document content");
  getDatabase()
    .prepare(
      "UPDATE TeacherDocument SET storageName=?,mimeType='text/plain' WHERE id=?",
    )
    .run(stored, docIds[0]);
  const backup = createBackup();
  saveEntity("subjects", { name: "TEST after backup", color: "#ffffff" });
  const malicious = zipSync({
    ...unzipSync(backup.bytes),
    "../outside.txt": new Uint8Array([1]),
  });
  assert.throws(() => importBackup(malicious));
  assert.equal(getSnapshot().subjects.length, 2);
  const missing = unzipSync(backup.bytes);
  delete missing[`teacher-tests/${stored}`];
  assert.throws(() => importBackup(zipSync(missing)));
  assert.equal(getSnapshot().subjects.length, 2);
  importBackup(backup.bytes);
  assert.equal(getSnapshot().subjects.length, 1);
  assert.equal(getSnapshot().grades.length, 1);
  assert.equal(teacherSnapshot().predictions[0].payload, frozen);
  const restoredName = teacherSnapshot().documents.find(
    (d) => d.id === docIds[0],
  )!.storageName!;
  assert.notEqual(restoredName, stored);
  assert.equal(
    readFileSync(path.join(teacherDirectory, restoredName), "utf8"),
    "TEST document content",
  );
  assert.ok(
    existsSync(path.join(teacherDirectory, stored)),
    "original files are preserved",
  );
  const reopened = new DatabaseSync(databasePath, { readOnly: true });
  assert.equal(
    reopened.prepare("SELECT COUNT(*) AS n FROM TestResult").get()?.n,
    1,
  );
  assert.equal(reopened.prepare("PRAGMA user_version").get()?.user_version, 5);
  reopened.close();
});

test("v1 migration preserves existing school records and creates a recovery copy", async () => {
  const { getDatabase } = await import("../lib/db");
  getDatabase();
  const { backupDirectory, dataDirectory } = await import("../lib/paths");
  const { migrateIntelligence } = await import("../lib/migrations");
  const original = readdirSync(backupDirectory).find((name) =>
    name.startsWith("before-v2-"),
  );
  assert.ok(original);
  const fixture = path.join(dataDirectory, "TEST-v1-migration.sqlite");
  copyFileSync(path.join(backupDirectory, original), fixture);
  const legacy = new DatabaseSync(fixture);
  const subjectId = randomUUID();
  legacy
    .prepare("INSERT INTO Subject VALUES(?,?,?,?)")
    .run(subjectId, "TEST Preserved", "#88aa55", "2025-01-01T00:00:00Z");
  legacy
    .prepare("INSERT INTO Grade VALUES(?,?,?,?,?,?,?,?)")
    .run(
      randomUUID(),
      subjectId,
      1,
      3,
      "2025-01-02",
      "TEST existing grade",
      "TEST",
      "2025-01-02T00:00:00Z",
    );
  legacy.exec("UPDATE Settings SET dailyGoalMinutes=95");
  const before = new Set(readdirSync(backupDirectory));
  migrateIntelligence(legacy);
  assert.equal(legacy.prepare("PRAGMA user_version").get()?.user_version, 5);
  assert.equal(legacy.prepare("SELECT weight FROM Grade").get()?.weight, 3);
  assert.equal(
    legacy.prepare("SELECT dailyGoalMinutes FROM Settings").get()
      ?.dailyGoalMinutes,
    95,
  );
  const recoveryName = readdirSync(backupDirectory).find(
    (name) => !before.has(name) && name.startsWith("before-v2-"),
  );
  assert.ok(recoveryName);
  const recovery = new DatabaseSync(path.join(backupDirectory, recoveryName), {
    readOnly: true,
  });
  assert.equal(recovery.prepare("PRAGMA user_version").get()?.user_version, 1);
  assert.equal(
    recovery.prepare("SELECT name FROM Subject").get()?.name,
    "TEST Preserved",
  );
  recovery.close();
  legacy.close();
});

test(
  "DEMO only: real temporal ML training and portable inference parity",
  { timeout: 180000 },
  async () => {
    const { callPython } = await import("../ml/common/python-bridge");
    const insufficient = await callPython<TrainingResult>({
      operation: "train",
      samples: [],
    });
    assert.equal(insufficient.status, "insufficient");
    const samples = Array.from({ length: 80 }, (_, i) => {
      const readiness = 20 + ((i * 37) % 80);
      const difficulty = 1 + (i % 5);
      return {
        id: `DEMO-${i}`,
        date: new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10),
        features: {
          subject: i % 2 ? "DEMO-Biology" : "DEMO-Math",
          readiness,
          difficulty,
          logMinutes: Math.log1p(30 + ((i * 17) % 300)),
        },
        target: 30 + 0.65 * readiness - 3 * difficulty,
        baseline: 50,
      };
    });
    const result = await callPython<TrainingResult>(
      { operation: "train", samples },
      170000,
    );
    assert.equal(result.status, "activated");
    assert.equal(result.candidates?.length, 3);
    assert.ok(result.mae! < result.baselineMae!);
    assert.ok(result.holdoutSize! > 0 && result.holdoutSize! < samples.length);
    const model: PortableModel = {
      ...result.model!,
      algorithm: result.algorithm!,
      version: "DEMO-only",
      numberOfSamples: samples.length,
      mae: result.mae!,
      rmse: result.rmse!,
    };
    const { dataDirectory } = await import("../lib/paths");
    mkdirSync(dataDirectory, { recursive: true });
    const filename = path.join(dataDirectory, "DEMO-model.json");
    writeFileSync(filename, JSON.stringify(model));
    const reloaded = JSON.parse(
      readFileSync(filename, "utf8"),
    ) as PortableModel;
    samples
      .slice(0, 3)
      .forEach((sample, i) =>
        assert.ok(
          Math.abs(
            predictResult(sample.features, reloaded) -
              result.referencePredictions![i],
          ) < 1e-6,
        ),
      );
  },
);
