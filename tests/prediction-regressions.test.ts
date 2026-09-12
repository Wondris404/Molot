import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Snapshot, Test, ErrorEntry } from "../lib/types";
import { studentFeatures } from "../ml/student/features";
import { analyzeTeacher } from "../ml/teacher/pattern-engine";
import { predictionTopics } from "../ml/teacher/prediction-topics";

delete process.env.MOLOT_DATA_DIR;
process.env.MOLOT_DATA_SUBDIR = `test-prediction-${randomUUID()}`;

test("exam predictions and saved study plans respect the selected syllabus", async () => {
  const { saveEntity, getSnapshot } = await import("../lib/db");
  const { saveTeacherEntity, teacherSnapshot, saveTestLink } =
    await import("../lib/teacher-db");
  const { testPrediction, savePrediction } =
    await import("../lib/intelligence");
  const subjectId = saveEntity("subjects", {
    name: "TEST Biology",
    color: "#88aa55",
  });
  const teacherId = saveTeacherEntity("teachers", {
    subjectId,
    name: "TEST Teacher",
  });
  const documentId = saveTeacherEntity("documents", {
    subjectId,
    teacherId,
    kind: "test",
    title: "TEST History",
    date: "2025-01-01",
    topics: "Genetika, Fotosyntéza",
  });
  saveTeacherEntity("questions", {
    documentId,
    text: "Vysvetli genetiku.",
    topic: "Genetika",
    points: 10,
    questionType: "explanation",
  });
  const notesId = saveTeacherEntity("documents", {
    subjectId,
    kind: "notes",
    title: "TEST Selected notes",
    topics: "Dýchanie",
  });
  saveTeacherEntity("topics", {
    documentId: notesId,
    name: "Fotosyntéza",
    importance: 1,
  });
  const testId = saveEntity("tests", {
    subjectId,
    title: "TEST Future",
    date: "2099-01-01",
    difficulty: 3,
    targetPercent: 85,
    plannedMinutes: 120,
    status: "planned",
  });
  saveTestLink({ testId, teacherId, materialIds: [notesId] });
  const prediction = testPrediction(testId);
  assert.deepEqual(prediction.teacher?.topics.map((t) => t.name).sort(), [
    "Dýchanie",
    "Fotosyntéza",
  ]);
  assert.deepEqual(prediction.priorities.rows.map((t) => t.name).sort(), [
    "Dýchanie",
    "Fotosyntéza",
  ]);
  assert.equal(
    prediction.teacher?.topics.find((t) => t.name === "Fotosyntéza")?.count,
    1,
  );
  assert.equal(
    prediction.teacher?.topics.find((t) => t.name === "Dýchanie")?.count,
    0,
  );
  assert.equal(
    prediction.priorities.rows.reduce(
      (sum, row) => sum + row.minutes,
      prediction.priorities.reviewMinutes,
    ),
    prediction.time.minutes,
  );
  savePrediction(testId);
  const frozen = JSON.parse(
    teacherSnapshot().predictions[0].payload,
  ) as typeof prediction;
  assert.deepEqual(frozen.teacher?.topics, prediction.teacher?.topics);

  const history = analyzeTeacher(teacherSnapshot(), teacherId);
  assert.ok(
    history.topics.some((t) => t.name === "Genetika"),
    "teacher profile retains full history",
  );
  const exam = getSnapshot().tests.find((t) => t.id === testId)!;
  assert.ok(
    predictionTopics(teacherSnapshot(), history, exam, []).some(
      (t) => t.name === "Genetika",
    ),
  );
  assert.deepEqual(
    predictionTopics(
      teacherSnapshot(),
      history,
      { ...exam, topics: "Nová téma" },
      [],
    ).map((t) => [t.name, t.count, t.score]),
    [["Nová téma", 0, 0]],
  );

  saveTestLink({ testId, teacherId: null, materialIds: [notesId] });
  assert.deepEqual(
    testPrediction(testId)
      .priorities.rows.map((t) => t.name)
      .sort(),
    ["Dýchanie", "Fotosyntéza"],
    "selected notes work without a teacher profile",
  );
  const emptyNotes = saveTeacherEntity("documents", {
    subjectId,
    kind: "notes",
    title: "TEST Not yet classified",
  });
  assert.deepEqual(
    predictionTopics(teacherSnapshot(), history, exam, [emptyNotes]),
    [],
    "unclassified selected notes must not silently substitute unrelated historical topics",
  );
});

