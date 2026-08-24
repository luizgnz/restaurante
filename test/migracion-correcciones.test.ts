import { describe, expect, it } from "vitest";
import { migrate } from "../src/db/migrate.ts";
import { migrateUpTo, openEmptySalonDb, openTestDb } from "./helpers.ts";

type Columna = { name: string; notnull: number; dflt_value: string | null };

function columnas(db: ReturnType<typeof openTestDb>, tabla: string): Columna[] {
  return db.prepare(`PRAGMA table_info(${tabla})`).all() as Columna[];
}

function columna(db: ReturnType<typeof openTestDb>, tabla: string, nombre: string): Columna | undefined {
  return columnas(db, tabla).find((c) => c.name === nombre);
}

function indices(db: ReturnType<typeof openTestDb>): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'").all() as {
      name: string;
    }[]
  ).map((i) => i.name);
}

function columnasDelIndice(db: ReturnType<typeof openTestDb>, indice: string): string[] {
  return (db.prepare(`PRAGMA index_info(${indice})`).all() as { name: string }[]).map((c) => c.name);
}

function tablas(db: ReturnType<typeof openTestDb>): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
    (t) => t.name,
  );
}

describe("migración 009 sobre una base que ya aplicó 008", () => {
  it("agrega idempotencia, precio congelado e indicaciones sin perder filas ni FK", () => {
    const db = openEmptySalonDb();
    migrateUpTo(db, "008_cuentas_ordenes");
    expect(columna(db, "orden_correcciones", "clave_idempotencia")).toBeUndefined();
    expect(columna(db, "orden_correcciones", "indicaciones")).toBeUndefined();
    expect(columna(db, "orden_correccion_lineas", "precio_centavos")).toBeUndefined();

    db.prepare("INSERT INTO empleados (nombre, pin_hash, derecho) VALUES (?, ?, ?)").run("Ana", "hash", "basico");
    db.prepare("INSERT INTO pisos (nombre) VALUES (?)").run("Salón");
    db.prepare("INSERT INTO mesas (piso_id, numero, asientos) VALUES (1, 7, 4)").run();
    db.prepare("INSERT INTO productos (nombre, precio_centavos, tipo_consumo) VALUES (?, ?, ?)").run(
      "Jugo",
      2500,
      "no_almacenable",
    );
    db.prepare("INSERT INTO productos (nombre, precio_centavos, tipo_consumo) VALUES (?, ?, ?)").run(
      "Hamburguesa",
      8900,
      "no_almacenable",
    );
    db.prepare("INSERT INTO cuentas (mesa_id, estado, abierta_por_empleado_id, abierta_en) VALUES (1, 'abierta', 1, ?)").run(
      "2026-08-22T12:00:00.000Z",
    );
    db.prepare(
      "INSERT INTO ordenes (cuenta_id, numero, estado, creada_por_empleado_id, creada_en, clave_idempotencia) VALUES (1, 1, 'corregida', 1, ?, 'envio-1')",
    ).run("2026-08-22T12:00:00.000Z");
    db.prepare(
      "INSERT INTO orden_lineas (orden_id, producto_id, cantidad, precio_centavos, linea_clave) VALUES (1, 1, 2, 2500, 'l1')",
    ).run();

    // Dos correcciones previas al 009: ninguna tiene clave ni precio.
    for (const version of [1, 2]) {
      db.prepare(
        "INSERT INTO orden_correcciones (orden_id, numero_version, motivo, es_anulacion, creada_por_empleado_id, creada_en) VALUES (1, ?, ?, 0, 1, ?)",
      ).run(version, `motivo ${version}`, `2026-08-22T12:0${version}:00.000Z`);
      db.prepare(
        `INSERT INTO orden_correccion_lineas
          (correccion_id, orden_linea_id, producto_id, cantidad_anterior, cantidad_nueva, linea_clave)
          VALUES (?, 1, ?, 2, ?, ?)`,
      ).run(version, version === 1 ? 1 : 2, version, `l${version}`);
    }
    db.prepare(
      "INSERT INTO comandas (orden_id, correccion_id, envio_n, mesero_id, creada_en, tipo) VALUES (1, 1, 1, 1, ?, 'correccion')",
    ).run("2026-08-22T12:01:00.000Z");
    db.prepare("INSERT INTO comanda_lineas (comanda_id, orden_correccion_linea_id, etapa) VALUES (1, 1, 'cancelado')").run();
    db.prepare(
      `INSERT INTO auditoria_anulaciones
        (cuenta_id, orden_id, correccion_id, mesa_numero, orden_numero, empleado_id, resumen, creada_en)
        VALUES (1, 1, 1, 7, 1, 1, 'Productos anulados: 2 Jugo', ?)`,
    ).run("2026-08-22T12:01:00.000Z");

    const correccionesAntes = db
      .prepare("SELECT id, orden_id, numero_version, motivo, es_anulacion, creada_en FROM orden_correcciones ORDER BY id")
      .all();
    const lineasAntes = db
      .prepare(
        "SELECT id, correccion_id, orden_linea_id, producto_id, cantidad_anterior, cantidad_nueva, linea_clave FROM orden_correccion_lineas ORDER BY id",
      )
      .all();

    migrate(db);

    expect(
      db
        .prepare("SELECT id, orden_id, numero_version, motivo, es_anulacion, creada_en FROM orden_correcciones ORDER BY id")
        .all(),
    ).toEqual(correccionesAntes);
    expect(
      db
        .prepare(
          "SELECT id, correccion_id, orden_linea_id, producto_id, cantidad_anterior, cantidad_nueva, linea_clave FROM orden_correccion_lineas ORDER BY id",
        )
        .all(),
    ).toEqual(lineasAntes);

    const claves = db.prepare("SELECT id, clave_idempotencia FROM orden_correcciones ORDER BY id").all() as {
      id: number;
      clave_idempotencia: string;
    }[];
    expect(claves).toEqual([
      { id: 1, clave_idempotencia: "migracion-009-correccion-1" },
      { id: 2, clave_idempotencia: "migracion-009-correccion-2" },
    ]);
    expect(new Set(claves.map((c) => c.clave_idempotencia)).size).toBe(claves.length);
    expect(db.prepare("SELECT indicaciones FROM orden_correcciones WHERE id = 1").get()).toEqual({
      indicaciones: null,
    });

    // El precio se rellena con el catálogo del producto de cada línea.
    expect(db.prepare("SELECT id, precio_centavos FROM orden_correccion_lineas ORDER BY id").all()).toEqual([
      { id: 1, precio_centavos: 2500 },
      { id: 2, precio_centavos: 8900 },
    ]);

    expect(columna(db, "orden_correcciones", "clave_idempotencia")).toMatchObject({ notnull: 1 });
    expect(columna(db, "orden_correccion_lineas", "precio_centavos")).toMatchObject({ notnull: 1 });
    expect(indices(db)).toEqual(expect.arrayContaining(["correccion_idempotencia_unica"]));
    expect(columnasDelIndice(db, "correccion_idempotencia_unica")).toEqual(["orden_id", "clave_idempotencia"]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);

    // El 010 llega a la misma base: tabla nueva, vacía, sin tocar lo anterior.
    expect(tablas(db)).toContain("orden_linea_inventario");
    expect((db.prepare("SELECT count(*) AS c FROM orden_linea_inventario").get() as { c: number }).c).toBe(0);

    // Los hijos siguen enganchados a las mismas filas.
    expect(
      db
        .prepare(
          `SELECT cl.etapa FROM comanda_lineas cl
           JOIN orden_correccion_lineas ocl ON ocl.id = cl.orden_correccion_linea_id
           JOIN orden_correcciones oc ON oc.id = ocl.correccion_id
           WHERE oc.id = 1`,
        )
        .all(),
    ).toEqual([{ etapa: "cancelado" }]);
    expect(
      (db.prepare("SELECT count(*) AS c FROM auditoria_anulaciones WHERE correccion_id = 1").get() as { c: number }).c,
    ).toBe(1);

    // Y la clave nueva ya es única de verdad.
    expect(() =>
      db
        .prepare(
          "INSERT INTO orden_correcciones (orden_id, numero_version, es_anulacion, creada_por_empleado_id, creada_en, clave_idempotencia) VALUES (1, 3, 0, 1, ?, 'migracion-009-correccion-1')",
        )
        .run("2026-08-22T12:05:00.000Z"),
    ).toThrow(/UNIQUE/i);
    db.close();
  });
});

