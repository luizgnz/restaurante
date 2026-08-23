import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { migrarPedidosACuentas } from "../src/modules/migracion/pedidos-a-cuentas.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { openTestDb } from "./helpers.ts";

describe("migración de pedidos a cuentas", () => {
  it("reconstruye envíos, conserva historia y exporta lo pendiente", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    const mesero = await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "avanzado" });
    const ahora = new Date().toISOString();
    const pedidoId = Number(
      db
        .prepare(
          `INSERT INTO pedidos (mesa_id, preset, cubiertos, estado, mesero_id, abierto_en, nota_privada, indicaciones)
           VALUES (?, 'salon', 4, 'en_caja', ?, ?, 'cliente frecuente', 'sin apuro')`,
        )
        .run(ids.mesa7, mesero.id, ahora).lastInsertRowid,
    );
    const insertarLinea = db.prepare(
      `INSERT INTO pedido_lineas (pedido_id, producto_id, cantidad, nota, estado, precio_centavos)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const hamburguesa = Number(insertarLinea.run(pedidoId, ids.hamburguesa, 2, "sin cebolla", "enviada", 8900).lastInsertRowid);
    const jugoAnulado = Number(insertarLinea.run(pedidoId, ids.jugo, 1, null, "anulada_tablet", 2500).lastInsertRowid);
    const agua = Number(insertarLinea.run(pedidoId, ids.agua, 3, null, "enviada", 1500).lastInsertRowid);
    insertarLinea.run(pedidoId, ids.jugo, 2, "para después", "nueva", 2500);

    const insertarComanda = db.prepare(
      "INSERT INTO comandas (pedido_id, envio_n, mesero_id, creada_en, tipo) VALUES (?, ?, ?, ?, 'legacy')",
    );
    const c1 = Number(insertarComanda.run(pedidoId, 1, mesero.id, ahora).lastInsertRowid);
    const c2 = Number(insertarComanda.run(pedidoId, 2, mesero.id, ahora).lastInsertRowid);
    const insertarComandaLinea = db.prepare(
      "INSERT INTO comanda_lineas (comanda_id, pedido_linea_id, etapa) VALUES (?, ?, ?)",
    );
    insertarComandaLinea.run(c1, hamburguesa, "servido");
    insertarComandaLinea.run(c1, jugoAnulado, "cancelado");
    insertarComandaLinea.run(c2, agua, "listo");

    const snapshot = JSON.stringify({ mesaNumero: 7, mesero: "Ana", cubiertos: 4, lineas: [], totalCentavos: 22300 });
    const precuentaId = Number(
      db
        .prepare(
          `INSERT INTO precuentas (pedido_id, cuenta_id, numero, vigente, mesero_id, snapshot_json, emitida_en)
           VALUES (?, NULL, 1, 1, ?, ?, ?)`,
        )
        .run(pedidoId, mesero.id, snapshot, ahora).lastInsertRowid,
    );
    db.prepare(
      `INSERT INTO caja_handoffs
        (pedido_id, cuenta_id, precuenta_id, mesero_id, snapshot_json, creado_en)
       VALUES (?, NULL, ?, ?, ?, ?)`,
    ).run(pedidoId, precuentaId, mesero.id, snapshot, ahora);

    const exportDir = mkdtempSync(path.join(tmpdir(), "rest-mig-"));
    const resultado = migrarPedidosACuentas(db, exportDir, defaultConfig());
    expect(resultado).toMatchObject({ cuentas: 1, ordenes: 2, lineas: 3, borradoresExportados: 1, errores: [] });

    const cuenta = db
      .prepare("SELECT id, legacy_pedido_id, estado FROM cuentas WHERE legacy_pedido_id = ?")
      .get(pedidoId) as { id: number; legacy_pedido_id: number; estado: string };
    expect(cuenta.estado).toBe("en_caja");
    expect(
      db.prepare("SELECT numero, estado FROM ordenes WHERE cuenta_id = ? ORDER BY numero").all(cuenta.id),
    ).toEqual([
      { numero: 1, estado: "corregida" },
      { numero: 2, estado: "enviada" },
    ]);
    expect(
      db.prepare("SELECT cantidad_nueva FROM orden_correccion_lineas").all(),
    ).toEqual([{ cantidad_nueva: 0 }]);
    expect(
      db.prepare("SELECT pedido_id, cuenta_id FROM precuentas WHERE id = ?").get(precuentaId),
    ).toEqual({ pedido_id: null, cuenta_id: cuenta.id });
    expect(
      db.prepare("SELECT pedido_id, cuenta_id FROM caja_handoffs").get(),
    ).toEqual({ pedido_id: null, cuenta_id: cuenta.id });
    expect((db.pragma("foreign_key_check") as unknown[]).length).toBe(0);

    const borrador = JSON.parse(
      readFileSync(path.join(exportDir, "migration", `pedido-${pedidoId}-borrador.json`), "utf8"),
    ) as { mesa: number; empleado: string; productos: { productoId: number; cantidad: number; nota: string }[] };
    expect(borrador).toMatchObject({
      mesa: 7,
      empleado: "Ana",
      productos: [{ productoId: ids.jugo, cantidad: 2, nota: "para después" }],
    });

    expect(migrarPedidosACuentas(db, exportDir, defaultConfig())).toEqual({
      cuentas: 0,
      ordenes: 0,
      lineas: 0,
      borradoresExportados: 0,
      errores: [],
    });
    db.close();
  });

  it("revierte toda la conversión si una línea enviada no tiene comanda", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    const mesero = await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const pedidoId = Number(
      db
        .prepare(
          "INSERT INTO pedidos (mesa_id, preset, cubiertos, estado, mesero_id, abierto_en) VALUES (?, 'salon', 1, 'enviado', ?, ?)",
        )
        .run(ids.mesa7, mesero.id, new Date().toISOString()).lastInsertRowid,
    );
    db.prepare(
      "INSERT INTO pedido_lineas (pedido_id, producto_id, cantidad, estado, precio_centavos) VALUES (?, ?, 1, 'enviada', 8900)",
    ).run(pedidoId, ids.hamburguesa);
    const resultado = migrarPedidosACuentas(db, mkdtempSync(path.join(tmpdir(), "rest-mig-")));
    expect(resultado.errores[0]).toContain("líneas enviadas sin comanda");
    expect((db.prepare("SELECT count(*) AS n FROM cuentas").get() as { n: number }).n).toBe(0);
    expect((db.prepare("SELECT count(*) AS n FROM ordenes").get() as { n: number }).n).toBe(0);
    db.close();
  });

  it("exporta un borrador de mesa sin crear una cuenta vacía", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    const mesero = await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const pedidoId = Number(
      db
        .prepare(
          "INSERT INTO pedidos (mesa_id, preset, cubiertos, estado, mesero_id, abierto_en) VALUES (?, 'salon', 1, 'borrador', ?, ?)",
        )
        .run(ids.mesa7, mesero.id, new Date().toISOString()).lastInsertRowid,
    );
    db.prepare(
      "INSERT INTO pedido_lineas (pedido_id, producto_id, cantidad, estado, precio_centavos) VALUES (?, ?, 1, 'nueva', 8900)",
    ).run(pedidoId, ids.hamburguesa);
    const resultado = migrarPedidosACuentas(db, mkdtempSync(path.join(tmpdir(), "rest-mig-")));
    expect(resultado).toMatchObject({ cuentas: 0, ordenes: 0, borradoresExportados: 1, errores: [] });
    expect((db.prepare("SELECT count(*) AS n FROM cuentas").get() as { n: number }).n).toBe(0);
    db.close();
  });
});