test("pre-exam worksheets count as preparation while exam outcomes remain excluded", () => {
  const exam: Test = {
    id: "TEST-exam",
    subjectId: "TEST-subject",
    title: "TEST exam",
    date: "2026-03-10",
    time: "10:00",
    topics: "Fotosyntéza",
    notes: "",
    difficulty: 3,
    targetPercent: 85,
    plannedMinutes: 120,
    status: "planned",
    createdAt: "2026-03-01T09:00:00",
  };
  const answer: ErrorEntry = {
    id: "TEST-answer",
    subjectId: exam.subjectId,
    testId: exam.id,
    materialId: "TEST-material",
    question: "TEST worksheet answer",
    topic: "Fotosyntéza",
    subtopic: "",
    answer: "TEST",
    isCorrect: true,
    errorType: "knowledge",
    note: "",
    date: exam.date,
    createdAt: "2026-03-10T09:00:00",
  };
  const data: Snapshot = {
    subjects: [],
    grades: [],
    tests: [exam],
    results: [],
    sessions: [],
    readiness: [],
    materials: [
      {
        id: "TEST-material",
        subjectId: exam.subjectId,
        testId: exam.id,
        name: "TEST worksheet",
        storageName: "TEST.txt",
        mimeType: "text/plain",
        size: 10,
        createdAt: "2026-03-09T09:00:00",
      },
    ],
    errors: [answer],
    settings: {
      id: "local",
      dailyGoalMinutes: 60,
      baselineMinutes: 60,
      defaultTarget: 85,
    },
    profile: { id: "local", name: "", modules: [], mainGoal: "", onboardingComplete: false, createdAt: "", updatedAt: "" },
    goals: [],
    progressEntries: [],
    milestones: [],
    goalAttachments: [],
  };
  const expected = studentFeatures(exam, data, true);
  assert.equal(expected.worksheetCount, 1);
  assert.equal(expected.worksheetAccuracy, 100);
  assert.equal(studentFeatures(exam, data).worksheetCount, 1);
  data.errors.push(
    { ...answer, id: "TEST-exam-outcome", materialId: null, isCorrect: false },
    {
      ...answer,
      id: "TEST-backdated-outcome",
      date: "2026-03-09",
      createdAt: "2026-03-10T11:00:00",
      isCorrect: false,
    },
    {
      ...answer,
      id: "TEST-missing-material",
      materialId: "missing",
      isCorrect: false,
    },
  );
  assert.deepEqual(studentFeatures(exam, data, true), expected);
  assert.equal(studentFeatures(exam, data).worksheetCount, 1);
  data.materials[0].createdAt = "2026-03-10T11:00:00";
  assert.equal(studentFeatures(exam, data, true).worksheetCount, 0);

  data.sessions = [
    { startTime: "08:00", date: exam.date },
    { startTime: "09:30", date: exam.date },
    { startTime: "11:00", date: exam.date },
    { startTime: "", date: exam.date },
    { startTime: "", date: "2026-03-09" },
  ].map((s, i) => ({
    ...s,
    id: `TEST-session-${i}`,
    subjectId: exam.subjectId,
    testId: exam.id,
    minutes: 60,
    topic: "Fotosyntéza",
    note: "",
    createdAt: "2026-03-10T12:00:00",
  }));
  const historical = studentFeatures(exam, data, true);
  assert.equal(historical.sessions, 2);
  assert.ok(Math.abs(Math.expm1(Number(historical.logMinutes)) - 120) < 1e-8);
  assert.equal(
    studentFeatures({ ...exam, time: "" }, data, true).sessions,
    1,
    "unknown exam time conservatively excludes same-day sessions",
  );
});
