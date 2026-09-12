import { databasePath, getDatabase } from "../lib/db";
getDatabase();
console.log(`SQLite pripravená: ${databasePath}`);
