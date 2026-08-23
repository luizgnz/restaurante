import { describe, expect, it } from "vitest";
import { CuentaError, cuentaActivaPorMesa, obtenerCuenta } from "../src/modules/cuentas/cuentas.ts";
import { totalEfectivoCuenta } from "../src/modules/cuentas/totales.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { openTestDb } from "./helpers.ts";

function insertCuenta(
  db: ReturnType<typeof openTestDb>,
  mesaId: number,
  estado: string,
  empleadoId: number,
  abiertaEn = "2026-08-22T12:00:00.000Z",
): number {
  const info = db
    .prepare(
      "INSERT INTO cuentas (mesa_id, estado, abierta_por_empleado_id, abierta_en) VALUES (?, ?, ?, ?)",
    )
    .run(mesaId, estado, empleadoId, abiertaEn);
  return Number(info.lastInsertRowid);
}

function insertOrden(
  db: ReturnType<typeof openTestDb>,
  cuentaId: number,
  numero: number,
  empleadoId: number,
  claveIdempotencia: string,
): number {
  const info = db
    .prepare(
      "INSERT INTO ordenes (cuenta_id, numero, estado, creada_por_empleado_id, creada_en, clave_idempotencia) VALUES (?, ?, 'enviada', ?, ?, ?)",
    )
    .run(cuentaId, numero, empleadoId, "2026-08-22T12:00:00.000Z", claveIdempotencia);
  return Number(info.lastInsertRowid);
}

describe("cuentas esquema", () => {
  it("rechaza dos cuentas activas en la misma mesa", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    insertCuenta(db, ids.mesa7, "abierta", 1);
    expect(() => insertCuenta(db, ids.mesa7, "abierta", 1)).toThrow(/UNIQUE constraint failed/i);
    db.close();
  });

  it("rechaza abierta y precuenta_emitida coexistiendo en la misma mesa", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    insertCuenta(db, ids.mesa7, "abierta", 1);
    expect(() => insertCuenta(db, ids.mesa7, "precuenta_emitida", 1)).toThrow(/UNIQUE constraint failed/i);
    db.close();
  });

  it("rechaza precuenta_emitida y abierta coexistiendo en la misma mesa", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    insertCuenta(db, ids.mesa7, "precuenta_emitida", 1);
    expect(() => insertCuenta(db, ids.mesa7, "abierta", 1)).toThrow(/UNIQUE constraint failed/i);
    db.close();
  });

  it("permite cuenta histórica cerrada y una activa en la misma mesa", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    insertCuenta(db, ids.mesa7, "en_caja", 1);
    const activaId = insertCuenta(db, ids.mesa7, "abierta", 1);
    expect(activaId).toBeGreaterThan(0);
    db.close();
  });

  it("rechaza número de orden duplicado en la misma cuenta", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const cuentaId = insertCuenta(db, ids.mesa7, "abierta", 1);
    insertOrden(db, cuentaId, 1, 1, "clave-a");
    expect(() => insertOrden(db, cuentaId, 1, 1, "clave-b")).toThrow(/UNIQUE constraint failed/i);
    db.close();
  });

  it("rechaza clave de idempotencia duplicada", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const cuentaId = insertCuenta(db, ids.mesa7, "abierta", 1);
    insertOrden(db, cuentaId, 1, 1, "misma-clave");
    expect(() => insertOrden(db, cuentaId, 2, 1, "misma-clave")).toThrow(/UNIQUE constraint failed/i);
    db.close();
  });

  it("rechaza linea_clave duplicada en la misma orden", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const cuentaId = insertCuenta(db, ids.mesa7, "abierta", 1);
    const ordenId = insertOrden(db, cuentaId, 1, 1, "clave-linea");
    insertLinea(db, ordenId, ids.hamburguesa, 1, 8900, null, "misma-clave");
    expect(() => insertLinea(db, ordenId, ids.jugo, 1, 2500, null, "misma-clave")).toThrow(
      /UNIQUE constraint failed/i,
    );
    db.close();
  });

  it("rechaza linea_clave duplicada dentro de la misma corrección", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const cuentaId = insertCuenta(db, ids.mesa7, "abierta", 1);
    const ordenId = insertOrden(db, cuentaId, 1, 1, "clave-corr");
    const lineaId = insertLinea(db, ordenId, ids.hamburguesa, 2, 8900, null, "orig-h");
    const correccionId = insertCorreccion(db, ordenId, 1, 1);
    insertCorreccionLinea(db, correccionId, lineaId, ids.hamburguesa, 2, 1, "orig-h");
    expect(() => insertCorreccionLinea(db, correccionId, lineaId, ids.hamburguesa, 2, 0, "orig-h")).toThrow(
      /UNIQUE constraint failed/i,
    );
    db.close();
  });

  it("permite la misma linea_clave en distintas versiones de corrección", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const cuentaId = insertCuenta(db, ids.mesa7, "abierta", 1);
    const ordenId = insertOrden(db, cuentaId, 1, 1, "clave-versiones");
    const lineaId = insertLinea(db, ordenId, ids.hamburguesa, 2, 8900, null, "orig-h");
    const v1 = insertCorreccion(db, ordenId, 1, 1);
    insertCorreccionLinea(db, v1, lineaId, ids.hamburguesa, 2, 1, "orig-h");
    const v2 = insertCorreccion(db, ordenId, 2, 1);
    const segunda = insertCorreccionLinea(db, v2, lineaId, ids.hamburguesa, 1, 3, "orig-h");
    expect(segunda).toBeGreaterThan(0);
    db.close();
  });
});

