import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

delete process.env.MOLOT_DATA_DIR;
process.env.MOLOT_DATA_SUBDIR = `test-result-${randomUUID()}`;

test("results freeze the saved MOLOT PREDICTION recommendation, including zero", async () => {
  const { saveEntity, getSnapshot } = await import("../lib/db");
  const { savePrediction, testPrediction } = await import("../lib/intelligence");
  const subjectId = saveEntity("subjects", { name: "TEST frozen recommendation", color: "#88aa55" });
  const testId = saveEntity("tests", { subjectId, title: "TEST achievable target", date: "2027-01-10", difficulty: 2, targetPercent: 40, plannedMinutes: 120, initialReadiness: 80, status: "planned" });
  const prediction = testPrediction(testId);
  assert.equal(prediction.time.minutes, 0);
  savePrediction(testId);
  const result = { testId, earnedPoints: 42, maxPoints: 50, percentage: 84, grade: 2, actualStudyMinutes: 45, readinessBefore: 80, perceivedDifficulty: 2 };
  const resultId = saveEntity("results", result);
  assert.equal(getSnapshot().results[0].recommendedMinutes, prediction.time.minutes);
  saveEntity("settings", { dailyGoalMinutes: 60, baselineMinutes: 300, defaultTarget: 90 }, "local");
  saveEntity("results", { ...result, actualStudyMinutes: 60 }, resultId);
  assert.equal(getSnapshot().results[0].recommendedMinutes, 0, "later edits must not rewrite the historical recommendation");
});
