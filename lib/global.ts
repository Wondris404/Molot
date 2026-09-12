import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { z } from "zod";
import { AppError, getDatabase, materialPath, transaction } from "./db";
import type { Goal, GoalCategory, GoalStatus, Profile, ProgressEntry } from "./types";

const modules = z.array(z.enum(["school", "work", "personal"])).min(1).max(3);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalNumber = z.number().finite().min(-1_000_000_000).max(1_000_000_000).nullable().default(null);
const text = z.string().trim().max(10_000).default("");

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Zadaj meno.").max(100),
  modules,
  mainGoal: z.string().trim().max(300).default(""),
  onboardingComplete: z.boolean().default(true),
});
export const goalSchema = z.object({
  name: z.string().trim().min(1, "Zadaj názov cieľa.").max(200),
  category: z.enum(["school", "work", "personal"]),
  description: text,
  targetValue: optionalNumber,
  currentValue: z.number().finite().min(-1_000_000_000).max(1_000_000_000).default(0),
  unit: z.string().trim().max(40).default(""),
  deadline: date.nullable().default(null),
  status: z.enum(["active", "completed", "paused"]).default("active"),
});
export const progressSchema = z.object({
  goalId: z.string().uuid(),
  date,
  value: optionalNumber,
  unit: z.string().trim().max(40).default(""),
  activity: z.string().trim().max(200).default(""),
  note: text,
});
export const milestoneSchema = z.object({ goalId: z.string().uuid(), name: z.string().trim().min(1).max(200), completed: z.boolean().default(false), dueDate: date.nullable().default(null) });

function getGoal(id: string) {
  const row = getDatabase().prepare("SELECT * FROM Goal WHERE id = ?").get(id);
  if (!row) throw new AppError("Cieľ už neexistuje. Obnov stránku.", 404);
  return row as unknown as Goal;
}
export function saveProfile(input: unknown): Profile {
  const value = profileSchema.parse(input);
  const now = new Date().toISOString();
  getDatabase()
    .prepare(`UPDATE Profile SET name=?, modules=?, mainGoal=?, onboardingComplete=?, updatedAt=? WHERE id='local'`)
    .run(value.name, JSON.stringify(value.modules), value.mainGoal, Number(value.onboardingComplete), now);
  return getDatabase().prepare("SELECT * FROM Profile WHERE id='local'").get() as unknown as Profile;
}
export function saveGoal(input: unknown, id?: string): string {
  const value = goalSchema.parse(input);
  const now = new Date().toISOString();
  const recordId = id ? z.string().uuid().parse(id) : randomUUID();
  transaction(() => {
    if (id) getGoal(recordId);
    if (id)
      getDatabase().prepare(`UPDATE Goal SET name=?, category=?, description=?, targetValue=?, currentValue=?, unit=?, deadline=?, status=?, updatedAt=? WHERE id=?`).run(
        value.name, value.category, value.description, value.targetValue, value.currentValue, value.unit, value.deadline, value.status, now, recordId,
      );
    else
      getDatabase().prepare(`INSERT INTO Goal (id,name,category,description,targetValue,currentValue,unit,deadline,status,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        recordId, value.name, value.category, value.description, value.targetValue, value.currentValue, value.unit, value.deadline, value.status, now, now,
      );
  });
  return recordId;
}
function updateGoalFromProgress(goalId: string) {
  const latest = getDatabase().prepare(`SELECT value FROM ProgressEntry WHERE goalId=? AND value IS NOT NULL ORDER BY date DESC, rowid DESC LIMIT 1`).get(goalId) as { value?: number } | undefined;
  if (latest?.value === undefined) return;
  getDatabase().prepare("UPDATE Goal SET currentValue=?, updatedAt=? WHERE id=?").run(latest.value, new Date().toISOString(), goalId);
}
export function saveProgress(input: unknown, id?: string): string {
  const value = progressSchema.parse(input);
  const recordId = id ? z.string().uuid().parse(id) : randomUUID();
  transaction(() => {
    getGoal(value.goalId);
    if (id) {
      const old = getDatabase().prepare("SELECT goalId FROM ProgressEntry WHERE id=?").get(recordId) as { goalId?: string } | undefined;
      if (!old) throw new AppError("Záznam pokroku už neexistuje. Obnov stránku.", 404);
      getDatabase().prepare(`UPDATE ProgressEntry SET goalId=?,date=?,value=?,unit=?,activity=?,note=? WHERE id=?`).run(value.goalId, value.date, value.value, value.unit, value.activity, value.note, recordId);
      updateGoalFromProgress(old.goalId ?? value.goalId);
    } else {
      getDatabase().prepare(`INSERT INTO ProgressEntry (id,goalId,date,value,unit,activity,note,createdAt) VALUES (?,?,?,?,?,?,?,?)`).run(recordId, value.goalId, value.date, value.value, value.unit, value.activity, value.note, new Date().toISOString());
    }
    updateGoalFromProgress(value.goalId);
  });
  return recordId;
}
export function saveMilestone(input: unknown, id?: string): string {
  const value = milestoneSchema.parse(input), recordId = id ? z.string().uuid().parse(id) : randomUUID(), now = new Date().toISOString();
  transaction(() => {
    getGoal(value.goalId);
    if (id) {
      const found = getDatabase().prepare("SELECT id FROM Milestone WHERE id=?").get(recordId);
      if (!found) throw new AppError("Medzikrok už neexistuje.", 404);
      getDatabase().prepare("UPDATE Milestone SET goalId=?,name=?,completed=?,dueDate=?,updatedAt=? WHERE id=?").run(value.goalId, value.name, Number(value.completed), value.dueDate, now, recordId);
    } else getDatabase().prepare("INSERT INTO Milestone VALUES (?,?,?,?,?,?,?)").run(recordId, value.goalId, value.name, Number(value.completed), value.dueDate, now, now);
  });
  return recordId;
}
export function deleteGlobal(entity: "goals" | "progress" | "milestones", id: string) {
  const recordId = z.string().uuid().parse(id);
  const attachments = entity === "goals"
    ? getDatabase().prepare("SELECT storageName FROM GoalAttachment WHERE goalId=?").all(recordId)
    : [];
  transaction(() => {
    if (entity === "goals") {
      getGoal(recordId);
      getDatabase().prepare("DELETE FROM Goal WHERE id=?").run(recordId);
      return;
    }
    if (entity === "milestones") { const result = getDatabase().prepare("DELETE FROM Milestone WHERE id=?").run(recordId); if (!result.changes) throw new AppError("Medzikrok už neexistuje.", 404); return; }
    const entry = getDatabase().prepare("SELECT goalId FROM ProgressEntry WHERE id=?").get(recordId) as { goalId?: string } | undefined;
    if (!entry) throw new AppError("Záznam pokroku už neexistuje. Obnov stránku.", 404);
    getDatabase().prepare("DELETE FROM ProgressEntry WHERE id=?").run(recordId);
    if (entry.goalId) updateGoalFromProgress(entry.goalId);
  });
  for (const attachment of attachments) {
    const file = materialPath(String(attachment.storageName));
    if (existsSync(file)) unlinkSync(file);
  }
}

export const goalCategories: Record<GoalCategory, string> = { school: "Škola", work: "Práca", personal: "Osobné" };
export const goalStatuses: Record<GoalStatus, string> = { active: "Aktívny", completed: "Hotový", paused: "Pozastavený" };
export type GlobalEntity = "profile" | "goals" | "progress" | "milestones";
export type GlobalRecord = Goal | ProgressEntry | Profile;
