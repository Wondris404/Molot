import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  weightedAverage,
  currentReadiness,
  studyTotals,
  topicStats,
} from "../lib/analytics";
import { daysUntil, weekStart } from "../lib/format";
import { recommendStudyTime } from "../lib/recommendationEngine";
import { chartData } from "../lib/chart-data";
import type { Snapshot, Test, TestResult } from "../lib/types";

process.env.MOLOT_DATA_SUBDIR = `test-core-${randomUUID()}`;
delete process.env.MOLOT_DATA_DIR;

test("SQLite lifecycle, validation, analytics, and persistence", async (t) => {
  const { saveEntity, deleteEntity, getSnapshot, getDatabase, databasePath } =
    await import("../lib/db");
  let subjectId = "";
  let otherSubjectId = "";
  let testId = "";
  let gradeId = "";
  let sessionId = "";
  let resultId = "";
  await t.test("initializes an empty database", () => {
    const data = getSnapshot();
    assert.equal(data.subjects.length, 0);
    assert.equal(data.tests.length, 0);
    assert.equal(data.settings.baselineMinutes, 120);
  });
  await t.test("creates subjects and computes weighted averages", () => {
    subjectId = saveEntity("subjects", {
      name: "TEST Matematika",
      color: "#c5ef79",
    });
    otherSubjectId = saveEntity("subjects", {
      name: "TEST Biológia",
      color: "#a1c4b4",
    });
    const input = {
      subjectId,
      value: 1,
      weight: 2,
      date: "2026-09-01",
      description: "TEST známka",
      assessmentType: "Písomka",
    };
    gradeId = saveEntity("grades", input);
    saveEntity("grades", { ...input, value: 3, weight: 1 });
    assert.equal(weightedAverage(getSnapshot().grades), 5 / 3);
    assert.throws(() => saveEntity("grades", { ...input, weight: 0 }));
    assert.throws(() => saveEntity("grades", { ...input, value: 6 }));
    assert.throws(() =>
      saveEntity("subjects", { name: "TEST Matematika", color: "#ffffff" }),
    );
    saveEntity("grades", { ...input, value: 2 }, gradeId);
    assert.equal(weightedAverage(getSnapshot().grades), 7 / 3);
  });
  await t.test(
    "creates tests and rejects inconsistent relationships atomically",
    () => {
      const input = {
        subjectId,
        title: "TEST Rovnice",
        date: "2026-09-10",
        time: "09:30",
        topics: "Rovnice",
        notes: "",
        difficulty: 3,
        targetPercent: 85,
        plannedMinutes: 240,
        status: "planned",
        initialReadiness: 30,
      };
      testId = saveEntity("tests", input);
      assert.equal(currentReadiness(getSnapshot(), testId), 30);
      assert.throws(() =>
        saveEntity("tests", { ...input, date: "2026-02-30" }),
      );
      assert.throws(() =>
        saveEntity("tests", { ...input, status: "evaluated" }),
      );
      assert.throws(() =>
        saveEntity("tests", { ...input, initialReadiness: 101 }),
      );
      assert.equal(getSnapshot().tests.length, 1);
      const session = {
        subjectId,
        testId,
        date: "2026-09-08",
        startTime: "18:00",
        minutes: 90,
        topic: "Rovnice",
        note: "",
      };
      sessionId = saveEntity("sessions", session);
      assert.throws(() =>
        saveEntity("sessions", { ...session, subjectId: otherSubjectId }),
      );
      assert.throws(() => saveEntity("sessions", { ...session, minutes: -1 }));
      assert.throws(() =>
        saveEntity("tests", { ...input, subjectId: otherSubjectId }, testId),
      );
      saveEntity("sessions", { ...session, minutes: 120 }, sessionId);
      assert.equal(studyTotals(getSnapshot(), "2026-09-09").week, 120);
      assert.equal(studyTotals(getSnapshot(), "2026-09-08").today, 120);
    },
  );
  await t.test(
    "preserves timestamped readiness including backdated edits",
    () => {
      const id = saveEntity("readiness", {
        testId,
        percent: 75,
        recordedAt: "2026-09-09T18:00:00Z",
        note: "",
      });
      saveEntity("readiness", {
        testId,
        percent: 50,
        recordedAt: "2026-09-07T18:00:00Z",
        note: "",
      });
      // The initial record is generated now. Make it historical to remove wall-clock dependence.
      const initial = getSnapshot().readiness.find(
        (r) => r.note === "Úvodný záznam",
      )!;
      saveEntity(
        "readiness",
        { ...initial, recordedAt: "2026-09-05T18:00:00Z" },
        initial.id,
      );
      assert.equal(currentReadiness(getSnapshot(), testId), 75);
      saveEntity(
        "readiness",
        { testId, percent: 80, recordedAt: "2026-09-09T18:00:00Z", note: "" },
        id,
      );
      assert.equal(currentReadiness(getSnapshot(), testId), 80);
      assert.equal(getSnapshot().readiness.length, 3);
      assert.throws(() =>
        saveEntity("readiness", {
          testId,
          percent: 101,
          recordedAt: "2026-09-09T18:00:00Z",
        }),
      );
    },
  );
  await t.test(
    "computes points and freezes the original recommendation",
    () => {
      const input = {
        testId,
        earnedPoints: 42,
        maxPoints: 50,
        percentage: 0,
        grade: 2,
        actualStudyMinutes: 120,
        readinessBefore: 80,
        perceivedDifficulty: 3,
        note: "TEST výsledok",
      };
      resultId = saveEntity("results", input);
      const result = getSnapshot().results[0];
      assert.equal(result.percentage, 84);
      assert.equal(getSnapshot().tests[0].status, "evaluated");
      const prediction = result.recommendedMinutes;
      saveEntity(
        "settings",
        { dailyGoalMinutes: 60, baselineMinutes: 240, defaultTarget: 85 },
        "local",
      );
      saveEntity("results", { ...input, earnedPoints: 45 }, resultId);
      assert.equal(getSnapshot().results[0].percentage, 90);
      assert.equal(getSnapshot().results[0].recommendedMinutes, prediction);
      assert.throws(() =>
        saveEntity("results", { ...input, earnedPoints: 51 }, resultId),
      );
      assert.throws(() =>
        saveEntity("results", { ...input, maxPoints: 0 }, resultId),
      );
      assert.throws(() =>
        saveEntity("results", { ...input, earnedPoints: null }, resultId),
      );
    },
  );
  await t.test(
    "aggregates correct and incorrect answers, and chart sources",
    () => {
      const input = {
        subjectId,
        testId,
        materialId: null,
        question: "TEST Otázka 1",
        topic: "Rovnice",
        subtopic: "Lineárne",
        answer: "x=3",
        isCorrect: false,
        errorType: "calculation",
        note: "",
        date: "2026-09-09",
      };
      saveEntity("errors", input);
      saveEntity("errors", {
        ...input,
        question: "TEST Otázka 2",
        isCorrect: true,
      });
      const data = getSnapshot();
      const stats = topicStats(data);
      assert.equal(stats[0].success, 50);
      assert.equal(stats[0].total, 2);
      assert.equal(stats[0].mistakes, 1);
      const charts = chartData(data);
      assert.equal(charts.scatter[0].minutes, 120);
      assert.equal(charts.scatter[0].result, 90);
      assert.equal(
        charts.errorsBySubject.find((s) => s.name === "TEST Matematika")
          ?.mistakes,
        1,
      );
      assert.equal(charts.errorTypes[0].mistakes, 1);
      assert.equal(
        charts.recommendationComparison[0].recommended,
        data.results[0].recommendedMinutes,
      );
    },
  );
  await t.test("persists data for a fresh Node process", () => {
    const output = spawnSync(
      process.execPath,
      [
        "-e",
        "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.env.MOLOT_TEST_DATABASE,{readOnly:true});console.log(JSON.stringify(db.prepare('SELECT COUNT(*) AS total FROM Grade').get()));db.close();",
      ],
      {
        env: { ...process.env, MOLOT_TEST_DATABASE: databasePath },
        encoding: "utf8",
      },
    );
    assert.equal(output.status, 0, output.stderr);
    assert.equal(JSON.parse(output.stdout).total, 2);
    assert.deepEqual(
      getDatabase().prepare("PRAGMA foreign_key_check").all(),
      [],
    );
  });
  await t.test(
    "deletes records consistently without deleting unrelated subjects",
    () => {
      deleteEntity("results", resultId);
      assert.equal(getSnapshot().tests[0].status, "written");
      deleteEntity("grades", gradeId);
      assert.equal(getSnapshot().grades.length, 1);
      deleteEntity("tests", testId);
      assert.equal(getSnapshot().readiness.length, 0);
      assert.equal(getSnapshot().sessions[0].testId, null);
      assert.equal(getSnapshot().errors[0].testId, null);
      deleteEntity("subjects", subjectId);
      assert.equal(getSnapshot().sessions.length, 0);
      assert.equal(getSnapshot().errors.length, 0);
      assert.equal(getSnapshot().grades.length, 0);
      assert.equal(getSnapshot().subjects[0].id, otherSubjectId);
      deleteEntity("subjects", otherSubjectId);
    },
  );
});