describe("migración 010 sobre una base que ya aplicó 009", () => {
  it("agrega el libro de inventario sin tocar lo que había", () => {
    const db = openEmptySalonDb();
    migrateUpTo(db, "009_correcciones_idempotencia");
    expect(tablas(db)).not.toContain("orden_linea_inventario");
    const antes = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name").all();

    migrateUpTo(db, "010_inventario_por_linea");

    expect(tablas(db)).toContain("orden_linea_inventario");
    expect(db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name != 'orden_linea_inventario' ORDER BY name").all()).toEqual(
      antes,
    );
    expect(
      (db.prepare("SELECT count(*) AS c FROM schema_migrations WHERE id = ?").get("010_inventario_por_linea") as {
        c: number;
      }).c,
    ).toBe(1);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    db.close();
  });
});

describe("migración limpia 001 → 010", () => {
  it("deja el esquema de correcciones completo", () => {
    const db = openTestDb();

    expect(columna(db, "orden_correcciones", "clave_idempotencia")).toMatchObject({ notnull: 1 });
    expect(columna(db, "orden_correcciones", "indicaciones")).toMatchObject({ notnull: 0 });
    expect(columna(db, "orden_correccion_lineas", "precio_centavos")).toMatchObject({ notnull: 1 });
    expect(indices(db)).toEqual(
      expect.arrayContaining([
        "correccion_idempotencia_unica",
        "correccion_linea_clave_unica",
        "auditoria_anulaciones_cuenta",
        "auditoria_anulaciones_orden",
      ]),
    );
    expect(columnasDelIndice(db, "correccion_idempotencia_unica")).toEqual(["orden_id", "clave_idempotencia"]);
    expect(
      (db.prepare("SELECT count(*) AS c FROM schema_migrations WHERE id = ?").get(
        "009_correcciones_idempotencia",
      ) as { c: number }).c,
    ).toBe(1);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    db.close();
  });

  it("deja el libro de inventario con sus llaves y sus CHECK", () => {
    const db = openTestDb();

    expect(columnas(db, "orden_linea_inventario").map((c) => c.name)).toEqual([
      "orden_id",
      "linea_clave",
      "producto_id",
      "cantidad_por_unidad",
      "reservada_real",
      "firmada_real",
    ]);
    expect(indices(db)).toEqual(
      expect.arrayContaining(["orden_linea_inventario_producto", "orden_linea_inventario_pendiente"]),
    );
    expect(
      (db.prepare("SELECT count(*) AS c FROM schema_migrations WHERE id = ?").get("010_inventario_por_linea") as {
        c: number;
      }).c,
    ).toBe(1);

    db.prepare("INSERT INTO empleados (nombre, pin_hash, derecho) VALUES (?, ?, ?)").run("Ana", "hash", "basico");
    db.prepare("INSERT INTO pisos (nombre) VALUES (?)").run("Salón");
    db.prepare("INSERT INTO mesas (piso_id, numero, asientos) VALUES (1, 7, 4)").run();
    db.prepare("INSERT INTO productos (nombre, precio_centavos, tipo_consumo) VALUES (?, ?, ?)").run(
      "Jugo",
      2500,
      "almacenable_unitario",
    );
    db.prepare("INSERT INTO cuentas (mesa_id, estado, abierta_por_empleado_id, abierta_en) VALUES (1, 'abierta', 1, ?)").run(
      "2026-08-22T12:00:00.000Z",
    );
    db.prepare(
      "INSERT INTO ordenes (cuenta_id, numero, estado, creada_por_empleado_id, creada_en, clave_idempotencia) VALUES (1, 1, 'enviada', 1, ?, 'envio-1')",
    ).run("2026-08-22T12:00:00.000Z");
    const insertar = db.prepare(
      "INSERT INTO orden_linea_inventario (orden_id, linea_clave, producto_id, cantidad_por_unidad, reservada_real, firmada_real) VALUES (?, ?, ?, ?, ?, ?)",
    );

    insertar.run(1, "l1", 1, 1, 2, 0);
    // La misma línea y el mismo insumo no se duplican.
    expect(() => insertar.run(1, "l1", 1, 1, 1, 0)).toThrow(/UNIQUE/i);
    // Ni reserva ni firma pueden quedar negativas, ni la receta valer cero.
    expect(() => insertar.run(1, "l2", 1, 1, -1, 0)).toThrow(/CHECK/i);
    expect(() => insertar.run(1, "l3", 1, 1, 0, -1)).toThrow(/CHECK/i);
    expect(() => insertar.run(1, "l4", 1, 0, 0, 0)).toThrow(/CHECK/i);
    // Y la orden y el producto tienen que existir.
    expect(() => insertar.run(99, "l5", 1, 1, 0, 0)).toThrow(/FOREIGN KEY/i);
    expect(() => insertar.run(1, "l6", 99, 1, 0, 0)).toThrow(/FOREIGN KEY/i);
    db.close();
  });
});

