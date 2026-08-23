import { describe, expect, it } from "vitest";
import { defaultConfig, type AppConfig } from "../src/config.ts";
import { enviarACaja, enviarCuentaACaja } from "../src/modules/caja/caja.ts";
import { cuentaActivaPorMesa, obtenerCuenta } from "../src/modules/cuentas/cuentas.ts";
import { totalEfectivoCuenta } from "../src/modules/cuentas/totales.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { pendienteDeFirmar } from "../src/modules/inventario/asientos.ts";
import { corregirOrden } from "../src/modules/ordenes/correcciones.ts";
import { enviarOrden } from "../src/modules/ordenes/enviar.ts";
import { versionEfectivaOrden } from "../src/modules/ordenes/ordenes.ts";
import { agregarLinea, enviarACocina } from "../src/modules/pedidos/pedidos.ts";
import { emitirPrecuenta, emitirPrecuentaCuenta } from "../src/modules/precuenta/precuenta.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { abrirMesa, estadoMesa } from "../src/modules/salon/salon.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { openTestDb } from "./helpers.ts";

describe("circuito mesa 7", () => {
  it("5 hamburguesas, 2 jugos, 3 aguas → precuenta 54000 → caja y mesa libre", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    await crearEmpleado(db, { nombre: "Jefa", pin: "2222", derecho: "avanzado" });
    const printer = new MemoryPrinter();
    const { pedidoId } = abrirMesa(db, { mesaId: ids.mesa7, cubiertos: 4, preset: "salon", meseroId: 1 });
    agregarLinea(db, pedidoId, { productoId: ids.hamburguesa, cantidad: 5 });
    agregarLinea(db, pedidoId, { productoId: ids.jugo, cantidad: 2 });
    agregarLinea(db, pedidoId, { productoId: ids.agua, cantidad: 3 });
    await enviarACocina(db, pedidoId, "1234", printer, defaultConfig());
    const pre = await emitirPrecuenta(db, pedidoId, "1234", printer, defaultConfig());
    expect(pre.totalCentavos).toBe(54000);
    await enviarACaja(db, pedidoId, "2222", defaultConfig());
    expect(estadoMesa(db, ids.mesa7)).toBe("libre");
    const pan = db.prepare("SELECT on_hand_real, reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as {
      on_hand_real: number;
      reserved_real: number;
    };
    expect(pan.on_hand_real).toBe(15);
    expect(pan.reserved_real).toBe(0);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Circuito completo del modelo Cuenta → Órdenes: dos órdenes, una corrección,
// precuenta sobre la suma efectiva y handoff que cierra la cuenta.
// ---------------------------------------------------------------------------

type Db = ReturnType<typeof openTestDb>;

function stock(db: Db, productoId: number): { onHand: number; reserva: number } {
  const row = db.prepare("SELECT on_hand_real, reserved_real FROM stock WHERE producto_id = ?").get(productoId) as
    | { on_hand_real: number; reserved_real: number }
    | undefined;
  return { onHand: row?.on_hand_real ?? 0, reserva: row?.reserved_real ?? 0 };
}

async function circuitoDeCuenta(cfg: AppConfig) {
  const db = openTestDb();
  const ids = seedCartaDemo(db);
  await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
  await crearEmpleado(db, { nombre: "Jefa", pin: "2222", derecho: "avanzado" });
  const printer = new MemoryPrinter();

  const uno = await enviarOrden(
    db,
    {
      mesaId: ids.mesa7,
      empleadoId: 1,
      claveIdempotencia: "circuito-orden-1",
      lineas: [{ productoId: ids.hamburguesa, cantidad: 5 }],
    },
    printer,
    cfg,
  );
  const dos = await enviarOrden(
    db,
    {
      mesaId: ids.mesa7,
      empleadoId: 1,
      claveIdempotencia: "circuito-orden-2",
      lineas: [
        { productoId: ids.jugo, cantidad: 2 },
        { productoId: ids.agua, cantidad: 3 },
      ],
    },
    printer,
    cfg,
  );
  expect(dos.cuentaId).toBe(uno.cuentaId);

  const hamburguesas = versionEfectivaOrden(db, uno.ordenId)[0];
  await corregirOrden(
    db,
    {
      ordenId: uno.ordenId,
      lineas: [
        {
          lineaClave: hamburguesas.lineaClave,
          productoId: hamburguesas.productoId,
          ordenLineaId: hamburguesas.ordenLineaId,
          cantidad: 4,
        },
      ],
      claveIdempotencia: "circuito-correccion-1",
      pin: "1234",
    },
    printer,
    cfg,
  );

  return { db, ids, printer, cuentaId: uno.cuentaId, ordenUno: uno.ordenId, ordenDos: dos.ordenId };
}

describe("circuito cuenta mesa 7", () => {
  it("orden 1 + orden 2 + corrección → precuenta 45100 → caja cierra la cuenta", async () => {
    const cfg = defaultConfig();
    const c = await circuitoDeCuenta(cfg);

    const detalle = obtenerCuenta(c.db, c.cuentaId);
    expect(detalle.ordenes.map((o) => o.numero)).toEqual([1, 2]);
    expect(detalle.ordenes[0].estado).toBe("corregida");

    const pre = await emitirPrecuentaCuenta(c.db, c.cuentaId, "1234", c.printer, cfg);
    // 4 hamburguesas + 2 jugos + 3 aguas: la corrección manda, no el envío.
    expect(pre.totalCentavos).toBe(45100);
    expect(pre.totalCentavos).toBe(totalEfectivoCuenta(c.db, c.cuentaId));

    await enviarCuentaACaja(c.db, c.cuentaId, "2222", cfg);

    expect(obtenerCuenta(c.db, c.cuentaId).estado).toBe("en_caja");
    expect(cuentaActivaPorMesa(c.db, c.ids.mesa7)).toBeNull();
    // 4 hamburguesas consumen 4 panes y 600 g de carne, ya firmados.
    expect(stock(c.db, c.ids.pan)).toEqual({ onHand: 16, reserva: 0 });
    expect(stock(c.db, c.ids.carne)).toEqual({ onHand: 1400, reserva: 0 });
    expect(stock(c.db, c.ids.jugo)).toEqual({ onHand: 8, reserva: 0 });
    expect(stock(c.db, c.ids.agua)).toEqual({ onHand: 7, reserva: 0 });
    expect(pendienteDeFirmar(c.db, [c.ordenUno, c.ordenDos])).toEqual([]);
    c.db.close();
  });

  it("con firme_al_precuenta el circuito cierra sin reserva pendiente", async () => {
    const cfg: AppConfig = { ...defaultConfig(), politica_inventario: "reserva_al_enviar_firme_al_precuenta" };
    const c = await circuitoDeCuenta(cfg);

    const pre = await emitirPrecuentaCuenta(c.db, c.cuentaId, "1234", c.printer, cfg);
    expect(pre.totalCentavos).toBe(45100);
    expect(pendienteDeFirmar(c.db, [c.ordenUno, c.ordenDos])).toEqual([]);

    await enviarCuentaACaja(c.db, c.cuentaId, "2222", cfg);

    expect(stock(c.db, c.ids.pan)).toEqual({ onHand: 16, reserva: 0 });
    expect(stock(c.db, c.ids.jugo)).toEqual({ onHand: 8, reserva: 0 });
    expect(stock(c.db, c.ids.agua)).toEqual({ onHand: 7, reserva: 0 });
    c.db.close();
  });

  it("con descuento_al_enviar el circuito no deja nada por firmar", async () => {
    const cfg: AppConfig = { ...defaultConfig(), politica_inventario: "descuento_al_enviar" };
    const c = await circuitoDeCuenta(cfg);
    expect(stock(c.db, c.ids.pan)).toEqual({ onHand: 16, reserva: 0 });

    await emitirPrecuentaCuenta(c.db, c.cuentaId, "1234", c.printer, cfg);
    await enviarCuentaACaja(c.db, c.cuentaId, "2222", cfg);

    expect(stock(c.db, c.ids.pan)).toEqual({ onHand: 16, reserva: 0 });
    expect(stock(c.db, c.ids.carne)).toEqual({ onHand: 1400, reserva: 0 });
    expect(pendienteDeFirmar(c.db, [c.ordenUno, c.ordenDos])).toEqual([]);
    c.db.close();
  });
});
