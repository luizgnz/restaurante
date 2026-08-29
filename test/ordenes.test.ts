import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { enviarOrden } from "../src/modules/ordenes/enviar.ts";
import type { NuevaOrden } from "../src/modules/ordenes/ordenes.ts";
import { versionEfectivaOrden } from "../src/modules/ordenes/ordenes.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { openTestDb } from "./helpers.ts";

function insertCuenta(db: ReturnType<typeof openTestDb>, mesaId: number, empleadoId: number): number {
  return Number(
    db
      .prepare(
        "INSERT INTO cuentas (mesa_id, estado, abierta_por_empleado_id, abierta_en) VALUES (?, 'abierta', ?, ?)",
      )
      .run(mesaId, empleadoId, "2026-08-22T12:00:00.000Z").lastInsertRowid,
  );
}

function insertOrden(db: ReturnType<typeof openTestDb>, cuentaId: number, empleadoId: number, clave: string): number {
  return Number(
    db
      .prepare(
        "INSERT INTO ordenes (cuenta_id, numero, estado, creada_por_empleado_id, creada_en, clave_idempotencia) VALUES (?, 1, 'enviada', ?, ?, ?)",
      )
      .run(cuentaId, empleadoId, "2026-08-22T12:00:00.000Z", clave).lastInsertRowid,
  );
}

