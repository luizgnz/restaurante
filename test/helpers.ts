import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "../src/db/migrate.ts";
import { openSalonDb } from "../src/db/open.ts";

export function openTestDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "rest-"));
  mkdirSync(path.join(dir, "data"), { recursive: true });
  const db = openSalonDb(path.join(dir, "data", "salon.sqlite"), "linux");
  migrate(db);
  return db;
}
