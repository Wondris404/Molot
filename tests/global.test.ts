import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.env.MOLOT_DATA_SUBDIR = `test-global-${randomUUID()}`;
delete process.env.MOLOT_DATA_DIR;

test("local profile, goals, and progress persist in SQLite", async () => {
  const { getSnapshot, getDatabase, insertGoalAttachment } = await import("../lib/db");
  const { saveProfile, saveGoal, saveProgress, saveMilestone, deleteGlobal } = await import("../lib/global");
  assert.equal(getSnapshot().profile.onboardingComplete, false);
  saveProfile({ name: "TEST Ondrej", modules: ["school", "personal"], mainGoal: "TEST cieľ", onboardingComplete: true });
  const goalId = saveGoal({ name: "TEST Beh", category: "personal", description: "", targetValue: 10, currentValue: 0, unit: "km", deadline: null, status: "active" });
  const entryId = saveProgress({ goalId, date: "2026-09-11", value: 5, unit: "km", activity: "Beh", note: "TEST" });
  const milestoneId = saveMilestone({ goalId, name: "TEST 5 km", completed: false, dueDate: null });
  insertGoalAttachment({ id: randomUUID(), goalId, name: "TEST plan.txt", storageName: `${randomUUID()}.txt`, mimeType: "text/plain", size: 4, createdAt: new Date().toISOString() });
  saveMilestone({ goalId, name: "TEST 5 km", completed: true, dueDate: null }, milestoneId);
  const snapshot = getSnapshot();
  assert.deepEqual(snapshot.profile.modules, ["school", "personal"]);
  assert.equal(snapshot.goals[0].currentValue, 5);
  assert.equal(snapshot.progressEntries[0].id, entryId);
  assert.equal(snapshot.milestones[0].completed, true);
  assert.equal(snapshot.goalAttachments[0].goalId, goalId);
  deleteGlobal("progress", entryId);
  assert.equal(getSnapshot().progressEntries.length, 0);
  assert.equal(getDatabase().prepare("PRAGMA user_version").get()?.user_version, 5);
});

test("smart input only proposes a school test and never saves it", async () => {
  const { interpretText } = await import("../lib/smart-input");
  const proposal = interpretText("Biológia test budúci piatok, fotosyntéza, 4 hodiny", [{ id: "00000000-0000-4000-8000-000000000001", name: "Biológia", color: "#ffffff", createdAt: "" }]);
  assert.equal(proposal.kind, "test");
  assert.equal(proposal.fields.subjectId, "00000000-0000-4000-8000-000000000001");
  assert.equal(proposal.fields.plannedMinutes, 240);
});

test("smart input recognizes a test result and a personal goal", async () => {
  const { interpretText } = await import("../lib/smart-input");
  const subject = { id: "00000000-0000-4000-8000-000000000001", name: "Biology", color: "#ffffff", createdAt: "" };
  const result = interpretText("I got 42 out of 50 from biology, grade 2.", [subject]);
  assert.equal(result.kind, "test_result"); assert.equal(result.fields.earnedPoints, 42); assert.equal(result.fields.maxPoints, 50);
  const goal = interpretText("I want to run 10 km under 50 minutes.", []);
  assert.equal(goal.kind, "goal"); assert.equal(goal.fields.targetValue, 10);
});
