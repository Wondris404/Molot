import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError, getDatabase, transaction, validateRelations } from "./db";
import type { TeacherSnapshot } from "../ml/teacher/types";
const id = z.string().uuid();
const text = z.string().max(10000).default("");
const name = z.string().trim().min(1).max(200);
const date = z
  .string()
  .refine(
    (v) =>
      v === "" ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        !isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v),
    "Neplatný dátum.",
  )
  .default("");
export const teacherSchemas = {
  teachers: z.object({ subjectId: id, name, schoolYear: text, notes: text }),
  documents: z.object({
    teacherId: id.nullable().default(null),
    subjectId: id,
    kind: z.enum(["test", "notes"]),
    title: name,
    year: text,
    date,
    chapter: text,
    topics: text,
    testType: text,
    totalQuestions: z.number().int().min(0).max(10000).nullable().default(null),
    totalPoints: z.number().min(0).max(1e6).nullable().default(null),
    source: text,
    notes: text,
    text: z.string().max(100000).default(""),
  }),
  questions: z.object({
    documentId: id,
    text: z.string().trim().min(1).max(10000),
    topic: text,
    subtopic: text,
    questionType: z.enum([
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
    points: z.number().min(0).max(1e6).nullable().default(null),
    keywords: text,
  }),
  topics: z.object({
    documentId: id,
    name,
    keywords: text,
    importance: z.number().min(0).max(1).default(1),
  }),
};
export type TeacherEntity = keyof typeof teacherSchemas;
const tables = {
  teachers: "Teacher",
  documents: "TeacherDocument",
  questions: "TeacherQuestion",
  topics: "MaterialTopic",
};
export function teacherSnapshot(): TeacherSnapshot {
  const db = getDatabase();
  const rows = (table: string) =>
    db.prepare(`SELECT * FROM ${table} ORDER BY rowid DESC`).all();
  return {
    teachers: rows("Teacher"),
    documents: rows("TeacherDocument"),
    questions: rows("TeacherQuestion"),
    topics: rows("MaterialTopic"),
    links: rows("TestIntelligence"),
    predictions: rows("TeacherPrediction"),
    weights: JSON.parse(
      String(
        db
          .prepare("SELECT weights FROM IntelligenceSettings WHERE id='local'")
          .get()?.weights,
      ),
    ),
  } as unknown as TeacherSnapshot;
}
export function saveTeacherEntity(
  entity: TeacherEntity,
  input: unknown,
  recordId?: string,
): string {
  const parsed = teacherSchemas[entity].parse(input);
  const value = parsed as Record<string, string | number | null>;
  const record = recordId ? id.parse(recordId) : randomUUID();
  return transaction(() => {
    const db = getDatabase();
    const previous = recordId
      ? db.prepare(`SELECT * FROM ${tables[entity]} WHERE id=?`).get(record)
      : null;
    if (recordId && !previous) throw new AppError("Záznam neexistuje.", 404);
    validateRelations(value);
    if (value.teacherId) {
      const teacher = db
        .prepare("SELECT subjectId FROM Teacher WHERE id=?")
        .get(value.teacherId);
      if (!teacher || teacher.subjectId !== value.subjectId)
        throw new AppError("Učiteľ musí patriť k predmetu.");
    }
    if (value.documentId) {
      const document = db
        .prepare("SELECT kind FROM TeacherDocument WHERE id=?")
        .get(value.documentId);
      if (
        !document ||
        (entity === "questions" && document.kind !== "test") ||
        (entity === "topics" && document.kind !== "notes")
      )
        throw new AppError("Nesprávny typ dokumentu.");
    }
    if (
      previous &&
      (entity === "teachers" || entity === "documents") &&
      previous.subjectId !== value.subjectId
    )
      throw new AppError(
        "Predmet existujúceho profilu alebo dokumentu nemožno meniť.",
      );
    const row = previous
      ? value
      : { id: record, ...value, createdAt: new Date().toISOString() };
    const keys = Object.keys(row);
    if (previous)
      db.prepare(
        `UPDATE ${tables[entity]} SET ${keys.map((k) => `${k}=?`).join(",")} WHERE id=?`,
      ).run(...Object.values(row), record);
    else
      db.prepare(
        `INSERT INTO ${tables[entity]} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
      ).run(...Object.values(row));
    return record;
  });
}
export function deleteTeacherEntity(entity: TeacherEntity, recordId: string) {
  id.parse(recordId);
  const result = getDatabase()
    .prepare(`DELETE FROM ${tables[entity]} WHERE id=?`)
    .run(recordId);
  if (!result.changes) throw new AppError("Záznam neexistuje.", 404);
  // Files remain recoverable in local storage; database backups can still refer to them.
}
export function saveTestLink(input: unknown) {
  const value = z
    .object({
      testId: id,
      teacherId: id.nullable(),
      materialIds: z.array(id).max(50),
    })
    .parse(input);
  const data = teacherSnapshot();
  const test = getDatabase()
    .prepare("SELECT subjectId FROM Test WHERE id=?")
    .get(value.testId);
  if (!test) throw new AppError("Test neexistuje.");
  if (
    value.teacherId &&
    !data.teachers.some(
      (t) => t.id === value.teacherId && t.subjectId === test.subjectId,
    )
  )
    throw new AppError("Učiteľ musí patriť k predmetu.");
  if (
    value.materialIds.some(
      (id) =>
        !data.documents.some(
          (d) =>
            d.id === id && d.kind === "notes" && d.subjectId === test.subjectId,
        ),
    )
  )
    throw new AppError("Vyber učivo z rovnakého predmetu.");
  getDatabase()
    .prepare(
      "INSERT INTO TestIntelligence(testId,teacherId,materialIds) VALUES(?,?,?) ON CONFLICT(testId) DO UPDATE SET teacherId=excluded.teacherId,materialIds=excluded.materialIds",
    )
    .run(value.testId, value.teacherId, JSON.stringify(value.materialIds));
}