describe("migración 011 sobre una base que ya aplicó 010", () => {
  function baseConHistoriaLegacy() {
    const db = openEmptySalonDb();
    migrateUpTo(db, "010_inventario_por_linea");
    db.prepare("INSERT INTO empleados (nombre, pin_hash, derecho) VALUES (?, ?, ?)").run("Ana", "hash", "basico");
    db.prepare("INSERT INTO pisos (nombre) VALUES (?)").run("Salón");
    db.prepare("INSERT INTO mesas (piso_id, numero, asientos) VALUES (1, 7, 4)").run();
    db.prepare(
      "INSERT INTO pedidos (mesa_id, preset, cubiertos, estado, mesero_id, abierto_en) VALUES (1, 'salon', 4, 'en_caja', 1, ?)",
    ).run("2026-08-22T12:00:00.000Z");
    db.prepare(
      "INSERT INTO precuentas (pedido_id, numero, vigente, mesero_id, snapshot_json, emitida_en) VALUES (1, 1, 1, 1, ?, ?)",
    ).run('{"totalCentavos":5000}', "2026-08-22T12:05:00.000Z");
    db.prepare(
      "INSERT INTO caja_handoffs (pedido_id, precuenta_id, mesero_id, snapshot_json, creado_en) VALUES (1, 1, 1, ?, ?)",
    ).run('{"totalCentavos":5000}', "2026-08-22T12:10:00.000Z");
    return db;
  }

  it("libera pedido_id y precuenta_id sin perder la historia legacy", () => {
    const db = baseConHistoriaLegacy();
    expect(columna(db, "precuentas", "pedido_id")).toMatchObject({ notnull: 1 });
    expect(columna(db, "caja_handoffs", "precuenta_id")).toMatchObject({ notnull: 1 });

    migrate(db);

    expect(columna(db, "precuentas", "pedido_id")).toMatchObject({ notnull: 0 });
    expect(columna(db, "caja_handoffs", "pedido_id")).toMatchObject({ notnull: 0 });
    expect(columna(db, "caja_handoffs", "precuenta_id")).toMatchObject({ notnull: 0 });
    // El rebuild pasa por una tabla puente: las filas y sus ids se conservan.
    expect(db.prepare("SELECT id, pedido_id, cuenta_id, numero, vigente, snapshot_json FROM precuentas").all()).toEqual([
      { id: 1, pedido_id: 1, cuenta_id: null, numero: 1, vigente: 1, snapshot_json: '{"totalCentavos":5000}' },
    ]);
    expect(db.prepare("SELECT id, pedido_id, cuenta_id, precuenta_id FROM caja_handoffs").all()).toEqual([
      { id: 1, pedido_id: 1, cuenta_id: null, precuenta_id: 1 },
    ]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(indices(db)).toEqual(
      expect.arrayContaining(["precuenta_vigente_cuenta_unica", "precuenta_numero_cuenta_unico", "handoff_cuenta_unico"]),
    );
    // La tabla puente no queda de recuerdo.
    expect(tablas(db)).not.toContain("caja_handoffs_puente");
    expect(tablas(db)).not.toContain("precuentas_nueva");
    db.close();
  });

  it("traduce el precuenta_id = 0 del legacy a NULL y deja las FK limpias", () => {
    const db = baseConHistoriaLegacy();
    db.prepare(
      "INSERT INTO pedidos (mesa_id, preset, cubiertos, estado, mesero_id, abierto_en) VALUES (1, 'salon', 2, 'en_caja', 1, ?)",
    ).run("2026-08-22T13:00:00.000Z");
    // El `enviarACaja` legacy insertaba 0 cuando no había precuenta vigente y la
    // configuración no la exigía. Se reproduce con las FK apagadas porque es la
    // única forma en que ese 0 pudo entrar: una base abierta sin el pragma.
    db.pragma("foreign_keys = OFF");
    db.prepare(
      "INSERT INTO caja_handoffs (pedido_id, precuenta_id, mesero_id, snapshot_json, creado_en) VALUES (2, 0, 1, '{}', ?)",
    ).run("2026-08-22T13:05:00.000Z");
    db.pragma("foreign_keys = ON");
    expect(db.prepare("PRAGMA foreign_key_check").all()).not.toEqual([]);

    migrate(db);

    expect(db.prepare("SELECT id, pedido_id, precuenta_id FROM caja_handoffs ORDER BY id").all()).toEqual([
      { id: 1, pedido_id: 1, precuenta_id: 1 },
      { id: 2, pedido_id: 2, precuenta_id: null },
    ]);
    // Lo que importa: la migración no arrastra la referencia rota.
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    db.close();
  });

  it("no toca ninguna otra tabla salvo los marcadores de la migración legacy posterior", () => {
    const db = baseConHistoriaLegacy();
    const antes = db
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT IN ('precuentas', 'caja_handoffs', 'cuentas', 'ordenes', 'contorno_grupos', 'contorno_variantes', 'plato_slots', 'plato_slot_grupos', 'orden_linea_contornos', 'inventario_movimientos', 'cocina_incidencias') ORDER BY name",
      )
      .all();

    migrate(db);

    expect(
      db
        .prepare(
          "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT IN ('precuentas', 'caja_handoffs', 'cuentas', 'ordenes', 'contorno_grupos', 'contorno_variantes', 'plato_slots', 'plato_slot_grupos', 'orden_linea_contornos', 'inventario_movimientos', 'cocina_incidencias') ORDER BY name",
        )
        .all(),
    ).toEqual(antes);
    expect(columna(db, "cuentas", "legacy_pedido_id")).toBeDefined();
    expect(columna(db, "ordenes", "legacy_envio_n")).toBeDefined();
    db.close();
  });

  it("los índices por cuenta no estorban a varias precuentas legacy del mismo pedido", () => {
    const db = baseConHistoriaLegacy();
    migrate(db);

    // El flujo legacy numera y reemite por pedido; los índices parciales solo
    // miran las filas con cuenta.
    db.prepare("UPDATE precuentas SET vigente = 0 WHERE id = 1").run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO precuentas (pedido_id, numero, vigente, mesero_id, snapshot_json, emitida_en) VALUES (1, 2, 1, 1, '{}', ?)",
        )
        .run("2026-08-22T12:20:00.000Z"),
    ).not.toThrow();
    expect(() =>
      db
        .prepare(
          "INSERT INTO caja_handoffs (pedido_id, precuenta_id, mesero_id, snapshot_json, creado_en) VALUES (1, 2, 1, '{}', ?)",
        )
        .run("2026-08-22T12:25:00.000Z"),
    ).not.toThrow();
    db.close();
  });
});