function insertLinea(
  db: ReturnType<typeof openTestDb>,
  ordenId: number,
  productoId: number,
  cantidad: number,
  precioCentavos: number,
  lineaClave: string,
  nota: string | null = null,
): number {
  return Number(
    db
      .prepare(
        "INSERT INTO orden_lineas (orden_id, producto_id, cantidad, precio_centavos, nota, linea_clave) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(ordenId, productoId, cantidad, precioCentavos, nota, lineaClave).lastInsertRowid,
  );
}

function insertCorreccionLinea(
  db: ReturnType<typeof openTestDb>,
  ordenId: number,
  numeroVersion: number,
  lineaClave: string,
  productoId: number,
  cantidadAnterior: number,
  cantidadNueva: number,
  ordenLineaId: number | null = null,
  notaAnterior: string | null = null,
  notaNueva: string | null = null,
  precioCentavos: number | null = null,
): void {
  const correccionId = Number(
    db
      .prepare(
        `INSERT INTO orden_correcciones
          (orden_id, numero_version, es_anulacion, creada_por_empleado_id, creada_en, clave_idempotencia)
          VALUES (?, ?, 0, 1, ?, ?)`,
      )
      .run(ordenId, numeroVersion, "2026-08-22T12:05:00.000Z", `orden-${ordenId}-v${numeroVersion}`).lastInsertRowid,
  );
  const precio =
    precioCentavos ??
    (db.prepare("SELECT precio_centavos FROM productos WHERE id = ?").get(productoId) as { precio_centavos: number })
      .precio_centavos;
  db.prepare(
    `INSERT INTO orden_correccion_lineas
      (correccion_id, orden_linea_id, producto_id, cantidad_anterior, cantidad_nueva, nota_anterior, nota_nueva, linea_clave, precio_centavos)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    correccionId,
    ordenLineaId,
    productoId,
    cantidadAnterior,
    cantidadNueva,
    notaAnterior,
    notaNueva,
    lineaClave,
    precio,
  );
}

describe("versión efectiva de órdenes", () => {
  it("aplica correcciones por linea_clave sobre las líneas originales (2 → 1)", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const cuentaId = insertCuenta(db, ids.mesa7, 1);
    const ordenId = insertOrden(db, cuentaId, 1, "orden-efectiva");
    const lineaId = insertLinea(db, ordenId, ids.hamburguesa, 2, 8900, "orig-h", "sin cebolla");
    insertCorreccionLinea(db, ordenId, 1, "orig-h", ids.hamburguesa, 2, 1, lineaId, "sin cebolla", "extra queso");

    const lineas = versionEfectivaOrden(db, ordenId);
    expect(lineas).toEqual([
      {
        lineaClave: "orig-h",
        ordenLineaId: lineaId,
        productoId: ids.hamburguesa,
        nombre: "Hamburguesa",
        cantidad: 1,
        precioCentavos: 8900,
        nota: "extra queso",
        contornos: [],
      },
    ]);
    const original = db.prepare("SELECT cantidad, nota FROM orden_lineas WHERE id = ?").get(lineaId) as {
      cantidad: number;
      nota: string | null;
    };
    expect(original).toEqual({ cantidad: 2, nota: "sin cebolla" });
    db.close();
  });

  it("aplica correcciones posteriores sobre la última versión efectiva", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const cuentaId = insertCuenta(db, ids.mesa7, 1);
    const ordenId = insertOrden(db, cuentaId, 1, "orden-v2");
    const lineaId = insertLinea(db, ordenId, ids.hamburguesa, 2, 8900, "orig-h");
    insertCorreccionLinea(db, ordenId, 1, "orig-h", ids.hamburguesa, 2, 1, lineaId);
    insertCorreccionLinea(db, ordenId, 2, "orig-h", ids.hamburguesa, 1, 3, lineaId);

    const lineas = versionEfectivaOrden(db, ordenId);
    expect(lineas[0].cantidad).toBe(3);
    expect(lineas[0].lineaClave).toBe("orig-h");
    db.close();
  });

  it("mantiene identidades distintas para dos líneas del mismo producto en NuevaOrden", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const enviada: NuevaOrden = {
      mesaId: ids.mesa7,
      lineas: [
        { productoId: ids.hamburguesa, cantidad: 2, nota: "sin cebolla" },
        { productoId: ids.hamburguesa, cantidad: 1, nota: "extra queso" },
      ],
      claveIdempotencia: "dos-hamburguesas",
      empleadoId: 1,
    };
    const cuentaId = insertCuenta(db, enviada.mesaId, enviada.empleadoId);
    const ordenId = insertOrden(db, cuentaId, enviada.empleadoId, enviada.claveIdempotencia);
    const primeraId = insertLinea(db, ordenId, enviada.lineas[0].productoId, enviada.lineas[0].cantidad, 8900, "h-a", enviada.lineas[0].nota ?? null);
    const segundaId = insertLinea(db, ordenId, enviada.lineas[1].productoId, enviada.lineas[1].cantidad, 8900, "h-b", enviada.lineas[1].nota ?? null);
    insertCorreccionLinea(db, ordenId, 1, "h-b", ids.hamburguesa, 1, 3, segundaId, "extra queso", "sin tomate");

    const lineas = versionEfectivaOrden(db, ordenId);
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toMatchObject({
      lineaClave: "h-a",
      ordenLineaId: primeraId,
      productoId: ids.hamburguesa,
      cantidad: 2,
      nota: "sin cebolla",
    });
    expect(lineas[1]).toMatchObject({
      lineaClave: "h-b",
      ordenLineaId: segundaId,
      productoId: ids.hamburguesa,
      cantidad: 3,
      nota: "sin tomate",
    });
    db.close();
  });

  it("añade un producto nuevo por corrección sin mutar las líneas originales", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const cuentaId = insertCuenta(db, ids.mesa7, 1);
    const ordenId = insertOrden(db, cuentaId, 1, "orden-alta");
    const hamburguesaId = insertLinea(db, ordenId, ids.hamburguesa, 2, 8900, "orig-h");
    insertCorreccionLinea(db, ordenId, 1, "add-j", ids.jugo, 0, 2, null);

    const lineas = versionEfectivaOrden(db, ordenId);
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toMatchObject({
      lineaClave: "orig-h",
      ordenLineaId: hamburguesaId,
      productoId: ids.hamburguesa,
      cantidad: 2,
    });
    expect(lineas[1]).toMatchObject({
      lineaClave: "add-j",
      ordenLineaId: null,
      productoId: ids.jugo,
      nombre: "Jugo",
      cantidad: 2,
      precioCentavos: 2500,
    });
    const original = db.prepare("SELECT count(*) AS c FROM orden_lineas WHERE orden_id = ?").get(ordenId) as {
      c: number;
    };
    expect(original.c).toBe(1);
    db.close();
  });

  it("corrige después una línea añadida por corrección usando la misma linea_clave", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const cuentaId = insertCuenta(db, ids.mesa7, 1);
    const ordenId = insertOrden(db, cuentaId, 1, "orden-alta-v2");
    insertLinea(db, ordenId, ids.hamburguesa, 2, 8900, "orig-h");
    insertCorreccionLinea(db, ordenId, 1, "add-j", ids.jugo, 0, 2, null);
    insertCorreccionLinea(db, ordenId, 2, "add-j", ids.jugo, 2, 1, null, null, "sin hielo");

    const lineas = versionEfectivaOrden(db, ordenId);
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toMatchObject({ lineaClave: "orig-h", cantidad: 2, ordenLineaId: expect.any(Number) });
    expect(lineas[1]).toMatchObject({
      lineaClave: "add-j",
      ordenLineaId: null,
      productoId: ids.jugo,
      cantidad: 1,
      nota: "sin hielo",
    });
    db.close();
  });

  it("persiste linea_clave generada al enviar y la usa en la versión efectiva", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const enviada: NuevaOrden = {
      mesaId: ids.mesa7,
      empleadoId: 1,
      claveIdempotencia: "efectiva-envio",
      lineas: [
        { productoId: ids.hamburguesa, cantidad: 2, nota: "sin cebolla" },
        { productoId: ids.hamburguesa, cantidad: 1 },
      ],
    };
    const result = await enviarOrden(db, enviada, new MemoryPrinter(), defaultConfig());
    const persistidas = db
      .prepare("SELECT id, linea_clave FROM orden_lineas WHERE orden_id = ? ORDER BY id")
      .all(result.ordenId) as { id: number; linea_clave: string }[];
    expect(persistidas).toHaveLength(2);
    expect(persistidas[0].linea_clave).not.toBe(persistidas[1].linea_clave);

    const efectivas = versionEfectivaOrden(db, result.ordenId);
    expect(efectivas.map((l) => l.lineaClave)).toEqual(persistidas.map((l) => l.linea_clave));
    expect(efectivas.map((l) => l.ordenLineaId)).toEqual(persistidas.map((l) => l.id));
    db.close();
  });
});
