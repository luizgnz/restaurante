import { describe, expect, it } from "vitest";
import { defaultConfig, type PoliticaInventario } from "../src/config.ts";
import { cuentaActivaPorMesa, obtenerCuenta } from "../src/modules/cuentas/cuentas.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { enviarOrden } from "../src/modules/ordenes/enviar.ts";
import { agregarLinea, enviarACocina } from "../src/modules/pedidos/pedidos.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { abrirMesa } from "../src/modules/salon/salon.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { openTestDb } from "./helpers.ts";

describe("enviar a cocina", () => {
  it("mesa 7: 5 hamburguesas 2 jugos 3 aguas, PIN envía KDS y job; PIN malo no", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const { pedidoId } = abrirMesa(db, { mesaId: ids.mesa7, cubiertos: 4, preset: "salon", meseroId: 1 });
    agregarLinea(db, pedidoId, { productoId: ids.hamburguesa, cantidad: 5 });
    agregarLinea(db, pedidoId, { productoId: ids.jugo, cantidad: 2 });
    agregarLinea(db, pedidoId, { productoId: ids.agua, cantidad: 3 });

    const printer = new MemoryPrinter();
    await expect(enviarACocina(db, pedidoId, "0000", printer, defaultConfig())).rejects.toMatchObject({
      codigo: "pin_invalido",
    });
    expect(db.prepare("SELECT count(*) AS c FROM comandas").get() as { c: number }).toEqual({ c: 0 });
    expect(db.prepare("SELECT reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as { reserved_real: number }).toEqual(
      { reserved_real: 0 },
    );

    const result = await enviarACocina(db, pedidoId, "1234", printer, defaultConfig());
    expect(result.comandaId).toBeGreaterThan(0);
    expect(result.jobId).toBeGreaterThan(0);
    expect(db.prepare("SELECT count(*) AS c FROM comandas").get() as { c: number }).toEqual({ c: 1 });
    expect(db.prepare("SELECT etapa FROM comanda_lineas").all() as { etapa: string }[]).toEqual(
      expect.arrayContaining([{ etapa: "por_preparar" }]),
    );
    expect((db.prepare("SELECT reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as { reserved_real: number }).reserved_real).toBe(5);
    const ticket = Buffer.concat(printer.chunks.map((c) => Buffer.from(c))).toString("utf8");
    expect(ticket).toContain("Mesa 7");
    expect(ticket).toContain("Ana");
    expect(ticket).toContain("Hamburguesa");
    db.close();
  });

  it("impresora caída: comanda existe y job en cola", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const { pedidoId } = abrirMesa(db, { mesaId: ids.mesa7, cubiertos: 4, preset: "salon", meseroId: 1 });
    agregarLinea(db, pedidoId, { productoId: ids.hamburguesa, cantidad: 1 });
    const printer = new MemoryPrinter();
    printer.fail = true;
    await enviarACocina(db, pedidoId, "1234", printer, defaultConfig());
    const job = db.prepare("SELECT status, attempts, kind FROM print_jobs").get() as {
      status: string;
      attempts: number;
      kind: string;
    };
    expect(job.kind).toBe("comanda");
    expect(["queued", "failed"]).toContain(job.status);
    expect(job.attempts).toBeGreaterThanOrEqual(1);
    expect(db.prepare("SELECT count(*) AS c FROM comandas").get() as { c: number }).toEqual({ c: 1 });
    db.close();
  });
});

describe("enviarOrden transaccional", () => {
  it("el primer envío a mesa libre crea una cuenta y Orden #1", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const printer = new MemoryPrinter();

    const result = await enviarOrden(
      db,
      {
        mesaId: ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: "envio-1",
        lineas: [{ productoId: ids.hamburguesa, cantidad: 2, nota: "sin cebolla" }],
      },
      printer,
      defaultConfig(),
    );

    expect(result.repetida).toBe(false);
    expect(result.cuentaId).toBeGreaterThan(0);
    expect(result.ordenId).toBeGreaterThan(0);
    expect(result.comandaId).toBeGreaterThan(0);
    expect(cuentaActivaPorMesa(db, ids.mesa7)).toEqual({ id: result.cuentaId, estado: "abierta" });
    const cuenta = obtenerCuenta(db, result.cuentaId);
    expect(cuenta.ordenes).toHaveLength(1);
    expect(cuenta.ordenes[0]).toMatchObject({
      id: result.ordenId,
      numero: 1,
      estado: "enviada",
    });
    expect(cuenta.ordenes[0].lineas[0]).toMatchObject({
      productoId: ids.hamburguesa,
      cantidad: 2,
      nota: "sin cebolla",
      precioCentavos: 8900,
    });
    expect(cuenta.ordenes[0].lineas[0].lineaClave).toEqual(expect.any(String));
    expect(cuenta.ordenes[0].lineas[0].lineaClave).not.toBe(String(ids.hamburguesa));
    const comanda = db.prepare("SELECT orden_id, tipo, pedido_id FROM comandas WHERE id = ?").get(result.comandaId) as {
      orden_id: number;
      tipo: string;
      pedido_id: number;
    };
    expect(comanda).toMatchObject({ orden_id: result.ordenId, tipo: "orden" });
    expect(comanda.pedido_id).toBeNull();
    db.close();
  });

  it("el segundo envío crea Orden #2 y su comanda solo lleva esas líneas", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const printer = new MemoryPrinter();
    const cfg = defaultConfig();

    const primero = await enviarOrden(
      db,
      {
        mesaId: ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: "envio-a",
        lineas: [{ productoId: ids.hamburguesa, cantidad: 1 }],
      },
      printer,
      cfg,
    );
    const segundo = await enviarOrden(
      db,
      {
        mesaId: ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: "envio-b",
        lineas: [
          { productoId: ids.jugo, cantidad: 2 },
          { productoId: ids.agua, cantidad: 3 },
        ],
      },
      printer,
      cfg,
    );

    expect(segundo.cuentaId).toBe(primero.cuentaId);
    expect(segundo.ordenId).not.toBe(primero.ordenId);
    const cuenta = obtenerCuenta(db, primero.cuentaId);
    expect(cuenta.ordenes.map((o) => o.numero)).toEqual([1, 2]);
    expect(cuenta.ordenes[1].id).toBe(segundo.ordenId);

    const idsComanda2 = (
      db.prepare("SELECT orden_linea_id AS id FROM comanda_lineas WHERE comanda_id = ?").all(segundo.comandaId) as {
        id: number;
      }[]
    ).map((r) => r.id);
    const idsOrden2 = (
      db.prepare("SELECT id FROM orden_lineas WHERE orden_id = ?").all(segundo.ordenId) as { id: number }[]
    ).map((r) => r.id);
    const idsOrden1 = (
      db.prepare("SELECT id FROM orden_lineas WHERE orden_id = ?").all(primero.ordenId) as { id: number }[]
    ).map((r) => r.id);
    expect(idsComanda2.sort()).toEqual(idsOrden2.sort());
    expect(idsComanda2).not.toEqual(expect.arrayContaining(idsOrden1));
    expect(idsOrden2).toHaveLength(2);

    const pan = db.prepare("SELECT reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as {
      reserved_real: number;
    };
    const jugo = db.prepare("SELECT reserved_real FROM stock WHERE producto_id = ?").get(ids.jugo) as {
      reserved_real: number;
    };
    expect(pan.reserved_real).toBe(1);
    expect(jugo.reserved_real).toBe(2);

    const ticket = Buffer.concat(printer.chunks.map((c) => Buffer.from(c))).toString("utf8");
    expect(ticket).toContain("COMANDA\nMesa 7 · Orden 2\nMesero: Ana");
    db.close();
  });

  it("rechaza un envío sin productos con orden_sin_productos", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    await expect(
      enviarOrden(
        db,
        { mesaId: ids.mesa7, empleadoId: 1, claveIdempotencia: "vacio", lineas: [] },
        new MemoryPrinter(),
        defaultConfig(),
      ),
    ).rejects.toMatchObject({ codigo: "orden_sin_productos" });
    expect(db.prepare("SELECT count(*) AS c FROM cuentas").get() as { c: number }).toEqual({ c: 0 });
    expect(db.prepare("SELECT count(*) AS c FROM ordenes").get() as { c: number }).toEqual({ c: 0 });
    expect(db.prepare("SELECT count(*) AS c FROM comandas").get() as { c: number }).toEqual({ c: 0 });
    db.close();
  });

  it("asigna linea_clave distinta a dos líneas del mismo producto", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const result = await enviarOrden(
      db,
      {
        mesaId: ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: "dos-iguales",
        lineas: [
          { productoId: ids.hamburguesa, cantidad: 1, nota: "sin cebolla" },
          { productoId: ids.hamburguesa, cantidad: 1, nota: "extra queso" },
        ],
      },
      new MemoryPrinter(),
      defaultConfig(),
    );
    const lineas = db
      .prepare("SELECT producto_id, linea_clave, nota FROM orden_lineas WHERE orden_id = ? ORDER BY id")
      .all(result.ordenId) as { producto_id: number; linea_clave: string; nota: string | null }[];
    expect(lineas).toHaveLength(2);
    expect(lineas[0].producto_id).toBe(ids.hamburguesa);
    expect(lineas[1].producto_id).toBe(ids.hamburguesa);
    expect(lineas[0].linea_clave).not.toBe(lineas[1].linea_clave);
    expect(lineas[0].linea_clave).not.toBe(String(ids.hamburguesa));
    expect(new Set(lineas.map((l) => l.linea_clave)).size).toBe(2);
    db.close();
  });

  it("revierte todo si la segunda línea apunta a un producto inexistente", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const printer = new MemoryPrinter();
    const panAntes = db.prepare("SELECT on_hand_real, reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as {
      on_hand_real: number;
      reserved_real: number;
    };

    await expect(
      enviarOrden(
        db,
        {
          mesaId: ids.mesa7,
          empleadoId: 1,
          claveIdempotencia: "mitad-rota",
          lineas: [
            { productoId: ids.hamburguesa, cantidad: 2 },
            { productoId: 999999, cantidad: 1 },
          ],
        },
        printer,
        defaultConfig(),
      ),
    ).rejects.toMatchObject({ codigo: "producto_inexistente" });

    expect(db.prepare("SELECT count(*) AS c FROM cuentas").get() as { c: number }).toEqual({ c: 0 });
    expect(db.prepare("SELECT count(*) AS c FROM ordenes").get() as { c: number }).toEqual({ c: 0 });
    expect(db.prepare("SELECT count(*) AS c FROM orden_lineas").get() as { c: number }).toEqual({ c: 0 });
    expect(db.prepare("SELECT count(*) AS c FROM comandas").get() as { c: number }).toEqual({ c: 0 });
    expect(db.prepare("SELECT count(*) AS c FROM comanda_lineas").get() as { c: number }).toEqual({ c: 0 });
    expect(db.prepare("SELECT count(*) AS c FROM print_jobs").get() as { c: number }).toEqual({ c: 0 });
    expect(db.prepare("SELECT on_hand_real, reserved_real FROM stock WHERE producto_id = ?").get(ids.pan)).toEqual(
      panAntes,
    );
    expect(printer.chunks).toHaveLength(0);
    db.close();
  });

  it("rechaza mesa inexistente sin persistir nada", async () => {
    const db = openTestDb();
    seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    await expect(
      enviarOrden(
        db,
        { mesaId: 999999, empleadoId: 1, claveIdempotencia: "sin-mesa", lineas: [{ productoId: 1, cantidad: 1 }] },
        new MemoryPrinter(),
        defaultConfig(),
      ),
    ).rejects.toMatchObject({ codigo: "mesa_inexistente" });
    expect(db.prepare("SELECT count(*) AS c FROM cuentas").get() as { c: number }).toEqual({ c: 0 });
    expect(db.prepare("SELECT count(*) AS c FROM ordenes").get() as { c: number }).toEqual({ c: 0 });
    db.close();
  });

  it("abre una cuenta nueva si la histórica está en_caja", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const historicaId = Number(
      db
        .prepare(
          "INSERT INTO cuentas (mesa_id, estado, abierta_por_empleado_id, abierta_en, cerrada_en) VALUES (?, 'en_caja', 1, ?, ?)",
        )
        .run(ids.mesa7, "2026-08-22T10:00:00.000Z", "2026-08-22T11:00:00.000Z").lastInsertRowid,
    );
    const result = await enviarOrden(
      db,
      {
        mesaId: ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: "tras-caja",
        lineas: [{ productoId: ids.jugo, cantidad: 1 }],
      },
      new MemoryPrinter(),
      defaultConfig(),
    );
    expect(result.cuentaId).not.toBe(historicaId);
    expect(cuentaActivaPorMesa(db, ids.mesa7)).toEqual({ id: result.cuentaId, estado: "abierta" });
    expect(
      (db.prepare("SELECT estado FROM cuentas WHERE id = ?").get(historicaId) as { estado: string }).estado,
    ).toBe("en_caja");
    db.close();
  });

  it("invalida la precuenta vigente y reabre la cuenta", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const cuentaId = Number(
      db
        .prepare("INSERT INTO cuentas (mesa_id, estado, abierta_por_empleado_id, abierta_en) VALUES (?, 'precuenta_emitida', 1, ?)")
        .run(ids.mesa7, "2026-08-22T12:00:00.000Z").lastInsertRowid,
    );
    const precuentaId = Number(
      db
        .prepare(
          "INSERT INTO precuentas (pedido_id, cuenta_id, numero, vigente, mesero_id, snapshot_json, emitida_en) VALUES (NULL, ?, 1, 1, 1, '{}', ?)",
        )
        .run(cuentaId, "2026-08-22T12:10:00.000Z").lastInsertRowid,
    );

    const result = await enviarOrden(
      db,
      {
        mesaId: ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: "despues-precuenta",
        lineas: [{ productoId: ids.agua, cantidad: 1 }],
      },
      new MemoryPrinter(),
      defaultConfig(),
    );

    expect(result.cuentaId).toBe(cuentaId);
    expect(cuentaActivaPorMesa(db, ids.mesa7)).toEqual({ id: cuentaId, estado: "abierta" });
    expect(
      (db.prepare("SELECT vigente FROM precuentas WHERE id = ?").get(precuentaId) as { vigente: number }).vigente,
    ).toBe(0);
    expect(obtenerCuenta(db, cuentaId).ordenes).toHaveLength(1);
    db.close();
  });
});

