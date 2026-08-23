import { describe, expect, it } from "vitest";
import { migrate } from "../src/db/migrate.ts";
import { migrateUpTo, openEmptySalonDb, openTestDb } from "./helpers.ts";

describe("migración 008 de comandas con datos legacy", () => {
  it("conserva filas, ids y FK al reconstruir sobre un fixture no vacío", () => {
    const db = openEmptySalonDb();
    migrateUpTo(db, "007_notas_pedido");

    db.prepare("INSERT INTO empleados (nombre, pin_hash, derecho) VALUES (?, ?, ?)").run("Ana", "hash", "basico");
    db.prepare("INSERT INTO pisos (nombre) VALUES (?)").run("Salón");
    db.prepare("INSERT INTO mesas (piso_id, numero, asientos) VALUES (1, 7, 4)").run();
    db.prepare("INSERT INTO productos (nombre, precio_centavos, tipo_consumo) VALUES (?, ?, ?)").run(
      "Hamburguesa",
      8900,
      "no_almacenable",
    );
    db.prepare(
      "INSERT INTO pedidos (mesa_id, preset, cubiertos, estado, mesero_id, abierto_en) VALUES (1, 'salon', 4, 'enviado', 1, ?)",
    ).run("2026-08-20T12:00:00.000Z");
    db.prepare(
      "INSERT INTO pedido_lineas (pedido_id, producto_id, cantidad, estado, precio_centavos) VALUES (1, 1, 2, 'enviada', 8900)",
    ).run();
    db.prepare("INSERT INTO pedido_lineas (pedido_id, producto_id, cantidad, estado, precio_centavos) VALUES (1, 1, 1, 'enviada', 8900)").run();
    const comandaA = Number(
      db.prepare("INSERT INTO comandas (pedido_id, envio_n, mesero_id, creada_en) VALUES (1, 1, 1, ?)").run(
        "2026-08-20T12:01:00.000Z",
      ).lastInsertRowid,
    );
    const comandaB = Number(
      db.prepare("INSERT INTO comandas (pedido_id, envio_n, mesero_id, creada_en) VALUES (1, 2, 1, ?)").run(
        "2026-08-20T12:05:00.000Z",
      ).lastInsertRowid,
    );
    db.prepare("INSERT INTO comanda_lineas (comanda_id, pedido_linea_id, etapa) VALUES (?, 1, 'por_preparar')").run(comandaA);
    db.prepare("INSERT INTO comanda_lineas (comanda_id, pedido_linea_id, etapa) VALUES (?, 2, 'en_proceso')").run(comandaB);

    const comandasAntes = db.prepare("SELECT id, pedido_id, envio_n, mesero_id, creada_en FROM comandas ORDER BY id").all();
    const lineasAntes = db
      .prepare("SELECT id, comanda_id, pedido_linea_id, etapa FROM comanda_lineas ORDER BY id")
      .all();
    expect(comandasAntes).toHaveLength(2);
    expect(lineasAntes).toHaveLength(2);

    migrate(db);

    const comandasDespues = db
      .prepare("SELECT id, pedido_id, envio_n, mesero_id, creada_en, orden_id, correccion_id, tipo FROM comandas ORDER BY id")
      .all() as {
      id: number;
      pedido_id: number;
      envio_n: number;
      mesero_id: number;
      creada_en: string;
      orden_id: number | null;
      correccion_id: number | null;
      tipo: string;
    }[];
    const lineasDespues = db
      .prepare(
        "SELECT id, comanda_id, pedido_linea_id, orden_linea_id, orden_correccion_linea_id, etapa FROM comanda_lineas ORDER BY id",
      )
      .all() as {
      id: number;
      comanda_id: number;
      pedido_linea_id: number | null;
      orden_linea_id: number | null;
      orden_correccion_linea_id: number | null;
      etapa: string;
    }[];

    expect(comandasDespues.map(({ id, pedido_id, envio_n, mesero_id, creada_en }) => ({
      id,
      pedido_id,
      envio_n,
      mesero_id,
      creada_en,
    }))).toEqual(comandasAntes);
    expect(comandasDespues.every((c) => c.tipo === "legacy")).toBe(true);
    expect(comandasDespues.every((c) => c.orden_id === null && c.correccion_id === null)).toBe(true);
    expect(lineasDespues.map(({ id, comanda_id, pedido_linea_id, etapa }) => ({
      id,
      comanda_id,
      pedido_linea_id,
      etapa,
    }))).toEqual(lineasAntes);
    expect(lineasDespues.every((l) => l.orden_linea_id === null && l.orden_correccion_linea_id === null)).toBe(true);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    db.close();
  });

  it("rechaza combinaciones de origen y tipo inválidas", () => {
    const db = openTestDb();
    db.prepare("INSERT INTO empleados (nombre, pin_hash, derecho) VALUES (?, ?, ?)").run("Ana", "hash", "basico");
    db.prepare("INSERT INTO pisos (nombre) VALUES (?)").run("Salón");
    db.prepare("INSERT INTO mesas (piso_id, numero, asientos) VALUES (1, 7, 4)").run();
    db.prepare("INSERT INTO productos (nombre, precio_centavos, tipo_consumo) VALUES (?, ?, ?)").run(
      "Jugo",
      2500,
      "no_almacenable",
    );
    db.prepare(
      "INSERT INTO pedidos (mesa_id, preset, cubiertos, estado, mesero_id, abierto_en) VALUES (1, 'salon', 2, 'enviado', 1, ?)",
    ).run("2026-08-22T12:00:00.000Z");
    db.prepare(
      "INSERT INTO pedido_lineas (pedido_id, producto_id, cantidad, estado, precio_centavos) VALUES (1, 1, 1, 'enviada', 2500)",
    ).run();
    db.prepare("INSERT INTO cuentas (mesa_id, estado, abierta_por_empleado_id, abierta_en) VALUES (1, 'abierta', 1, ?)").run(
      "2026-08-22T12:00:00.000Z",
    );
    db.prepare(
      "INSERT INTO ordenes (cuenta_id, numero, estado, creada_por_empleado_id, creada_en, clave_idempotencia) VALUES (1, 1, 'enviada', 1, ?, 'k')",
    ).run("2026-08-22T12:00:00.000Z");
    db.prepare(
      "INSERT INTO orden_lineas (orden_id, producto_id, cantidad, precio_centavos, linea_clave) VALUES (1, 1, 1, 2500, 'l1')",
    ).run();
    db.prepare(
      "INSERT INTO orden_correcciones (orden_id, numero_version, es_anulacion, creada_por_empleado_id, creada_en) VALUES (1, 1, 0, 1, ?)",
    ).run("2026-08-22T12:01:00.000Z");
    db.prepare(
      "INSERT INTO orden_correccion_lineas (correccion_id, producto_id, cantidad_anterior, cantidad_nueva, linea_clave) VALUES (1, 1, 1, 0, 'l1')",
    ).run();

    expect(() =>
      db
        .prepare(
          "INSERT INTO comandas (pedido_id, envio_n, mesero_id, creada_en, tipo) VALUES (1, 1, 1, ?, 'otro')",
        )
        .run("2026-08-22T12:02:00.000Z"),
    ).toThrow(/CHECK/i);
    expect(() =>
      db
        .prepare(
          "INSERT INTO comandas (pedido_id, orden_id, envio_n, mesero_id, creada_en, tipo) VALUES (1, 1, 1, 1, ?, 'orden')",
        )
        .run("2026-08-22T12:02:00.000Z"),
    ).toThrow(/CHECK/i);
    expect(() =>
      db
        .prepare("INSERT INTO comandas (orden_id, envio_n, mesero_id, creada_en, tipo) VALUES (1, 1, 1, ?, 'legacy')")
        .run("2026-08-22T12:02:00.000Z"),
    ).toThrow(/CHECK/i);
    expect(() =>
      db
        .prepare("INSERT INTO comandas (orden_id, envio_n, mesero_id, creada_en, tipo) VALUES (1, 1, 1, ?, 'correccion')")
        .run("2026-08-22T12:02:00.000Z"),
    ).toThrow(/CHECK/i);

    const comandaOrden = Number(
      db
        .prepare("INSERT INTO comandas (orden_id, envio_n, mesero_id, creada_en, tipo) VALUES (1, 1, 1, ?, 'orden')")
        .run("2026-08-22T12:03:00.000Z").lastInsertRowid,
    );
    const comandaLegacy = Number(
      db
        .prepare("INSERT INTO comandas (pedido_id, envio_n, mesero_id, creada_en, tipo) VALUES (1, 2, 1, ?, 'legacy')")
        .run("2026-08-22T12:03:00.000Z").lastInsertRowid,
    );
    db.prepare(
      "INSERT INTO comandas (orden_id, correccion_id, envio_n, mesero_id, creada_en, tipo) VALUES (1, 1, 3, 1, ?, 'correccion')",
    ).run("2026-08-22T12:03:00.000Z");

    expect(() =>
      db
        .prepare("INSERT INTO comanda_lineas (comanda_id, etapa) VALUES (?, 'por_preparar')")
        .run(comandaOrden),
    ).toThrow(/CHECK/i);
    expect(() =>
      db
        .prepare(
          "INSERT INTO comanda_lineas (comanda_id, pedido_linea_id, orden_linea_id, etapa) VALUES (?, 1, 1, 'por_preparar')",
        )
        .run(comandaOrden),
    ).toThrow(/CHECK/i);
    db.prepare("INSERT INTO comanda_lineas (comanda_id, orden_linea_id, etapa) VALUES (?, 1, 'por_preparar')").run(
      comandaOrden,
    );
    db.prepare("INSERT INTO comanda_lineas (comanda_id, pedido_linea_id, etapa) VALUES (?, 1, 'por_preparar')").run(
      comandaLegacy,
    );
    db.close();
  });
});
