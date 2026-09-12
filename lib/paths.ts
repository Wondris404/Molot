import path from "node:path";

const subdirectory = process.env.MOLOT_DATA_SUBDIR || "";
if (subdirectory && !/^[a-zA-Z0-9_-]+$/.test(subdirectory))
  throw new Error("Neplatný testovací priečinok.");
// Only the trusted desktop launcher sets this variable; no HTTP input becomes a path.
export const dataDirectory = process.env.MOLOT_DATA_DIR
  ? path.resolve(process.env.MOLOT_DATA_DIR)
  : path.join(process.cwd(), "data", subdirectory);
export const databasePath = path.join(dataDirectory, "molot.sqlite");
export const uploadDirectory = path.join(dataDirectory, "uploads");
export const modelsDirectory = path.join(dataDirectory, "models");
export const teacherDirectory = path.join(dataDirectory, "teacher-tests");
export const backupDirectory = path.join(dataDirectory, "backups");
export const cacheDirectory = path.join(dataDirectory, "cache");
export const runtimeDirectory =
  process.env.MOLOT_RUNTIME_DIR ||
  path.join(/* turbopackIgnore: true */ process.cwd(), ".cache");
