import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
  constants,
} from "node:fs";
import path from "node:path";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { AppError, getDatabase, transaction } from "./db";
import { backupDirectory, dataDirectory } from "./paths";
import { logEvent } from "./logger";
import { isStudentTraining } from "../ml/student/service";
const maximumBytes = 100 * 1024 * 1024;
const coreTables = [
  "Subject",
  "Grade",
  "Test",
  "TestResult",
  "StudySession",
  "ReadinessEntry",
  "UploadedMaterial",
  "ErrorEntry",
  "Settings",
];
export function createBackup() {
  mkdirSync(backupDirectory, { recursive: true });
  const name = `molot-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const snapshot = path.join(backupDirectory, `${name}.sqlite`);
  getDatabase().prepare("VACUUM INTO ?").run(snapshot);
  const entries: Record<string, Uint8Array> = {
    "molot.sqlite": readFileSync(snapshot),
    "manifest.json": strToU8(
      JSON.stringify({
        format: "molot-backup",
        version: 1,
        createdAt: new Date().toISOString(),
      }),
    ),
  };
  let size = entries["molot.sqlite"].length;
  for (const folder of ["uploads", "teacher-tests", "models"]) {
    const directory = path.join(
      /* turbopackIgnore: true */ dataDirectory,
      folder,
    );
    mkdirSync(directory, { recursive: true });
    for (const entry of readdirSync(/* turbopackIgnore: true */ directory, {
      withFileTypes: true,
    })) {
      if (!entry.isFile() || !safeFile(`${folder}/${entry.name}`)) continue;
      const bytes = readFileSync(
        /* turbopackIgnore: true */ path.join(
          /* turbopackIgnore: true */ directory,
          entry.name,
        ),
      );
      size += bytes.length;
      if (size > maximumBytes)
        throw new AppError(
          "Záloha prekračuje limit 100 MB tejto verzie. Väčšie materiály zálohuj skopírovaním dátového priečinka pri zatvorenom Molote.",
        );
      entries[`${folder}/${entry.name}`] = bytes;
    }
  }
  const bytes = Buffer.from(zipSync(entries, { level: 3 })),
    file = path.join(backupDirectory, `${name}.zip`);
  writeFileSync(file, bytes, { flag: "wx" });
  logEvent("backup_created", { bytes: bytes.length });
  return { bytes, file, name: `${name}.zip` };
}
function safeFile(name: string) {
  return (
    /^(uploads|teacher-tests)\/[a-f0-9-]+\.(pdf|png|jpg|txt|docx)$/.test(
      name,
    ) || /^models\/[a-zA-Z0-9_-]+\.json$/.test(name) || name === "models/mini-ai-feedback.jsonl"
  );
}
export function importBackup(bytes: Uint8Array) {
  // Restore is synchronous: training cannot start between this guard and commit.
  if (isStudentTraining())
    throw new AppError(
      "Práve prebieha tréning modelu. Po jeho dokončení zopakuj obnovu zálohy.",
      409,
    );
  let total = 0,
    count = 0;
  const entries = unzipSync(bytes, {
    filter: (file) => {
      total += file.originalSize;
      count++;
      if (total > maximumBytes || count > 5000)
        throw new AppError("Rozbalená záloha je príliš veľká.");
      if (
        !["manifest.json", "molot.sqlite"].includes(file.name) &&
        !safeFile(file.name)
      )
        throw new AppError("Záloha obsahuje nepovolenú cestu.");
      return true;
    },
  });
  if (!entries["manifest.json"] || !entries["molot.sqlite"])
    throw new AppError("Chýba manifest alebo databáza.");
  const manifest = JSON.parse(strFromU8(entries["manifest.json"]));
  if (manifest.format !== "molot-backup" || manifest.version !== 1)
    throw new AppError("Nepodporovaný formát zálohy.");
  const stage = path.join(dataDirectory, "cache", `restore-${randomUUID()}`);
  mkdirSync(stage, { recursive: true });
  const sourcePath = path.join(stage, "molot.sqlite");
  writeFileSync(sourcePath, entries["molot.sqlite"]);
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    source.exec("PRAGMA trusted_schema=OFF");
    if (
      Object.values(source.prepare("PRAGMA integrity_check").get() ?? {})[0] !==
      "ok"
    )
      throw new AppError("Databáza v zálohe je poškodená.");
    const version = Number(
      source.prepare("PRAGMA user_version").get()?.user_version,
    );
    if (version < 1 || version > 5)
      throw new AppError("Nepodporovaná verzia databázy v zálohe.");
    const tables = source
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => String(r.name));
    const db = getDatabase(),
      targetTables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => String(r.name));
    if (coreTables.some((t) => !tables.includes(t)) || tables.some((t) => !targetTables.includes(t)))
      throw new AppError("Schéma zálohy nezodpovedá Molotu.");
    const datasets = tables.map((table) => {
      const columns = db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((r) => String(r.name));
      const sourceColumns = source
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((r) => String(r.name));
      if (columns.join() !== sourceColumns.join())
        throw new AppError("Stĺpce zálohy nezodpovedajú Molotu.");
      return {
        table,
        columns,
        rows: source.prepare(`SELECT ${columns.join(",")} FROM ${table}`).all(),
      };
    });
    // Validate every referenced file before replacing records. Restored files get fresh names.
    const fileMap = new Map<string, string>();
    for (const dataset of datasets.filter((d) =>
      ["UploadedMaterial", "GoalAttachment", "TeacherDocument"].includes(d.table),
    ))
      for (const row of dataset.rows) {
        if (!row.storageName) continue;
        const folder =
            ["UploadedMaterial", "GoalAttachment"].includes(dataset.table) ? "uploads" : "teacher-tests",
          key = `${folder}/${row.storageName}`;
        if (!entries[key] || !safeFile(key))
          throw new AppError("V zálohe chýba materiál odkazovaný databázou.");
        let destination = fileMap.get(key);
        if (!destination) {
          destination = `${folder}/${randomUUID()}${path.extname(String(row.storageName))}`;
          fileMap.set(key, destination);
        }
        row.storageName = path.basename(destination);
      }
    const previous = createBackup();
    for (const [oldName, newName] of fileMap) {
      const target = path.join(dataDirectory, newName);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, entries[oldName], { flag: "wx" });
    }
    // Finish required disk writes before replacing any live records. A failure
    // can leave recovery files, but must leave the current database unchanged.
    for (const [name, content] of Object.entries(entries))
      if (name.startsWith("models/"))
        writeFileSync(
          path.join(
            dataDirectory,
            "models",
            `import-${randomUUID()}-${path.basename(name)}`,
          ),
          content,
          { flag: "wx" },
        );
    copyFileSync(
      sourcePath,
      path.join(backupDirectory, `imported-${randomUUID()}.sqlite`),
      constants.COPYFILE_EXCL,
    );
    transaction(() => {
      db.exec("PRAGMA defer_foreign_keys=ON");
      for (const table of [...targetTables].reverse())
        db.exec(`DELETE FROM ${table}`);
      for (const { table, columns, rows } of datasets) {
        const insert = db.prepare(
          `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
        );
        for (const row of rows) insert.run(...columns.map((c) => row[c]));
      }
      db.exec(
        `INSERT OR IGNORE INTO IntelligenceSettings VALUES ('local','{"frequency":0.35,"recency":0.2,"points":0.15,"repetition":0.15,"material":0.15}')`,
      );
      db.exec(
        `INSERT OR IGNORE INTO Profile (id, createdAt, updatedAt) VALUES ('local', datetime('now'), datetime('now'))`,
      );
      if (db.prepare("PRAGMA foreign_key_check").all().length)
        throw new AppError("Záloha obsahuje nekonzistentné vzťahy.");
    });
    logEvent("backup_restored", { tables: tables.length });
    return { ok: true, previousBackup: previous.file };
  } finally {
    source.close();
  }
}