describe("enviarOrden escribe el libro de inventario por línea", () => {
  async function enviar(politica: PoliticaInventario) {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const cfg = { ...defaultConfig(), politica_inventario: politica };
    const result = await enviarOrden(
      db,
      {
        mesaId: ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: "envio-libro",
        lineas: [
          { productoId: ids.hamburguesa, cantidad: 2 },
          { productoId: ids.jugo, cantidad: 3 },
        ],
      },
      new MemoryPrinter(),
      cfg,
    );
    const libro = db
      .prepare(
        `SELECT oli.producto_id, oli.cantidad_por_unidad, oli.reservada_real, oli.firmada_real, ol.producto_id AS de_producto
         FROM orden_linea_inventario oli
         JOIN orden_lineas ol ON ol.orden_id = oli.orden_id AND ol.linea_clave = oli.linea_clave
         WHERE oli.orden_id = ?
         ORDER BY ol.id, oli.producto_id`,
      )
      .all(result.ordenId) as {
      producto_id: number;
      cantidad_por_unidad: number;
      reservada_real: number;
      firmada_real: number;
      de_producto: number;
    }[];
    return { db, ids, libro };
  }

  it("con política de reserva anota los componentes expandidos como reservados", async () => {
    const { db, ids, libro } = await enviar("reserva_al_enviar_firme_al_precuenta");

    expect(libro).toEqual([
      { de_producto: ids.hamburguesa, producto_id: ids.pan, cantidad_por_unidad: 1, reservada_real: 2, firmada_real: 0 },
      { de_producto: ids.hamburguesa, producto_id: ids.carne, cantidad_por_unidad: 150, reservada_real: 300, firmada_real: 0 },
      { de_producto: ids.hamburguesa, producto_id: ids.queso, cantidad_por_unidad: 1, reservada_real: 2, firmada_real: 0 },
      { de_producto: ids.hamburguesa, producto_id: ids.lechuga, cantidad_por_unidad: 20, reservada_real: 40, firmada_real: 0 },
      { de_producto: ids.jugo, producto_id: ids.jugo, cantidad_por_unidad: 1, reservada_real: 3, firmada_real: 0 },
    ]);
    db.close();
  });

  it("con descuento_al_enviar los anota ya firmados", async () => {
    const { db, ids, libro } = await enviar("descuento_al_enviar");

    expect(libro).toEqual([
      { de_producto: ids.hamburguesa, producto_id: ids.pan, cantidad_por_unidad: 1, reservada_real: 0, firmada_real: 2 },
      { de_producto: ids.hamburguesa, producto_id: ids.carne, cantidad_por_unidad: 150, reservada_real: 0, firmada_real: 300 },
      { de_producto: ids.hamburguesa, producto_id: ids.queso, cantidad_por_unidad: 1, reservada_real: 0, firmada_real: 2 },
      { de_producto: ids.hamburguesa, producto_id: ids.lechuga, cantidad_por_unidad: 20, reservada_real: 0, firmada_real: 40 },
      { de_producto: ids.jugo, producto_id: ids.jugo, cantidad_por_unidad: 1, reservada_real: 0, firmada_real: 3 },
    ]);
    db.close();
  });

  it("un producto sin inventario rastreado no deja renglón", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const cafe = (db.prepare("SELECT id FROM productos WHERE nombre = ?").get("Café") as { id: number }).id;

    const result = await enviarOrden(
      db,
      {
        mesaId: ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: "envio-cafe",
        lineas: [{ productoId: cafe, cantidad: 2 }],
      },
      new MemoryPrinter(),
      defaultConfig(),
    );

    expect(
      (db.prepare("SELECT count(*) AS c FROM orden_linea_inventario WHERE orden_id = ?").get(result.ordenId) as {
        c: number;
      }).c,
    ).toBe(0);
    db.close();
  });

  it("un envío que falla no deja renglones en el libro", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });

    await expect(
      enviarOrden(
        db,
        {
          mesaId: ids.mesa7,
          empleadoId: 1,
          claveIdempotencia: "envio-roto",
          lineas: [
            { productoId: ids.hamburguesa, cantidad: 1 },
            { productoId: 999999, cantidad: 1 },
          ],
        },
        new MemoryPrinter(),
        defaultConfig(),
      ),
    ).rejects.toMatchObject({ codigo: "producto_inexistente" });

    expect((db.prepare("SELECT count(*) AS c FROM orden_linea_inventario").get() as { c: number }).c).toBe(0);
    db.close();
  });
});