describe("las migraciones ya revisadas quedan congeladas", () => {
  it("008 no declara nada de las rondas posteriores", () => {
    const db = openEmptySalonDb();
    migrateUpTo(db, "008_cuentas_ordenes");
    expect(columnas(db, "orden_correcciones").map((c) => c.name)).toEqual([
      "id",
      "orden_id",
      "numero_version",
      "motivo",
      "es_anulacion",
      "creada_por_empleado_id",
      "creada_en",
    ]);
    expect(columnas(db, "orden_correccion_lineas").map((c) => c.name)).toEqual([
      "id",
      "correccion_id",
      "orden_linea_id",
      "producto_id",
      "cantidad_anterior",
      "cantidad_nueva",
      "nota_anterior",
      "nota_nueva",
      "linea_clave",
    ]);
    expect(columnas(db, "cuentas").map((c) => c.name)).toEqual([
      "id",
      "mesa_id",
      "estado",
      "abierta_por_empleado_id",
      "abierta_en",
      "cerrada_en",
      "nota_privada",
    ]);
    expect(columnas(db, "ordenes").map((c) => c.name)).toEqual([
      "id",
      "cuenta_id",
      "numero",
      "estado",
      "indicaciones",
      "creada_por_empleado_id",
      "creada_en",
      "clave_idempotencia",
    ]);
    expect(columnas(db, "orden_lineas").map((c) => c.name)).toEqual([
      "id",
      "orden_id",
      "producto_id",
      "cantidad",
      "precio_centavos",
      "nota",
      "linea_clave",
    ]);
    expect(indices(db)).not.toContain("correccion_idempotencia_unica");
    expect(indices(db)).not.toContain("auditoria_anulaciones_cuenta");
    expect(tablas(db)).not.toContain("orden_linea_inventario");
    db.close();
  });

  it("009 no declara nada del libro de inventario", () => {
    const db = openEmptySalonDb();
    migrateUpTo(db, "009_correcciones_idempotencia");
    expect(tablas(db)).not.toContain("orden_linea_inventario");
    expect(indices(db)).not.toContain("orden_linea_inventario_pendiente");
    db.close();
  });
});
