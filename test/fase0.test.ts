import { describe, expect, it } from "vitest";
import { defaultConfig, type AppConfig } from "../src/config.ts";
import { cuentaActivaPorMesa } from "../src/modules/cuentas/cuentas.ts";
import { totalVigenteCuenta } from "../src/modules/cuentas/totales.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { avanzarEtapa } from "../src/modules/kds/kds.ts";
import { corregirOrden, type EntradaCorreccion } from "../src/modules/ordenes/correcciones.ts";
import { enviarOrden } from "../src/modules/ordenes/enviar.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { versionVigenteOrden } from "../src/modules/ordenes/ordenes.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { codigoDe, entornoApi, openTestDb, post, verCuenta } from "./helpers.ts";

type Db = ReturnType<typeof openTestDb>;

function codigoDeError(error: unknown): string {
  return error instanceof Error && "codigo" in error ? String((error as { codigo: unknown }).codigo) : "";
}

function stockDe(db: Db, productoId: number): { on_hand: number; reserved: number } {
  return db
    .prepare(
      "SELECT COALESCE(on_hand_real, 0) AS on_hand, COALESCE(reserved_real, 0) AS reserved FROM stock WHERE producto_id = ?",
    )
    .get(productoId) as { on_hand: number; reserved: number };
}

async function ordenConHamburguesaEnPreparacion(cfg: AppConfig = defaultConfig()) {
  const db = openTestDb();
  const ids = seedEn(db);
  await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
  const envio = await enviarOrden(
    db,
    {
      mesaId: ids.mesa7,
      empleadoId: 1,
      claveIdempotencia: "envio-base",
      lineas: [{ productoId: ids.hamburguesa, cantidad: 2 }],
    },
    new MemoryPrinter(),
    cfg,
  );
  const comanda = db.prepare("SELECT id FROM comandas WHERE orden_id = ? AND tipo = 'orden'").get(envio.ordenId) as {
    id: number;
  };
  const lineaComanda = db
    .prepare("SELECT id FROM comanda_lineas WHERE comanda_id = ? ORDER BY id LIMIT 1")
    .get(comanda.id) as { id: number };
  avanzarEtapa(db, lineaComanda.id, "en_proceso");
  return { db, ids, envio, linea: versionVigenteOrden(db, envio.ordenId)[0] };
}

function seedEn(db: Db) {
  return seedCartaDemo(db);
}

function ingredientesDe(db: Db, productoId: number): Array<{ ingrediente_id: number; cantidad_real: number }> {
  return db
    .prepare("SELECT ingrediente_id, cantidad_real FROM receta_lineas WHERE producto_id = ?")
    .all(productoId) as Array<{ ingrediente_id: number; cantidad_real: number }>;
}

async function anular(
  db: Db,
  entrada: Omit<EntradaCorreccion, "claveIdempotencia" | "pin"> & { pin?: string },
  cfg: AppConfig = defaultConfig(),
) {
  return corregirOrden(
    db,
    { ...entrada, claveIdempotencia: `anulacion-${Math.random()}`, pin: entrada.pin ?? "1234" },
    new MemoryPrinter(),
    cfg,
  );
}

