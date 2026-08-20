import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY
    );
  `);
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const id = file.replace(/\.sql$/, "");
    const applied = db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(id);
    if (applied) continue;
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (id) VALUES (?)").run(id);
    })();
  }
}
