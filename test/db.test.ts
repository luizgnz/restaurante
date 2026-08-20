import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { migrate } from "../src/db/migrate.ts";
import { openSalonDb } from "../src/db/open.ts";

describe("db", () => {
  it("abre con WAL y synchronous FULL", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rest-db-"));
    mkdirSync(path.join(dir, "data"), { recursive: true });
    const db = openSalonDb(path.join(dir, "data", "salon.sqlite"), "linux");
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(Number(db.pragma("synchronous", { simple: true }))).toBe(2);
    db.close();
  });

  it("en darwin activa fullfsync", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rest-db-"));
    mkdirSync(path.join(dir, "data"), { recursive: true });
    const db = openSalonDb(path.join(dir, "data", "salon.sqlite"), "darwin");
    expect(Number(db.pragma("fullfsync", { simple: true }))).toBe(1);
    db.close();
  });

  it("migrate crea schema_migrations y tablas núcleo", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rest-db-"));
    mkdirSync(path.join(dir, "data"), { recursive: true });
    const db = openSalonDb(path.join(dir, "data", "salon.sqlite"), "linux");
    migrate(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const names = tables.map((t) => t.name);
    for (const t of [
      "schema_migrations",
      "empleados",
      "pisos",
      "mesas",
      "productos",
      "receta_lineas",
      "stock",
      "pedidos",
      "pedido_lineas",
      "comandas",
      "comanda_lineas",
      "print_jobs",
      "precuentas",
      "caja_handoffs",
      "sesiones_pos",
    ]) {
      expect(names).toContain(t);
    }
    db.close();
  });

  it("migrate es idempotente", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rest-db-"));
    mkdirSync(path.join(dir, "data"), { recursive: true });
    const db = openSalonDb(path.join(dir, "data", "salon.sqlite"), "linux");
    migrate(db);
    migrate(db);
    const n = db.prepare("SELECT count(*) AS c FROM schema_migrations").get() as { c: number };
    expect(n.c).toBeGreaterThanOrEqual(4);
    db.close();
  });
});
