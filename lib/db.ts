import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { schemas } from "./validation";
import type { Entity, GoalAttachment, Snapshot, UploadedMaterial } from "./types";
import { recommendStudyTime } from "./recommendationEngine";
import { databasePath, uploadDirectory } from "./paths";
import { migrateIntelligence } from "./migrations";
export { dataDirectory, databasePath, uploadDirectory } from "./paths";

const globalDatabase = globalThis as typeof globalThis & {
  molotDatabases?: Map<string, DatabaseSync>;
};
export function getDatabase(): DatabaseSync {
  globalDatabase.molotDatabases ??= new Map();
  const existing = globalDatabase.molotDatabases.get(databasePath);
  if (existing) {
    migrateIntelligence(existing);
    return existing;
  }
  mkdirSync(uploadDirectory, { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(
    "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
  );
  const version = db.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };
  if (version.user_version > 5)
    throw new Error("Databáza pochádza z novšej verzie Molotu.");
  if (version.user_version === 0)
    db.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE Subject (
      id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, color TEXT NOT NULL, createdAt TEXT NOT NULL
    );
    CREATE TABLE Grade (
      id TEXT PRIMARY KEY, subjectId TEXT NOT NULL REFERENCES Subject(id) ON DELETE CASCADE,
      value INTEGER NOT NULL CHECK(value BETWEEN 1 AND 5), weight REAL NOT NULL CHECK(weight > 0),
      date TEXT NOT NULL, description TEXT NOT NULL, assessmentType TEXT NOT NULL, createdAt TEXT NOT NULL
    );
    CREATE TABLE Test (
      id TEXT PRIMARY KEY, subjectId TEXT NOT NULL REFERENCES Subject(id) ON DELETE CASCADE,
      title TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL DEFAULT '', topics TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
      difficulty INTEGER NOT NULL CHECK(difficulty BETWEEN 1 AND 5), targetPercent REAL NOT NULL CHECK(targetPercent BETWEEN 0 AND 100),
      plannedMinutes INTEGER NOT NULL CHECK(plannedMinutes >= 0),
      status TEXT NOT NULL CHECK(status IN ('planned','preparing','written','evaluated')), createdAt TEXT NOT NULL
    );
    CREATE TABLE TestResult (
      id TEXT PRIMARY KEY, testId TEXT NOT NULL UNIQUE REFERENCES Test(id) ON DELETE CASCADE,
      earnedPoints REAL CHECK(earnedPoints >= 0), maxPoints REAL CHECK(maxPoints > 0),
      percentage REAL NOT NULL CHECK(percentage BETWEEN 0 AND 100), grade INTEGER CHECK(grade BETWEEN 1 AND 5),
      actualStudyMinutes INTEGER NOT NULL CHECK(actualStudyMinutes >= 0), readinessBefore REAL NOT NULL CHECK(readinessBefore BETWEEN 0 AND 100),
      perceivedDifficulty INTEGER NOT NULL CHECK(perceivedDifficulty BETWEEN 1 AND 5), note TEXT NOT NULL,
      recommendedMinutes INTEGER NOT NULL CHECK(recommendedMinutes >= 0), createdAt TEXT NOT NULL,
      CHECK((earnedPoints IS NULL AND maxPoints IS NULL) OR (earnedPoints IS NOT NULL AND maxPoints IS NOT NULL AND earnedPoints <= maxPoints))
    );
    CREATE TABLE StudySession (
      id TEXT PRIMARY KEY, subjectId TEXT NOT NULL REFERENCES Subject(id) ON DELETE CASCADE,
      testId TEXT REFERENCES Test(id) ON DELETE SET NULL, date TEXT NOT NULL, startTime TEXT NOT NULL,
      minutes INTEGER NOT NULL CHECK(minutes > 0), topic TEXT NOT NULL, note TEXT NOT NULL, createdAt TEXT NOT NULL
    );
    CREATE TABLE ReadinessEntry (
      id TEXT PRIMARY KEY, testId TEXT NOT NULL REFERENCES Test(id) ON DELETE CASCADE,
      percent REAL NOT NULL CHECK(percent BETWEEN 0 AND 100), recordedAt TEXT NOT NULL, note TEXT NOT NULL, createdAt TEXT NOT NULL
    );
    CREATE TABLE UploadedMaterial (
      id TEXT PRIMARY KEY, subjectId TEXT NOT NULL REFERENCES Subject(id) ON DELETE CASCADE,
      testId TEXT REFERENCES Test(id) ON DELETE SET NULL, name TEXT NOT NULL, storageName TEXT NOT NULL UNIQUE,
      mimeType TEXT NOT NULL, size INTEGER NOT NULL CHECK(size > 0), createdAt TEXT NOT NULL
    );
    CREATE TABLE ErrorEntry (
      id TEXT PRIMARY KEY, subjectId TEXT NOT NULL REFERENCES Subject(id) ON DELETE CASCADE,
      testId TEXT REFERENCES Test(id) ON DELETE SET NULL, materialId TEXT REFERENCES UploadedMaterial(id) ON DELETE SET NULL,
      question TEXT NOT NULL, topic TEXT NOT NULL, subtopic TEXT NOT NULL, answer TEXT NOT NULL,
      isCorrect INTEGER NOT NULL CHECK(isCorrect IN (0,1)),
      errorType TEXT NOT NULL CHECK(errorType IN ('knowledge','forgotten','careless','misunderstood','calculation','terminology','other')),
      note TEXT NOT NULL, date TEXT NOT NULL, createdAt TEXT NOT NULL
    );
    CREATE TABLE Settings (
      id TEXT PRIMARY KEY CHECK(id = 'local'), dailyGoalMinutes INTEGER NOT NULL CHECK(dailyGoalMinutes > 0),
      baselineMinutes INTEGER NOT NULL CHECK(baselineMinutes >= 15), defaultTarget REAL NOT NULL CHECK(defaultTarget BETWEEN 0 AND 100)
    );
    INSERT INTO Settings VALUES ('local', 60, 120, 85);
    CREATE INDEX Grade_subject_date ON Grade(subjectId, date);
    CREATE INDEX Test_date ON Test(date);
    CREATE INDEX StudySession_test ON StudySession(testId);
    CREATE INDEX StudySession_subject_date ON StudySession(subjectId, date);
    CREATE INDEX ReadinessEntry_test_date ON ReadinessEntry(testId, recordedAt);
    CREATE INDEX ErrorEntry_subject_topic ON ErrorEntry(subjectId, topic);
    PRAGMA user_version = 1;
    COMMIT;
  `);
  migrateIntelligence(db);
  globalDatabase.molotDatabases.set(databasePath, db);
  return db;
}

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const tables = {
  subjects: "Subject",
  grades: "Grade",
  tests: "Test",
  results: "TestResult",
  sessions: "StudySession",
  readiness: "ReadinessEntry",
  errors: "ErrorEntry",
  settings: "Settings",
  materials: "UploadedMaterial",
} as const;
type TableEntity = keyof typeof tables;
type Row = Record<string, SQLInputValue>;

function rows<T>(table: string): T[] {
  return getDatabase()
    .prepare(`SELECT * FROM ${table} ORDER BY rowid DESC`)
    .all() as unknown as T[];
}
export function getSnapshot(): Snapshot {
  const profile = getDatabase()
    .prepare("SELECT * FROM Profile WHERE id = 'local'")
    .get() as Record<string, unknown>;
  return {
    subjects: rows("Subject"),
    grades: rows("Grade"),
    tests: rows("Test"),
    results: rows("TestResult"),
    sessions: rows("StudySession"),
    readiness: rows("ReadinessEntry"),
    materials: rows("UploadedMaterial"),
    errors: rows<Snapshot["errors"][number]>("ErrorEntry").map((entry) => ({
      ...entry,
      isCorrect: Boolean(entry.isCorrect),
    })),
    settings: getDatabase()
      .prepare("SELECT * FROM Settings WHERE id = 'local'")
      .get() as unknown as Snapshot["settings"],
    profile: {
      ...profile,
      id: "local",
      modules: JSON.parse(String(profile.modules || "[]")),
      onboardingComplete: Boolean(profile.onboardingComplete),
    } as Snapshot["profile"],
    goals: rows("Goal"),
    progressEntries: rows("ProgressEntry"),
    milestones: rows<Snapshot["milestones"][number]>("Milestone").map((item) => ({ ...item, completed: Boolean(item.completed) })),
    goalAttachments: rows("GoalAttachment"),
  };
}
function getRow(entity: TableEntity, id: string): Row {
  const row = getDatabase()
    .prepare(`SELECT * FROM ${tables[entity]} WHERE id = ?`)
    .get(id);
  if (!row) throw new AppError("Záznam už neexistuje. Obnov stránku.", 404);
  return row;
}
export function validateRelations(value: {
  subjectId?: unknown;
  testId?: unknown;
  materialId?: unknown;
}) {
  if (typeof value.subjectId === "string") getRow("subjects", value.subjectId);
  if (typeof value.testId === "string") {
    const test = getRow("tests", value.testId);
    if (value.subjectId && test.subjectId !== value.subjectId)
      throw new AppError("Test musí patriť k vybranému predmetu.");
  }
  if (typeof value.materialId === "string") {
    const material = getRow("materials", value.materialId);
    if (material.subjectId !== value.subjectId)
      throw new AppError("Materiál musí patriť k vybranému predmetu.");
    if (material.testId && material.testId !== value.testId)
      throw new AppError("Vyber test, ku ktorému patrí materiál.");
  }
}
function insert(table: string, row: Row) {
  const keys = Object.keys(row);
  getDatabase()
    .prepare(
      `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
    )
    .run(...keys.map((key) => row[key]));
}
function update(table: string, id: string, row: Row) {
  const keys = Object.keys(row);
  getDatabase()
    .prepare(
      `UPDATE ${table} SET ${keys.map((key) => `${key} = ?`).join(",")} WHERE id = ?`,
    )
    .run(...keys.map((key) => row[key]), id);
}
export function transaction<T>(work: () => T): T {
  const db = getDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function saveEntity(
  entity: Entity,
  input: unknown,
  recordId?: string,
): string {
  const parsed = schemas[entity].parse(input);
  const value: Row = Object.fromEntries(
    Object.entries(parsed).map(([key, item]) => [
      key,
      typeof item === "boolean" ? Number(item) : item,
    ]),
  );
  const id =
    entity === "settings"
      ? "local"
      : recordId
        ? z.string().uuid().parse(recordId)
        : randomUUID();
  return transaction(() => {
    const previous =
      recordId || entity === "settings" ? getRow(entity, id) : null;
    validateRelations(value);
    if (entity === "readiness")
      value.recordedAt = new Date(String(value.recordedAt)).toISOString();
    if (entity === "tests") {
      const result = getDatabase()
        .prepare("SELECT id FROM TestResult WHERE testId = ?")
        .get(id);
      if (value.status === "evaluated" && !result)
        throw new AppError(
          "Najprv pridaj výsledok testu. Stav Vyhodnotený sa nastaví automaticky.",
        );
      if (result && value.status !== "evaluated")
        throw new AppError(
          "Test s výsledkom musí zostať vyhodnotený. Pre zmenu najprv odstráň výsledok.",
        );
      if (previous && previous.subjectId !== value.subjectId) {
        const count = getDatabase()
          .prepare(
            "SELECT (SELECT COUNT(*) FROM StudySession WHERE testId = ?) + (SELECT COUNT(*) FROM ErrorEntry WHERE testId = ?) + (SELECT COUNT(*) FROM UploadedMaterial WHERE testId = ?) AS count",
          )
          .get(id, id, id);
        if (Number(count?.count) > 0)
          throw new AppError(
            "Predmet testu nemožno zmeniť, kým má priradené učenie, odpovede alebo materiály.",
          );
      }
    }
    if (entity === "results") {
      if (previous && previous.testId !== value.testId)
        throw new AppError("Výsledok nemožno presunúť na iný test.");
      if (
        typeof value.earnedPoints === "number" &&
        typeof value.maxPoints === "number"
      )
        value.percentage =
          Math.round((value.earnedPoints / value.maxPoints) * 10000) / 100;
      const snapshot = getSnapshot();
      const test = snapshot.tests.find((item) => item.id === value.testId);
      if (!test) throw new AppError("Test neexistuje.");
      const frozen = getDatabase().prepare(
        "SELECT payload FROM TeacherPrediction WHERE testId=? ORDER BY createdAt DESC, rowid DESC LIMIT 1",
      ).get(test.id);
      let predictedMinutes: number | undefined;
      if (frozen) {
        try {
          const prediction = z.object({ time: z.object({ minutes: z.number().int().min(0).max(100000) }) }).parse(JSON.parse(String(frozen.payload)));
          predictedMinutes = prediction.time.minutes;
        } catch { /* Older/invalid snapshots retain the established baseline fallback. */ }
      }
      value.recommendedMinutes = previous?.recommendedMinutes ?? predictedMinutes ?? recommendStudyTime(test, snapshot).minutes;
    }
    if (previous) update(tables[entity], id, value);
    else
      insert(tables[entity], {
        id,
        ...value,
        createdAt: new Date().toISOString(),
      });
    if (entity === "results")
      getDatabase()
        .prepare("UPDATE Test SET status = 'evaluated' WHERE id = ?")
        .run(value.testId);
    if (entity === "tests" && !previous) {
      const initial = z
        .object({
          initialReadiness: z.number().min(0).max(100).nullable().optional(),
        })
        .parse(input).initialReadiness;
      if (initial != null)
        insert("ReadinessEntry", {
          id: randomUUID(),
          testId: id,
          percent: initial,
          recordedAt: new Date(
            Math.floor(Date.now() / 1000) * 1000,
          ).toISOString(),
          note: "Úvodný záznam",
          createdAt: new Date().toISOString(),
        });
    }
    return id;
  });
}
export function getMaterial(id: string): UploadedMaterial | GoalAttachment {
  const material = getDatabase().prepare("SELECT * FROM UploadedMaterial WHERE id=?").get(id)
    ?? getDatabase().prepare("SELECT * FROM GoalAttachment WHERE id=?").get(id);
  if (!material) throw new AppError("Materiál už neexistuje. Obnov stránku.", 404);
  return material as unknown as UploadedMaterial | GoalAttachment;
}
export function insertMaterial(material: UploadedMaterial) {
  validateRelations(material);
  insert("UploadedMaterial", { ...material });
}
export function insertGoalAttachment(material: GoalAttachment) {
  const goal = getDatabase().prepare("SELECT id FROM Goal WHERE id=?").get(material.goalId);
  if (!goal) throw new AppError("Cieľ už neexistuje. Obnov stránku.", 404);
  insert("GoalAttachment", { ...material });
}
export function renameMaterial(id: string, input: unknown) {
  const value = z
    .object({ name: z.string().trim().min(1).max(200) })
    .parse(input);
  const material = getMaterial(id);
  update("goalId" in material ? "GoalAttachment" : "UploadedMaterial", id, value);
}
export function deleteMaterial(id: string) {
  z.string().uuid().parse(id);
  const material = getMaterial(id);
  transaction(() => {
    getDatabase().prepare(`DELETE FROM ${"goalId" in material ? "GoalAttachment" : "UploadedMaterial"} WHERE id=?`).run(id);
  });
  const filePath = materialPath(material.storageName);
  if (existsSync(filePath)) unlinkSync(filePath);
}
export function materialPath(storageName: string): string {
  if (!/^[a-f0-9-]+\.(pdf|png|jpg|txt)$/.test(storageName))
    throw new AppError("Neplatná cesta k materiálu.");
  return path.join(uploadDirectory, storageName);
}
export function deleteEntity(entity: TableEntity, id: string) {
  if (entity === "settings")
    throw new AppError("Nastavenia nemožno odstrániť.");
  z.string().uuid().parse(id);
  const record = getRow(entity, id);
  const files =
    entity === "materials"
      ? [record]
      : entity === "subjects"
        ? getDatabase()
            .prepare("SELECT * FROM UploadedMaterial WHERE subjectId = ?")
            .all(id)
        : [];
  transaction(() => {
    getDatabase().prepare(`DELETE FROM ${tables[entity]} WHERE id = ?`).run(id);
    if (entity === "results")
      getDatabase()
        .prepare("UPDATE Test SET status = 'written' WHERE id = ?")
        .run(record.testId);
  });
  for (const file of files) {
    const filePath = materialPath(String(file.storageName));
    try {
      if (existsSync(filePath)) unlinkSync(filePath);
    } catch {
      console.error("Odstránenie súboru zlyhalo:", filePath);
    }
  }
}
