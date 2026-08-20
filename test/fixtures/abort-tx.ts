import Database from "better-sqlite3";

const file = process.argv[2];
if (!file) process.exit(2);
const db = new Database(file);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = FULL");
db.exec("BEGIN IMMEDIATE");
db.prepare(
  "INSERT INTO pedidos (mesa_id, preset, cubiertos, estado, mesero_id, abierto_en) VALUES (NULL, 'salon', 1, 'borrador', NULL, ?)",
).run(new Date().toISOString());
process.exit(1);
