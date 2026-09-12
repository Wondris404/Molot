import type { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { backupDirectory } from "./paths";
import { logEvent } from "./logger";

export function migrateIntelligence(db: DatabaseSync) {
  const version = Number(db.prepare("PRAGMA user_version").get()?.user_version);
  if (version < 2) {
    mkdirSync(backupDirectory, { recursive: true });
    db.prepare("VACUUM INTO ?").run(
      path.join(backupDirectory, `before-v2-${Date.now()}.sqlite`),
    );
    try {
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE Teacher (id TEXT PRIMARY KEY, subjectId TEXT NOT NULL REFERENCES Subject(id) ON DELETE CASCADE,
        name TEXT NOT NULL, schoolYear TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL);
      CREATE TABLE TeacherDocument (id TEXT PRIMARY KEY, teacherId TEXT REFERENCES Teacher(id) ON DELETE CASCADE,
        subjectId TEXT NOT NULL REFERENCES Subject(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK(kind IN ('test','notes')), title TEXT NOT NULL,
        year TEXT NOT NULL DEFAULT '', date TEXT NOT NULL DEFAULT '', chapter TEXT NOT NULL DEFAULT '', topics TEXT NOT NULL DEFAULT '',
        testType TEXT NOT NULL DEFAULT '', totalQuestions INTEGER, totalPoints REAL, source TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
        storageName TEXT, mimeType TEXT, text TEXT NOT NULL DEFAULT '', parseStatus TEXT NOT NULL DEFAULT 'manual', createdAt TEXT NOT NULL);
      CREATE TABLE TeacherQuestion (id TEXT PRIMARY KEY, documentId TEXT NOT NULL REFERENCES TeacherDocument(id) ON DELETE CASCADE,
        text TEXT NOT NULL, topic TEXT NOT NULL DEFAULT '', subtopic TEXT NOT NULL DEFAULT '',
        questionType TEXT NOT NULL DEFAULT 'short_answer', points REAL CHECK(points >= 0), keywords TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL);
      CREATE TABLE MaterialTopic (id TEXT PRIMARY KEY, documentId TEXT NOT NULL REFERENCES TeacherDocument(id) ON DELETE CASCADE,
        name TEXT NOT NULL, keywords TEXT NOT NULL DEFAULT '', importance REAL NOT NULL DEFAULT 1 CHECK(importance BETWEEN 0 AND 1), createdAt TEXT NOT NULL);
      CREATE TABLE TestIntelligence (testId TEXT PRIMARY KEY REFERENCES Test(id) ON DELETE CASCADE,
        teacherId TEXT REFERENCES Teacher(id) ON DELETE SET NULL, materialIds TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE TeacherPrediction (id TEXT PRIMARY KEY, testId TEXT NOT NULL REFERENCES Test(id) ON DELETE CASCADE,
        teacherId TEXT REFERENCES Teacher(id) ON DELETE SET NULL, payload TEXT NOT NULL, actualTopics TEXT, actualStyles TEXT,
        precision REAL, recall REAL, stylePrecision REAL, styleRecall REAL, createdAt TEXT NOT NULL);
      CREATE TABLE StudentModelMetadata (id TEXT PRIMARY KEY, version TEXT NOT NULL UNIQUE, createdAt TEXT NOT NULL,
        numberOfSamples INTEGER NOT NULL, features TEXT NOT NULL, algorithm TEXT NOT NULL, mae REAL NOT NULL, rmse REAL NOT NULL,
        validationMethod TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL);
      CREATE TABLE ModelTrainingRun (id TEXT PRIMARY KEY, createdAt TEXT NOT NULL, numberOfSamples INTEGER NOT NULL,
        status TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IntelligenceSettings (id TEXT PRIMARY KEY CHECK(id='local'), weights TEXT NOT NULL);
      INSERT INTO IntelligenceSettings VALUES ('local','{"frequency":0.35,"recency":0.2,"points":0.15,"repetition":0.15,"material":0.15}');
      CREATE INDEX TeacherDocument_teacher ON TeacherDocument(teacherId);
      CREATE INDEX TeacherQuestion_document ON TeacherQuestion(documentId);
      CREATE INDEX TeacherPrediction_test ON TeacherPrediction(testId);
      PRAGMA user_version = 2; COMMIT;`);
      logEvent("database_migrated", { version: 2 });
    } catch (error) {
      db.exec("ROLLBACK");
      logEvent("database_migration_failed", { version: 2 });
      throw error;
    }
  }
  if (version < 3) {
  mkdirSync(backupDirectory, { recursive: true });
  db.prepare("VACUUM INTO ?").run(
    path.join(backupDirectory, `before-v3-${Date.now()}.sqlite`),
  );
  try {
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE Profile (
        id TEXT PRIMARY KEY CHECK(id='local'), name TEXT NOT NULL DEFAULT '',
        modules TEXT NOT NULL DEFAULT '[]', mainGoal TEXT NOT NULL DEFAULT '',
        onboardingComplete INTEGER NOT NULL DEFAULT 0 CHECK(onboardingComplete IN (0,1)),
        createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      INSERT INTO Profile (id, createdAt, updatedAt) VALUES ('local', datetime('now'), datetime('now'));
      CREATE TABLE Goal (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL CHECK(category IN ('school','work','personal')),
        description TEXT NOT NULL DEFAULT '', targetValue REAL, currentValue REAL NOT NULL DEFAULT 0,
        unit TEXT NOT NULL DEFAULT '', deadline TEXT, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','paused')),
        createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE TABLE ProgressEntry (
        id TEXT PRIMARY KEY, goalId TEXT NOT NULL REFERENCES Goal(id) ON DELETE CASCADE,
        date TEXT NOT NULL, value REAL, unit TEXT NOT NULL DEFAULT '', activity TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL
      );
      CREATE INDEX Goal_category_status ON Goal(category, status);
      CREATE INDEX ProgressEntry_goal_date ON ProgressEntry(goalId, date);
      PRAGMA user_version = 3; COMMIT;`);
    logEvent("database_migrated", { version: 3 });
  } catch (error) {
    db.exec("ROLLBACK");
    logEvent("database_migration_failed", { version: 3 });
    throw error;
  }
  }
  if (version < 4) {
    mkdirSync(backupDirectory, { recursive: true });
    db.prepare("VACUUM INTO ?").run(path.join(backupDirectory, `before-v4-${Date.now()}.sqlite`));
    try {
      db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE Milestone (
        id TEXT PRIMARY KEY, goalId TEXT NOT NULL REFERENCES Goal(id) ON DELETE CASCADE,
        name TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
        dueDate TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE INDEX Milestone_goal ON Milestone(goalId, completed);
      PRAGMA user_version = 4; COMMIT;`);
      logEvent("database_migrated", { version: 4 });
    } catch (error) {
      db.exec("ROLLBACK");
      logEvent("database_migration_failed", { version: 4 });
      throw error;
    }
  }
  if (version >= 5) return;
  mkdirSync(backupDirectory, { recursive: true });
  db.prepare("VACUUM INTO ?").run(path.join(backupDirectory, `before-v5-${Date.now()}.sqlite`));
  try {
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE GoalAttachment (
        id TEXT PRIMARY KEY, goalId TEXT NOT NULL REFERENCES Goal(id) ON DELETE CASCADE,
        name TEXT NOT NULL, storageName TEXT NOT NULL UNIQUE, mimeType TEXT NOT NULL,
        size INTEGER NOT NULL CHECK(size > 0), createdAt TEXT NOT NULL
      );
      CREATE INDEX GoalAttachment_goal ON GoalAttachment(goalId, createdAt);
      PRAGMA user_version = 5; COMMIT;`);
    logEvent("database_migrated", { version: 5 });
  } catch (error) {
    db.exec("ROLLBACK");
    logEvent("database_migration_failed", { version: 5 });
    throw error;
  }
}
