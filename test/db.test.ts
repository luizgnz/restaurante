import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { migrate } from "../src/db/migrate.ts";
import { openSalonDb } from "../src/db/open.ts";
import { openTestDb } from "./helpers.ts";

describe("db", () => {
  it("abre con WAL y synchronous FULL", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rest-db-"));
    mkdirSync(path.join(dir, "data"), { recursive: true });
    const db = openSalonDb(path.join(dir, "data", "salon.sqlite"), "linux");
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(Number(db.pragma("synchronous", { simple: true }))).toBe(2);
    expect(Number(db.pragma("foreign_keys", { simple: true }))).toBe(1);
    db.close();
  });

  it("rechaza un INSERT con FK inválida, no solo el pragma", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rest-db-"));
    mkdirSync(path.join(dir, "data"), { recursive: true });
    const db = openSalonDb(path.join(dir, "data", "salon.sqlite"), "linux");
    migrate(db);
    expect(Number(db.pragma("foreign_keys", { simple: true }))).toBe(1);
    db.prepare("INSERT INTO empleados (nombre, pin_hash, derecho) VALUES (?, ?, ?)").run("Ana", "hash", "basico");
    expect(() =>
      db
        .prepare(
          "INSERT INTO comandas (orden_id, envio_n, mesero_id, creada_en, tipo) VALUES (999999, 1, 1, ?, 'orden')",
        )
        .run("2026-08-22T12:00:00.000Z"),
    ).toThrow(/FOREIGN KEY/i);
    expect(db.prepare("SELECT count(*) AS c FROM comandas").get() as { c: number }).toEqual({ c: 0 });
    db.close();

    const viaHelper = openTestDb();
    expect(Number(viaHelper.pragma("foreign_keys", { simple: true }))).toBe(1);
    viaHelper.close();
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

  it("crea el esquema de cuentas y órdenes", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rest-db-"));
    mkdirSync(path.join(dir, "data"), { recursive: true });
    const db = openSalonDb(path.join(dir, "data", "salon.sqlite"), "linux");
    migrate(db);
    const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    expect(tablas.map((x) => x.name)).toEqual(
      expect.arrayContaining([
        "cuentas",
        "ordenes",
        "orden_lineas",
        "orden_correcciones",
        "orden_correccion_lineas",
        "auditoria_anulaciones",
      ]),
    );
    db.close();
  });

  it("crea índices únicos con nombres exactos del brief", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rest-db-"));
    mkdirSync(path.join(dir, "data"), { recursive: true });
    const db = openSalonDb(path.join(dir, "data", "salon.sqlite"), "linux");
    migrate(db);
    const indices = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    expect(indices.map((x) => x.name)).toEqual(
      expect.arrayContaining([
        "cuenta_activa_mesa_unica",
        "orden_numero_cuenta_unico",
        "orden_idempotencia_unica",
        "orden_linea_clave_unica",
        "correccion_linea_clave_unica",
        "correccion_idempotencia_unica",
        "precuenta_vigente_cuenta_unica",
        "precuenta_numero_cuenta_unico",
        "handoff_cuenta_unico",
      ]),
    );
    db.close();
  });

  it("una precuenta o un handoff son de un pedido o de una cuenta, nunca de ambos", () => {
    const db = openTestDb();
    const mesaId = Number(
      db.prepare("INSERT INTO pisos (nombre) VALUES ('Salón')").run().lastInsertRowid,
    );
    db.prepare(
      "INSERT INTO mesas (piso_id, numero, asientos, activa, pos_x, pos_y, forma, ancho, alto) VALUES (?, 7, 4, 1, 0, 0, 'square', 10, 10)",
    ).run(mesaId);
    const mesa = (db.prepare("SELECT id FROM mesas WHERE numero = 7").get() as { id: number }).id;
    db.prepare("INSERT INTO empleados (nombre, pin_hash, derecho) VALUES ('Ana', 'hash', 'basico')").run();
    const pedidoId = Number(
      db
        .prepare(
          "INSERT INTO pedidos (mesa_id, preset, cubiertos, estado, mesero_id, abierto_en) VALUES (?, 'salon', 4, 'borrador', 1, '2026-08-22T12:00:00.000Z')",
        )
        .run(mesa).lastInsertRowid,
    );
    const cuentaId = Number(
      db
        .prepare(
          "INSERT INTO cuentas (mesa_id, estado, abierta_por_empleado_id, abierta_en) VALUES (?, 'abierta', 1, '2026-08-22T12:00:00.000Z')",
        )
        .run(mesa).lastInsertRowid,
    );
    const insertar = db.prepare(
      "INSERT INTO precuentas (pedido_id, cuenta_id, numero, vigente, mesero_id, snapshot_json, emitida_en) VALUES (?, ?, ?, 1, 1, '{}', '2026-08-22T12:00:00.000Z')",
    );

    expect(() => insertar.run(pedidoId, cuentaId, 1)).toThrow(/CHECK/i);
    expect(() => insertar.run(null, null, 1)).toThrow(/CHECK/i);
    insertar.run(null, cuentaId, 1);
    // Dos vigentes en la misma cuenta harían que caja tomara cualquiera.
    expect(() => insertar.run(null, cuentaId, 2)).toThrow(/UNIQUE/i);
    expect(() => insertar.run(pedidoId, null, 1)).not.toThrow();

    const precuentaId = (
      db.prepare("SELECT id FROM precuentas WHERE cuenta_id = ?").get(cuentaId) as { id: number }
    ).id;
    const handoff = db.prepare(
      "INSERT INTO caja_handoffs (pedido_id, cuenta_id, precuenta_id, mesero_id, snapshot_json, creado_en) VALUES (?, ?, ?, 1, '{}', '2026-08-22T12:00:00.000Z')",
    );
    expect(() => handoff.run(pedidoId, cuentaId, precuentaId)).toThrow(/CHECK/i);
    expect(() => handoff.run(null, null, precuentaId)).toThrow(/CHECK/i);
    handoff.run(null, cuentaId, precuentaId);
    expect(() => handoff.run(null, cuentaId, precuentaId)).toThrow(/UNIQUE/i);
    // Sin precuenta obligatoria el handoff puede no tenerla; 0 nunca fue un id.
    expect(() => handoff.run(pedidoId, null, null)).not.toThrow();
    db.close();
  });

  it("extiende tablas legacy con columnas de compatibilidad nullable", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rest-db-"));
    mkdirSync(path.join(dir, "data"), { recursive: true });
    const db = openSalonDb(path.join(dir, "data", "salon.sqlite"), "linux");
    migrate(db);
    const cols = (tabla: string) =>
      (db.prepare(`PRAGMA table_info(${tabla})`).all() as { name: string; notnull: number }[]).map((c) => ({
        name: c.name,
        notnull: c.notnull,
      }));

    const comandas = cols("comandas");
    expect(comandas).toEqual(
      expect.arrayContaining([
        { name: "pedido_id", notnull: 0 },
        { name: "orden_id", notnull: 0 },
        { name: "correccion_id", notnull: 0 },
        { name: "tipo", notnull: 1 },
      ]),
    );
    const comandaLineas = cols("comanda_lineas");
    expect(comandaLineas).toEqual(
      expect.arrayContaining([
        { name: "pedido_linea_id", notnull: 0 },
        { name: "orden_linea_id", notnull: 0 },
        { name: "orden_correccion_linea_id", notnull: 0 },
      ]),
    );

    const fk = (tabla: string) =>
      (db.prepare(`PRAGMA foreign_key_list(${tabla})`).all() as { table: string; from: string; to: string }[]).map(
        (r) => ({ table: r.table, from: r.from, to: r.to }),
      );
    expect(fk("comandas")).toEqual(
      expect.arrayContaining([
        { table: "pedidos", from: "pedido_id", to: "id" },
        { table: "ordenes", from: "orden_id", to: "id" },
        { table: "orden_correcciones", from: "correccion_id", to: "id" },
        { table: "empleados", from: "mesero_id", to: "id" },
      ]),
    );
    expect(fk("comanda_lineas")).toEqual(
      expect.arrayContaining([
        { table: "comandas", from: "comanda_id", to: "id" },
        { table: "pedido_lineas", from: "pedido_linea_id", to: "id" },
        { table: "orden_lineas", from: "orden_linea_id", to: "id" },
        { table: "orden_correccion_lineas", from: "orden_correccion_linea_id", to: "id" },
      ]),
    );

    // Una precuenta o un handoff pertenecen a un pedido legacy **o** a una
    // cuenta, nunca a los dos: por eso `pedido_id` deja de ser NOT NULL.
    const precuentas = cols("precuentas");
    expect(precuentas).toEqual(
      expect.arrayContaining([
        { name: "pedido_id", notnull: 0 },
        { name: "cuenta_id", notnull: 0 },
      ]),
    );
    expect(fk("precuentas")).toEqual(
      expect.arrayContaining([
        { table: "pedidos", from: "pedido_id", to: "id" },
        { table: "cuentas", from: "cuenta_id", to: "id" },
        { table: "empleados", from: "mesero_id", to: "id" },
      ]),
    );

    const cajaHandoffs = cols("caja_handoffs");
    expect(cajaHandoffs).toEqual(
      expect.arrayContaining([
        { name: "pedido_id", notnull: 0 },
        { name: "cuenta_id", notnull: 0 },
        { name: "precuenta_id", notnull: 0 },
      ]),
    );
    expect(fk("caja_handoffs")).toEqual(
      expect.arrayContaining([
        { table: "pedidos", from: "pedido_id", to: "id" },
        { table: "cuentas", from: "cuenta_id", to: "id" },
        { table: "precuentas", from: "precuenta_id", to: "id" },
        { table: "empleados", from: "mesero_id", to: "id" },
      ]),
    );

    const ordenLineas = cols("orden_lineas");
    expect(ordenLineas).toEqual(expect.arrayContaining([{ name: "linea_clave", notnull: 1 }]));
    const correccionLineas = cols("orden_correccion_lineas");
    expect(correccionLineas).toEqual(
      expect.arrayContaining([
        { name: "linea_clave", notnull: 1 },
        { name: "precio_centavos", notnull: 1 },
      ]),
    );
    const correcciones = cols("orden_correcciones");
    expect(correcciones).toEqual(
      expect.arrayContaining([
        { name: "clave_idempotencia", notnull: 1 },
        { name: "indicaciones", notnull: 0 },
      ]),
    );
    expect(
      (db.prepare("PRAGMA index_info(correccion_idempotencia_unica)").all() as { name: string }[]).map((c) => c.name),
    ).toEqual(["orden_id", "clave_idempotencia"]);

    const libro = cols("orden_linea_inventario");
    expect(libro).toEqual(
      expect.arrayContaining([
        { name: "orden_id", notnull: 1 },
        { name: "linea_clave", notnull: 1 },
        { name: "producto_id", notnull: 1 },
        { name: "cantidad_por_unidad", notnull: 1 },
        { name: "reservada_real", notnull: 1 },
        { name: "firmada_real", notnull: 1 },
      ]),
    );
    expect(fk("orden_linea_inventario")).toEqual(
      expect.arrayContaining([
        { table: "ordenes", from: "orden_id", to: "id" },
        { table: "productos", from: "producto_id", to: "id" },
      ]),
    );
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