const empty: Snapshot = {
  subjects: [],
  grades: [],
  tests: [],
  results: [],
  sessions: [],
  readiness: [],
  materials: [],
  errors: [],
  settings: {
    id: "local",
    dailyGoalMinutes: 60,
    baselineMinutes: 120,
    defaultTarget: 85,
  },
  profile: { id: "local", name: "", modules: [], mainGoal: "", onboardingComplete: false, createdAt: "", updatedAt: "" },
  goals: [],
  progressEntries: [],
  milestones: [],
  goalAttachments: [],
};
const target: Test = {
  id: "new",
  createdAt: "2026-09-01T00:00:00Z",
  subjectId: "math",
  title: "New test",
  date: "2026-09-10",
  time: "",
  topics: "Rovnice",
  notes: "",
  difficulty: 3,
  targetPercent: 85,
  plannedMinutes: 0,
  status: "planned",
};
function history(readiness: number, result: number, count = 1): Snapshot {
  const tests = Array.from({ length: count }, (_, index): Test => ({
    ...target,
    id: `past-${index}`,
    date: "2026-09-01",
    status: "evaluated",
  }));
  const results = tests.map((test, index): TestResult => ({
    id: `result-${index}`,
    createdAt: test.createdAt,
    testId: test.id,
    earnedPoints: null,
    maxPoints: null,
    percentage: result,
    grade: null,
    actualStudyMinutes: 180,
    readinessBefore: readiness,
    perceivedDifficulty: 3,
    note: "",
    recommendedMinutes: 180,
  }));
  return { ...empty, tests: [...tests, target], results };
}
test("baseline stays explainable and target/difficulty influence time", () => {
  const baseline = recommendStudyTime(target, empty);
  assert.equal(baseline.confidence, "Nízka");
  assert.equal(baseline.sampleCount, 0);
  assert.ok(baseline.lowerMinutes < baseline.minutes);
  assert.ok(baseline.upperMinutes > baseline.minutes);
  assert.ok(
    recommendStudyTime({ ...target, difficulty: 5, targetPercent: 100 }, empty)
      .minutes > baseline.minutes,
  );
  assert.equal(baseline.minutes % 15, 0);
});
test("recommendations distinguish all four readiness/result combinations", () => {
  assert.ok(
    recommendStudyTime(target, history(80, 90)).reasons.some((r) =>
      r.includes("funguje"),
    ),
  );
  assert.ok(
    recommendStudyTime(target, history(30, 40)).reasons.some((r) =>
      r.includes("zvyšujú"),
    ),
  );
  assert.ok(
    recommendStudyTime(target, history(90, 40)).warning?.includes(
      "nejde iba o nedostatok času",
    ),
  );
  assert.ok(
    recommendStudyTime(target, history(30, 90)).reasons.some((r) =>
      r.includes("podceňuješ"),
    ),
  );
});
test("confidence follows comparable sample size and excludes own/future results", () => {
  assert.equal(
    recommendStudyTime(target, history(80, 85, 3)).confidence,
    "Stredná",
  );
  const data = history(80, 85, 8);
  assert.equal(recommendStudyTime(target, data).confidence, "Vysoká");
  const future = { ...target, id: "future", date: "2027-01-01" };
  const augmented = {
    ...data,
    tests: [...data.tests, future],
    results: [
      ...data.results,
      { ...data.results[0], id: "future-result", testId: "future" },
      { ...data.results[0], id: "own-result", testId: target.id },
    ],
  };
  assert.deepEqual(
    recommendStudyTime(target, data),
    recommendStudyTime(target, augmented),
  );
  const zero = {
    ...data,
    results: data.results.map((r) => ({ ...r, actualStudyMinutes: 0 })),
  };
  assert.equal(recommendStudyTime(target, zero).sampleCount, 0);
});
test("remaining time is never negative and dates avoid daylight-saving errors", () => {
  const data = {
    ...empty,
    sessions: [
      {
        id: "s",
        createdAt: "",
        subjectId: "math",
        testId: target.id,
        date: "2026-09-09",
        startTime: "",
        minutes: 10000,
        topic: "",
        note: "",
      },
    ],
  };
  assert.equal(recommendStudyTime(target, data).remainingMinutes, 0);
  assert.equal(daysUntil("2026-03-30", "2026-03-29"), 1);
  assert.equal(weekStart("2026-09-09"), "2026-09-07");
  assert.equal(weightedAverage([]), null);
});
