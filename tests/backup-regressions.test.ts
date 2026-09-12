import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { unzipSync, zipSync } from "fflate";

delete process.env.MOLOT_DATA_DIR;
process.env.MOLOT_DATA_SUBDIR = `test-backup-${randomUUID()}`;

test("backup restore protects records during training and disk failures", async (t) => {
  const { saveEntity, getSnapshot, getDatabase, databasePath, AppError } =
    await import("../lib/db");
  const { saveTeacherEntity, teacherSnapshot } =
    await import("../lib/teacher-db");
  const { createBackup, importBackup } = await import("../lib/backups");
  const { trainStudentModel, isStudentTraining } =
    await import("../ml/student/service");
  const { dataDirectory, teacherDirectory, modelsDirectory } =
    await import("../lib/paths");

  const subjectId = saveEntity("subjects", {
    name: "TEST backup subject",
    color: "#88aa55",
  });
  saveEntity("grades", {
    subjectId,
    value: 2,
    weight: 3,
    date: "2026-01-01",
    assessmentType: "TEST",
  });
  const documents = ["First", "Second"].map((name) =>
    saveTeacherEntity("documents", {
      subjectId,
      kind: "test",
      title: `TEST ${name}`,
    }),
  );
  fs.mkdirSync(teacherDirectory, { recursive: true });
  fs.mkdirSync(modelsDirectory, { recursive: true });
  const stored = `${randomUUID()}.txt`;
  fs.writeFileSync(path.join(teacherDirectory, stored), "TEST shared document");
  for (const id of documents)
    getDatabase()
      .prepare(
        "UPDATE TeacherDocument SET storageName=?,mimeType='text/plain' WHERE id=?",
      )
      .run(stored, id);
  fs.writeFileSync(
    path.join(modelsDirectory, "TEST-metadata.json"),
    '{"test":true}',
  );
  const backup = createBackup();
  const currentSubjectId = saveEntity("subjects", {
    name: "TEST added after backup",
    color: "#ffffff",
  });
  const current = getSnapshot();

  await t.test(
    "active training blocks restore before any file or record changes",
    async () => {
      const work = trainStudentModel();
      assert.equal(isStudentTraining(), true);
      const before = fs.readdirSync(dataDirectory, { recursive: true }).sort();
      try {
        assert.throws(
          () => importBackup(backup.bytes),
          (error: unknown) => error instanceof AppError && error.status === 409,
        );
        assert.deepEqual(getSnapshot(), current);
        assert.deepEqual(
          fs.readdirSync(dataDirectory, { recursive: true }).sort(),
          before,
        );
      } finally {
        const result = await work;
        assert.equal(result.status, "insufficient");
      }
      assert.equal(isStudentTraining(), false);
    },
  );

  for (const operation of ["model write", "recovery copy"] as const)
    await t.test(`${operation} failure leaves live records unchanged`, () => {
      let injected = false;
      const originalWrite = fs.writeFileSync;
      const originalCopy = fs.copyFileSync;
      const fault =
        operation === "model write"
          ? t.mock.method(
              fs,
              "writeFileSync",
              (...args: Parameters<typeof fs.writeFileSync>) => {
                if (path.basename(String(args[0])).startsWith("import-")) {
                  injected = true;
                  throw new Error("TEST simulated model write failure");
                }
                return originalWrite(...args);
              },
            )
          : t.mock.method(
              fs,
              "copyFileSync",
              (...args: Parameters<typeof fs.copyFileSync>) => {
                if (path.basename(String(args[1])).startsWith("imported-")) {
                  injected = true;
                  throw new Error("TEST simulated recovery copy failure");
                }
                return originalCopy(...args);
              },
            );
      syncBuiltinESMExports();
      try {
        assert.throws(() => importBackup(backup.bytes), /TEST simulated/);
        assert.equal(injected, true);
        assert.deepEqual(getSnapshot(), current);
        assert.equal(teacherSnapshot().documents[0].storageName, stored);
      } finally {
        fault.mock.restore();
        syncBuiltinESMExports();
      }
    });

  await t.test("invalid relations roll back all record replacements", () => {
    const entries = unzipSync(backup.bytes);
    const fixture = path.join(dataDirectory, "TEST-invalid-relations.sqlite");
    fs.writeFileSync(fixture, entries["molot.sqlite"]);
    const invalid = new DatabaseSync(fixture);
    try {
      invalid.exec("PRAGMA foreign_keys=OFF");
      invalid.prepare("UPDATE Grade SET subjectId=?").run(randomUUID());
    } finally {
      invalid.close();
    }
    entries["molot.sqlite"] = fs.readFileSync(fixture);
    assert.throws(
      () => importBackup(zipSync(entries)),
      /nekonzistentné vzťahy/,
    );
    assert.deepEqual(getSnapshot(), current);
  });

  await t.test(
    "shared files restore consistently and persist on a new connection",
    () => {
      const result = importBackup(backup.bytes);
      assert.equal(result.ok, true);
      assert.ok(fs.existsSync(result.previousBackup));
      assert.equal(
        getSnapshot().subjects.some((s) => s.id === currentSubjectId),
        false,
      );
      assert.equal(getSnapshot().grades[0].weight, 3);
      const restored = teacherSnapshot().documents;
      assert.equal(restored.length, 2);
      assert.equal(restored[0].storageName, restored[1].storageName);
      assert.notEqual(restored[0].storageName, stored);
      for (const document of restored)
        assert.equal(
          fs.readFileSync(
            path.join(teacherDirectory, document.storageName!),
            "utf8",
          ),
          "TEST shared document",
        );
      assert.ok(
        fs.existsSync(path.join(teacherDirectory, stored)),
        "original file preserved",
      );
      assert.ok(
        fs
          .readdirSync(modelsDirectory)
          .some((name) => name.startsWith("import-")),
      );
      const reopened = new DatabaseSync(databasePath, { readOnly: true });
      try {
        assert.equal(
          reopened.prepare("SELECT COUNT(*) AS n FROM Subject").get()?.n,
          1,
        );
        assert.equal(
          reopened
            .prepare(
              "SELECT COUNT(DISTINCT storageName) AS n FROM TeacherDocument",
            )
            .get()?.n,
          1,
        );
        assert.equal(
          reopened.prepare("PRAGMA foreign_key_check").all().length,
          0,
        );
      } finally {
        reopened.close();
      }
    },
  );
});