function insertLinea(
  db: ReturnType<typeof openTestDb>,
  ordenId: number,
  productoId: number,
  cantidad: number,
  precioCentavos: number,
  nota: string | null = null,
  lineaClave = "linea-1",
): number {
  const info = db
    .prepare(
      "INSERT INTO orden_lineas (orden_id, producto_id, cantidad, precio_centavos, nota, linea_clave) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(ordenId, productoId, cantidad, precioCentavos, nota, lineaClave);
  return Number(info.lastInsertRowid);
}

function insertCorreccion(
  db: ReturnType<typeof openTestDb>,
  ordenId: number,
  numeroVersion: number,
  empleadoId: number,
): number {
  return Number(
    db
      .prepare(
        `INSERT INTO orden_correcciones
          (orden_id, numero_version, es_anulacion, creada_por_empleado_id, creada_en, clave_idempotencia)
          VALUES (?, ?, 0, ?, ?, ?)`,
      )
      .run(
        ordenId,
        numeroVersion,
        empleadoId,
        "2026-08-22T12:05:00.000Z",
        `orden-${ordenId}-v${numeroVersion}`,
      ).lastInsertRowid,
  );
}

function insertCorreccionLinea(
  db: ReturnType<typeof openTestDb>,
  correccionId: number,
  lineaId: number | null,
  productoId: number,
  cantidadAnterior: number,
  cantidadNueva: number,
  lineaClave: string,
): number {
  return Number(
    db
      .prepare(
        `INSERT INTO orden_correccion_lineas
          (correccion_id, orden_linea_id, producto_id, cantidad_anterior, cantidad_nueva, linea_clave, precio_centavos)
          VALUES (?, ?, ?, ?, ?, ?, (SELECT precio_centavos FROM productos WHERE id = ?))`,
      )
      .run(correccionId, lineaId, productoId, cantidadAnterior, cantidadNueva, lineaClave, productoId).lastInsertRowid,
  );
}

function insertCorreccionCantidad(
  db: ReturnType<typeof openTestDb>,
  ordenId: number,
  numeroVersion: number,
  empleadoId: number,
  lineaId: number | null,
  productoId: number,
  cantidadAnterior: number,
  cantidadNueva: number,
  lineaClave: string,
  notaAnterior: string | null = null,
  notaNueva: string | null = null,
  esAnulacion = 0,
): void {
  const correccionId = Number(
    db
      .prepare(
        `INSERT INTO orden_correcciones
          (orden_id, numero_version, es_anulacion, creada_por_empleado_id, creada_en, clave_idempotencia)
          VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ordenId,
        numeroVersion,
        esAnulacion,
        empleadoId,
        "2026-08-22T12:05:00.000Z",
        `orden-${ordenId}-v${numeroVersion}`,
      ).lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO orden_correccion_lineas
      (correccion_id, orden_linea_id, producto_id, cantidad_anterior, cantidad_nueva, nota_anterior, nota_nueva, linea_clave, precio_centavos)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT precio_centavos FROM productos WHERE id = ?))`,
  ).run(
    correccionId,
    lineaId,
    productoId,
    cantidadAnterior,
    cantidadNueva,
    notaAnterior,
    notaNueva,
    lineaClave,
    productoId,
  );
}

describe("cuentas servicios", () => {
  it("devuelve la cuenta activa de la mesa y null si no hay", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    expect(cuentaActivaPorMesa(db, ids.mesa7)).toBeNull();
    const historicaId = insertCuenta(db, ids.mesa7, "en_caja", 1);
    expect(cuentaActivaPorMesa(db, ids.mesa7)).toBeNull();
    const activaId = insertCuenta(db, ids.mesa7, "abierta", 1);
    expect(cuentaActivaPorMesa(db, ids.mesa7)).toEqual({ id: activaId, estado: "abierta" });
    db.prepare("UPDATE cuentas SET estado = 'precuenta_emitida' WHERE id = ?").run(activaId);
    expect(cuentaActivaPorMesa(db, ids.mesa7)).toEqual({ id: activaId, estado: "precuenta_emitida" });
    expect(historicaId).toBeGreaterThan(0);
    db.close();
  });

  it("calcula líneas y total con la cantidad efectiva de Orden #1 (2 → 1)", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const cuentaId = insertCuenta(db, ids.mesa7, "abierta", 1);
    const ordenId = insertOrden(db, cuentaId, 1, 1, "orden-1");
    const lineaId = insertLinea(db, ordenId, ids.hamburguesa, 2, 8900, null, "orig-h");
    insertCorreccionCantidad(db, ordenId, 1, 1, lineaId, ids.hamburguesa, 2, 1, "orig-h");
    db.prepare("UPDATE ordenes SET estado = 'corregida' WHERE id = ?").run(ordenId);

    const cuenta = obtenerCuenta(db, cuentaId);
    expect(cuenta.id).toBe(cuentaId);
    expect(cuenta.mesa).toEqual({ id: ids.mesa7, numero: 7 });
    expect(cuenta.estado).toBe("abierta");
    expect(cuenta.notaPrivada).toBeNull();
    expect(cuenta.ordenes).toHaveLength(1);
    expect(cuenta.ordenes[0]).toMatchObject({
      id: ordenId,
      numero: 1,
      estado: "corregida",
      indicaciones: null,
      creadaEn: "2026-08-22T12:00:00.000Z",
      empleado: "Ana",
    });
    expect(cuenta.ordenes[0].lineas).toHaveLength(1);
    expect(cuenta.ordenes[0].lineas[0]).toMatchObject({
      lineaClave: "orig-h",
      ordenLineaId: lineaId,
      productoId: ids.hamburguesa,
      cantidad: 1,
      precioCentavos: 8900,
    });
    expect(totalEfectivoCuenta(db, cuentaId)).toBe(8900);
    db.close();
  });

  it("mantiene líneas en cero en el historial y las excluye del total", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const cuentaId = insertCuenta(db, ids.mesa7, "abierta", 1);
    const ordenId = insertOrden(db, cuentaId, 1, 1, "orden-cero");
    const lineaId = insertLinea(db, ordenId, ids.hamburguesa, 2, 8900, null, "orig-h");
    insertCorreccionCantidad(db, ordenId, 1, 1, lineaId, ids.hamburguesa, 2, 0, "orig-h");

    const cuenta = obtenerCuenta(db, cuentaId);
    expect(cuenta.ordenes[0].lineas[0].cantidad).toBe(0);
    expect(totalEfectivoCuenta(db, cuentaId)).toBe(0);
    db.close();
  });

  it("lanza CuentaError tipado si la cuenta no existe", async () => {
    const db = openTestDb();
    seedCartaDemo(db);
    expect(() => obtenerCuenta(db, 999)).toThrow(CuentaError);
    try {
      obtenerCuenta(db, 999);
    } catch (error) {
      expect(error).toBeInstanceOf(CuentaError);
      expect((error as CuentaError).codigo).toBe("cuenta_inexistente");
    }
    db.close();
  });

  it("muestra orden anulada con líneas en cero y total 0", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const cuentaId = insertCuenta(db, ids.mesa7, "abierta", 1);
    const ordenId = insertOrden(db, cuentaId, 1, 1, "orden-anulada");
    const lineaId = insertLinea(db, ordenId, ids.hamburguesa, 2, 8900, null, "orig-h");
    insertCorreccionCantidad(db, ordenId, 1, 1, lineaId, ids.hamburguesa, 2, 0, "orig-h", null, null, 1);
    db.prepare("UPDATE ordenes SET estado = 'anulada' WHERE id = ?").run(ordenId);

    const cuenta = obtenerCuenta(db, cuentaId);
    expect(cuenta.ordenes[0].estado).toBe("anulada");
    expect(cuenta.ordenes[0].lineas[0]).toMatchObject({ lineaClave: "orig-h", cantidad: 0 });
    expect(totalEfectivoCuenta(db, cuentaId)).toBe(0);
    db.close();
  });
});