describe("fase 0 · anular un plato ya preparado", () => {
  it("por defecto devuelve los ingredientes al inventario (reutilización), sin merma", async () => {
    const db = openTestDb();
    const ids = seedEn(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const ingredientes = ingredientesDe(db, ids.hamburguesa);
    expect(ingredientes.length).toBeGreaterThan(0);
    const antes = ingredientes.map((i) => ({ ...i, ...stockDe(db, i.ingrediente_id) }));
    const envio = await enviarOrden(
      db,
      {
        mesaId: ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: "envio-base",
        lineas: [{ productoId: ids.hamburguesa, cantidad: 2 }],
      },
      new MemoryPrinter(),
      defaultConfig(),
    );
    const comanda = db.prepare("SELECT id FROM comandas WHERE orden_id = ? AND tipo = 'orden'").get(envio.ordenId) as {
      id: number;
    };
    const lineaComanda = db
      .prepare("SELECT id FROM comanda_lineas WHERE comanda_id = ? ORDER BY id LIMIT 1")
      .get(comanda.id) as { id: number };
    avanzarEtapa(db, lineaComanda.id, "en_proceso");
    const linea = versionVigenteOrden(db, envio.ordenId)[0];

    await anular(db, {
      ordenId: envio.ordenId,
      lineas: [{ lineaClave: linea.lineaClave, productoId: linea.productoId, cantidad: 0, nota: null }],
      motivo: "el cliente se retiró",
    });

    for (const i of ingredientes) {
      const ahora = stockDe(db, i.ingrediente_id);
      const deAntes = antes.find((a) => a.ingrediente_id === i.ingrediente_id)!;
      expect(ahora.reserved).toBeCloseTo(deAntes.reserved, 5);
      expect(ahora.on_hand).toBeCloseTo(deAntes.on_hand, 5);
    }
    const mermas = db
      .prepare("SELECT count(*) AS c FROM inventario_movimientos WHERE motivo = 'anulacion_preparacion'")
      .get() as { c: number };
    expect(mermas.c).toBe(0);
    db.close();
  });

  it("con la política de merma los insumos quedan consumidos y salen al kardex", async () => {
    const cfg: AppConfig = { ...defaultConfig(), devolver_insumos_preparados: false };
    const db = openTestDb();
    const ids = seedEn(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const ingredientes = ingredientesDe(db, ids.hamburguesa);
    const antes = ingredientes.map((i) => ({ ...i, ...stockDe(db, i.ingrediente_id) }));
    const envio = await enviarOrden(
      db,
      {
        mesaId: ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: "envio-base",
        lineas: [{ productoId: ids.hamburguesa, cantidad: 2 }],
      },
      new MemoryPrinter(),
      cfg,
    );
    const comanda = db.prepare("SELECT id FROM comandas WHERE orden_id = ? AND tipo = 'orden'").get(envio.ordenId) as {
      id: number;
    };
    const lineaComanda = db
      .prepare("SELECT id FROM comanda_lineas WHERE comanda_id = ? ORDER BY id LIMIT 1")
      .get(comanda.id) as { id: number };
    avanzarEtapa(db, lineaComanda.id, "en_proceso");
    const linea = versionVigenteOrden(db, envio.ordenId)[0];

    await anular(
      db,
      {
        ordenId: envio.ordenId,
        lineas: [{ lineaClave: linea.lineaClave, productoId: linea.productoId, cantidad: 0, nota: null }],
        motivo: "el cliente se retiró",
      },
      cfg,
    );

    for (const i of ingredientes) {
      const ahora = stockDe(db, i.ingrediente_id);
      const deAntes = antes.find((a) => a.ingrediente_id === i.ingrediente_id)!;
      const consumido = i.cantidad_real * 2;
      expect(ahora.reserved).toBeCloseTo(deAntes.reserved, 5);
      expect(ahora.on_hand).toBeCloseTo(deAntes.on_hand - consumido, 5);
    }
    const mermas = db
      .prepare("SELECT count(*) AS c FROM inventario_movimientos WHERE motivo = 'anulacion_preparacion' AND tipo = 'perdida'")
      .get() as { c: number };
    expect(mermas.c).toBe(ingredientes.length);
    db.close();
  });

  it("no permite bajar parcialmente una línea en preparación", async () => {
    const { db, envio, linea } = await ordenConHamburguesaEnPreparacion();
    await expect(
      anular(db, {
        ordenId: envio.ordenId,
        lineas: [{ lineaClave: linea.lineaClave, productoId: linea.productoId, cantidad: 1, nota: null }],
      }),
    ).rejects.toMatchObject({ codigo: "linea_preparada" });
    db.close();
  });

  it("exige motivo para anular una línea ya preparada", async () => {
    const { db, envio, linea } = await ordenConHamburguesaEnPreparacion();
    const error = await anular(db, {
      ordenId: envio.ordenId,
      lineas: [{ lineaClave: linea.lineaClave, productoId: linea.productoId, cantidad: 0, nota: null }],
    }).catch((e: unknown) => e);
    expect(codigoDeError(error)).toBe("justificacion_requerida");
    db.close();
  });

  it("deja tocar una línea que cocina todavía no empezó", async () => {
    const db = openTestDb();
    const ids = seedEn(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const envio = await enviarOrden(
      db,
      {
        mesaId: ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: "envio-base",
        lineas: [{ productoId: ids.hamburguesa, cantidad: 2 }],
      },
      new MemoryPrinter(),
      defaultConfig(),
    );
    const linea = versionVigenteOrden(db, envio.ordenId)[0];
    await anular(db, {
      ordenId: envio.ordenId,
      lineas: [{ lineaClave: linea.lineaClave, productoId: linea.productoId, cantidad: 0, nota: null }],
      motivo: "error de toma",
    });
    expect(versionVigenteOrden(db, envio.ordenId).every((l) => l.cantidad === 0)).toBe(true);
    db.close();
  });
});

describe("fase 0 · cancelar cuenta", () => {
  it("libera la mesa, cancela la cuenta y devuelve el stock sin empezar", async () => {
    const e = await entornoApi();
    const ingredientes = ingredientesDe(e.db, e.ids.hamburguesa);
    const base = ingredientes.map((i) => ({ ...i, ...stockDe(e.db, i.ingrediente_id) }));
    const orden = await post(e.app, "/api/ordenes", {
      mesaId: e.ids.mesa7,
      claveIdempotencia: "cancel-1",
      pin: "1234",
      lineas: [{ productoId: e.ids.hamburguesa, cantidad: 2 }],
    });
    expect(orden.status).toBe(201);
    const { cuentaId, ordenId } = (await orden.json()) as { cuentaId: number; ordenId: number };

    const res = await post(e.app, `/api/cuentas/${cuentaId}/cancelar`, {
      pin: "2222",
      motivo: "los clientes se retiraron sin pedir",
    });
    expect(res.status).toBe(200);

    const cuenta = await verCuenta(e.app, cuentaId);
    expect(cuenta.estado).toBe("cancelada");
    expect(cuentaActivaPorMesa(e.db, e.ids.mesa7)).toBeNull();

    for (const i of ingredientes) {
      const ahora = stockDe(e.db, i.ingrediente_id);
      const deBase = base.find((b) => b.ingrediente_id === i.ingrediente_id)!;
      expect(ahora.reserved).toBeCloseTo(deBase.reserved, 5);
      expect(ahora.on_hand).toBeCloseTo(deBase.on_hand, 5);
    }
    const anotacion = e.db
      .prepare("SELECT motivo, lineas_preparadas, lineas_liberadas FROM cancelaciones_cuentas ORDER BY id DESC LIMIT 1")
      .get() as { motivo: string; lineas_preparadas: number; lineas_liberadas: number };
    expect(anotacion.motivo).toBe("los clientes se retiraron sin pedir");
    expect(anotacion.lineas_liberadas).toBe(2);
    void ordenId;
    e.db.close();
  });

  it("registra el total vigente de la cuenta después de una corrección", async () => {
    const e = await entornoApi();
    const orden = await post(e.app, "/api/ordenes", {
      mesaId: e.ids.mesa7,
      claveIdempotencia: "cancel-total-vigente",
      pin: "1234",
      lineas: [{ productoId: e.ids.hamburguesa, cantidad: 2 }],
    });
    const { cuentaId, ordenId } = (await orden.json()) as { cuentaId: number; ordenId: number };
    const linea = versionVigenteOrden(e.db, ordenId)[0];

    const correccion = await post(e.app, `/api/ordenes/${ordenId}/correcciones`, {
      claveIdempotencia: "cancel-total-vigente-correccion",
      pin: "1234",
      lineas: [{
        lineaClave: linea.lineaClave,
        productoId: linea.productoId,
        cantidad: 1,
        nota: linea.nota,
      }],
    });
    expect(correccion.status).toBe(201);

    const cancelacion = await post(e.app, `/api/cuentas/${cuentaId}/cancelar`, {
      pin: "2222",
      motivo: "error al ingresar la cantidad",
    });
    expect(cancelacion.status).toBe(200);
    expect(await cancelacion.json()).toMatchObject({ totalCentavos: 8900 });

    const auditoria = e.db
      .prepare("SELECT total_centavos FROM cancelaciones_cuentas WHERE cuenta_id = ?")
      .get(cuentaId) as { total_centavos: number };
    expect(auditoria.total_centavos).toBe(8900);
    e.db.close();
  });

  it("exige motivo y un PIN con derecho de encargado", async () => {
    const e = await entornoApi();
    const orden = await post(e.app, "/api/ordenes", {
      mesaId: e.ids.mesa7,
      claveIdempotencia: "cancel-2",
      pin: "1234",
      lineas: [{ productoId: e.ids.hamburguesa, cantidad: 1 }],
    });
    const { cuentaId } = (await orden.json()) as { cuentaId: number };

    const sinMotivo = await post(e.app, `/api/cuentas/${cuentaId}/cancelar`, { pin: "2222" });
    expect(sinMotivo.status).toBe(400);
    expect(await codigoDe(sinMotivo)).toBe("justificacion_requerida");

    const mesero = await post(e.app, `/api/cuentas/${cuentaId}/cancelar`, {
      pin: "1234",
      motivo: "prueba",
    });
    expect(mesero.status).toBe(403);
    expect(await codigoDe(mesero)).toBe("sin_derecho");

    const encargado = await post(e.app, `/api/cuentas/${cuentaId}/cancelar`, {
      pin: "2222",
      motivo: "clientes se fueron",
    });
    expect(encargado.status).toBe(200);
    e.db.close();
  });
});

describe("fase 0 · stock al vender", () => {
  it("bloquea el envío cuando no hay stock y la política es bloquear", async () => {
    const e = await entornoApi({ ...defaultConfig(), bloqueo_sin_stock: "bloquear" });
    const res = await post(e.app, "/api/ordenes", {
      mesaId: e.ids.mesa7,
      claveIdempotencia: "stock-1",
      pin: "1234",
      lineas: [{ productoId: e.ids.hamburguesa, cantidad: 9999 }],
    });
    expect(res.status).toBe(409);
    expect(await codigoDe(res)).toBe("stock_insuficiente");
    e.db.close();
  });

  it("con la política de avisar la orden entra y la respuesta trae avisos", async () => {
    const e = await entornoApi({ ...defaultConfig(), bloqueo_sin_stock: "avisar" });
    const res = await post(e.app, "/api/ordenes", {
      mesaId: e.ids.mesa7,
      claveIdempotencia: "stock-2",
      pin: "1234",
      lineas: [{ productoId: e.ids.hamburguesa, cantidad: 9999 }],
    });
    expect(res.status).toBe(201);
    const cuerpo = (await res.json()) as { avisos: string[] };
    expect(cuerpo.avisos.length).toBeGreaterThan(0);
    expect(cuerpo.avisos[0]).toContain("Stock bajo");
    e.db.close();
  });
});

describe("fase 0 · redondeo de dinero", () => {
  it("redondea por línea: cantidades fraccionales no generan centavos partidos", async () => {
    const db = openTestDb();
    const ids = seedEn(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    db.prepare(
      `INSERT INTO cuentas (mesa_id, estado, abierta_por_empleado_id, abierta_en) VALUES (?, 'abierta', 1, ?)`,
    ).run(ids.mesa7, new Date().toISOString());
    const cuenta = db.prepare("SELECT id FROM cuentas WHERE mesa_id = ? ORDER BY id DESC LIMIT 1").get(ids.mesa7) as {
      id: number;
    };
    const ordenId = Number(
      db
        .prepare(
          `INSERT INTO ordenes (cuenta_id, numero, estado, creada_por_empleado_id, creada_en, clave_idempotencia)
           VALUES (?, 1, 'enviada', 1, ?, 'redondeo-1')`,
        )
        .run(cuenta.id, new Date().toISOString()).lastInsertRowid,
    );
    db.prepare(
      `INSERT INTO orden_lineas (orden_id, producto_id, cantidad, precio_centavos, nota, linea_clave)
       VALUES (?, ?, 0.33, 999, NULL, 'frac-1')`,
    ).run(ordenId, ids.hamburguesa);
    const total = totalVigenteCuenta(db, cuenta.id);
    expect(total).toBe(Math.round(0.33 * 999));
    expect(Number.isInteger(total)).toBe(true);
    db.close();
  });
});
