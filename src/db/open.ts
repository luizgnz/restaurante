import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export function openSalonDb(
  filePath: string,
  platform: NodeJS.Platform = process.platform,
): Database.Database {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = FULL");
  if (platform === "darwin") {
    db.pragma("fullfsync = ON");
  }
  return db;
}
