import { describe, expect, it } from "vitest";
import { defaultConfig, type AppConfig } from "../src/config.ts";
import { obtenerCuenta } from "../src/modules/cuentas/cuentas.ts";
import { selloCuenta, snapshotCuenta, totalEfectivoCuenta } from "../src/modules/cuentas/totales.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { pendienteDeFirmar } from "../src/modules/inventario/asientos.ts";
import { corregirOrden, type CambioOrdenInput } from "../src/modules/ordenes/correcciones.ts";
import { enviarOrden } from "../src/modules/ordenes/enviar.ts";
import { versionEfectivaOrden, type LineaEfectiva, type NuevaLineaOrden } from "../src/modules/ordenes/ordenes.ts";
import { agregarLinea, enviarACocina } from "../src/modules/pedidos/pedidos.ts";
import { emitirPrecuenta, emitirPrecuentaCuenta, reimprimirPrecuenta } from "../src/modules/precuenta/precuenta.ts";
import { seedCartaDemo, type SeedIds } from "../src/modules/productos/seed.ts";
import { abrirMesa } from "../src/modules/salon/salon.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { openTestDb } from "./helpers.ts";

type Db = ReturnType<typeof openTestDb>;

async function pedidoEjemplo(db: Db, ids: SeedIds) {
  await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
  const { pedidoId } = abrirMesa(db, { mesaId: ids.mesa7, cubiertos: 4, preset: "salon", meseroId: 1 });
  agregarLinea(db, pedidoId, { productoId: ids.hamburguesa, cantidad: 5 });
  agregarLinea(db, pedidoId, { productoId: ids.jugo, cantidad: 2 });
  agregarLinea(db, pedidoId, { productoId: ids.agua, cantidad: 3 });
  const printer = new MemoryPrinter();
  await enviarACocina(db, pedidoId, "1234", printer, defaultConfig());
  return { pedidoId, printer };
}

describe("precuenta", () => {
  it("emite snapshot 54000, no firma stock, PIN inválido no crea fila", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    const { pedidoId, printer } = await pedidoEjemplo(db, ids);
    await expect(emitirPrecuenta(db, pedidoId, "0000", printer, defaultConfig())).rejects.toMatchObject({
      codigo: "pin_invalido",
    });
    expect(db.prepare("SELECT count(*) AS c FROM precuentas").get() as { c: number }).toEqual({ c: 0 });

    const reservedAntes = (
      db.prepare("SELECT reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as { reserved_real: number }
    ).reserved_real;
    const emitted = await emitirPrecuenta(db, pedidoId, "1234", printer, defaultConfig());
    expect(emitted.numero).toBe(1);
    const snap = JSON.parse(
      (db.prepare("SELECT snapshot_json FROM precuentas WHERE id = ?").get(emitted.precuentaId) as { snapshot_json: string })
        .snapshot_json,
    ) as { totalCentavos: number; leyenda: string };
    expect(snap.totalCentavos).toBe(54000);
    expect(snap.leyenda).toMatch(/no es boleta/i);
    const reservedDespues = (
      db.prepare("SELECT reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as { reserved_real: number }
    ).reserved_real;
    expect(reservedDespues).toBe(reservedAntes);

    const reprint = await reimprimirPrecuenta(db, emitted.precuentaId, printer);
    expect(reprint.numero).toBe(emitted.numero);
    expect(
      (db.prepare("SELECT reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as { reserved_real: number })
        .reserved_real,
    ).toBe(reservedAntes);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Precuenta por cuenta (modelo Cuenta → Órdenes).
// ---------------------------------------------------------------------------

type SnapshotGuardado = {
  cuentaId: number;
  mesaNumero: number;
  mesero: string;
  sello: string;
  ordenes: {
    numero: number;
    indicaciones: string | null;
    lineas: {
      productoId: number;
      nombre: string;
      cantidad: number;
      precioCentavos: number;
      nota: string | null;
    }[];
  }[];
  totalCentavos: number;
  leyenda: string;
};

let claves = 0;
function clave(prefijo: string): string {
  claves += 1;
  return `${prefijo}-${claves}`;
}

async function cuentaConDosOrdenes(cfg: AppConfig = defaultConfig()) {
  const db = openTestDb();
  const ids = seedCartaDemo(db);
  await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
  const printer = new MemoryPrinter();
  const uno = await enviarOrden(
    db,
    {
      mesaId: ids.mesa7,
      empleadoId: 1,
      claveIdempotencia: clave("orden-1"),
      indicaciones: "primero bebidas",
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
      claveIdempotencia: clave("orden-2"),
      lineas: [
        { productoId: ids.jugo, cantidad: 2 },
        { productoId: ids.agua, cantidad: 3 },
      ],
    },
    printer,
    cfg,
  );
  return { db, ids, printer, cuentaId: uno.cuentaId, ordenUno: uno.ordenId, ordenDos: dos.ordenId };
}

async function cuentaConUnaOrden(lineas: (ids: SeedIds) => NuevaLineaOrden[], cfg: AppConfig = defaultConfig()) {
  const db = openTestDb();
  const ids = seedCartaDemo(db);
  await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
  const envio = await enviarOrden(
    db,
    { mesaId: ids.mesa7, empleadoId: 1, claveIdempotencia: clave("orden"), lineas: lineas(ids) },
    new MemoryPrinter(),
    cfg,
  );
  return { db, ids, cuentaId: envio.cuentaId, ordenId: envio.ordenId, lineas: versionEfectivaOrden(db, envio.ordenId) };
}

function cambio(linea: LineaEfectiva, cantidad: number): CambioOrdenInput {
  return {
    lineaClave: linea.lineaClave,
    productoId: linea.productoId,
    ordenLineaId: linea.ordenLineaId,
    cantidad,
    nota: linea.nota,
  };
}

function snapshotDe(db: Db, precuentaId: number): SnapshotGuardado {
  const row = db.prepare("SELECT snapshot_json FROM precuentas WHERE id = ?").get(precuentaId) as {
    snapshot_json: string;
  };
  return JSON.parse(row.snapshot_json) as SnapshotGuardado;
}

function stock(db: Db, productoId: number): { onHand: number; reserva: number } {
  const row = db.prepare("SELECT on_hand_real, reserved_real FROM stock WHERE producto_id = ?").get(productoId) as
    | { on_hand_real: number; reserved_real: number }
    | undefined;
  return { onHand: row?.on_hand_real ?? 0, reserva: row?.reserved_real ?? 0 };
}

const AL_PRECUENTA: AppConfig = { ...defaultConfig(), politica_inventario: "reserva_al_enviar_firme_al_precuenta" };
const AL_CAJA: AppConfig = { ...defaultConfig(), politica_inventario: "reserva_al_enviar_firme_al_enviar_caja" };
const AL_ENVIAR: AppConfig = { ...defaultConfig(), politica_inventario: "descuento_al_enviar" };

describe("precuenta por cuenta", () => {
  it("suma la versión efectiva de todas las órdenes de la cuenta", async () => {
    const e = await cuentaConDosOrdenes();
    const lineasUno = versionEfectivaOrden(e.db, e.ordenUno);
    await corregirOrden(
      e.db,
      { ordenId: e.ordenUno, lineas: [cambio(lineasUno[0], 4)], claveIdempotencia: clave("corr"), pin: "1234" },
      new MemoryPrinter(),
      defaultConfig(),
    );

    const emitida = await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", e.printer, defaultConfig());

    // 4 hamburguesas + 2 jugos + 3 aguas
    expect(emitida.totalCentavos).toBe(4 * 8900 + 2 * 2500 + 3 * 1500);
    expect(emitida.totalCentavos).toBe(totalEfectivoCuenta(e.db, e.cuentaId));
    expect(emitida.numero).toBe(1);
    e.db.close();
  });

  it("el snapshot guarda cuenta, mesa, órdenes con líneas efectivas y total", async () => {
    const e = await cuentaConDosOrdenes();
    const emitida = await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", e.printer, defaultConfig());

    const snap = snapshotDe(e.db, emitida.precuentaId);
    expect(snap.cuentaId).toBe(e.cuentaId);
    expect(snap.mesaNumero).toBe(7);
    expect(snap.mesero).toBe("Ana");
    expect(snap.totalCentavos).toBe(54000);
    expect(snap.leyenda).toMatch(/no es boleta/i);
    expect(snap.sello).toBe(selloCuenta(e.db, e.cuentaId));
    expect(snap.ordenes).toEqual([
      {
        numero: 1,
        indicaciones: "primero bebidas",
        lineas: [
          { productoId: e.ids.hamburguesa, nombre: "Hamburguesa", cantidad: 5, precioCentavos: 8900, nota: null },
        ],
      },
      {
        numero: 2,
        indicaciones: null,
        lineas: [
          { productoId: e.ids.jugo, nombre: "Jugo", cantidad: 2, precioCentavos: 2500, nota: null },
          { productoId: e.ids.agua, nombre: "Agua con gas", cantidad: 3, precioCentavos: 1500, nota: null },
        ],
      },
    ]);
    expect(snap).toEqual(expect.objectContaining(snapshotCuenta(e.db, e.cuentaId)));
    e.db.close();
  });

  it("el snapshot toma las indicaciones vigentes, no las del envío", async () => {
    const e = await cuentaConUnaOrden((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    const lineas = versionEfectivaOrden(e.db, e.ordenId);
    await corregirOrden(
      e.db,
      {
        ordenId: e.ordenId,
        lineas: [cambio(lineas[0], 3)],
        indicaciones: "sin hielo",
        claveIdempotencia: clave("corr"),
        pin: "1234",
      },
      new MemoryPrinter(),
      defaultConfig(),
    );

    const emitida = await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), defaultConfig());

    const snap = snapshotDe(e.db, emitida.precuentaId);
    expect(snap.ordenes[0].indicaciones).toBe("sin hielo");
    expect(snap.ordenes[0].lineas[0].cantidad).toBe(3);
    e.db.close();
  });

  it("no cobra líneas en cero y omite las órdenes que quedaron vacías", async () => {
    const e = await cuentaConDosOrdenes();
    const lineasDos = versionEfectivaOrden(e.db, e.ordenDos);
    // Jugo a cero deja la línea en la historia; el agua sigue viva.
    await corregirOrden(
      e.db,
      { ordenId: e.ordenDos, lineas: [cambio(lineasDos[0], 0)], claveIdempotencia: clave("corr"), pin: "1234" },
      new MemoryPrinter(),
      defaultConfig(),
    );
    const lineasUno = versionEfectivaOrden(e.db, e.ordenUno);
    await corregirOrden(
      e.db,
      { ordenId: e.ordenUno, lineas: [cambio(lineasUno[0], 0)], claveIdempotencia: clave("corr"), pin: "1234" },
      new MemoryPrinter(),
      defaultConfig(),
    );
    expect(obtenerCuenta(e.db, e.cuentaId).ordenes[0].estado).toBe("anulada");

    const emitida = await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", e.printer, defaultConfig());

    const snap = snapshotDe(e.db, emitida.precuentaId);
    expect(snap.ordenes).toEqual([
      {
        numero: 2,
        indicaciones: null,
        lineas: [{ productoId: e.ids.agua, nombre: "Agua con gas", cantidad: 3, precioCentavos: 1500, nota: null }],
      },
    ]);
    expect(snap.totalCentavos).toBe(4500);
    e.db.close();
  });

  it("PIN inválido no crea precuenta, no mueve stock y no cambia el estado", async () => {
    const e = await cuentaConUnaOrden((ids) => [{ productoId: ids.jugo, cantidad: 2 }], AL_PRECUENTA);
    const antes = stock(e.db, e.ids.jugo);

    await expect(
      emitirPrecuentaCuenta(e.db, e.cuentaId, "0000", new MemoryPrinter(), AL_PRECUENTA),
    ).rejects.toMatchObject({ codigo: "pin_invalido" });

    expect(e.db.prepare("SELECT count(*) AS c FROM precuentas").get() as { c: number }).toEqual({ c: 0 });
    expect(stock(e.db, e.ids.jugo)).toEqual(antes);
    expect(obtenerCuenta(e.db, e.cuentaId).estado).toBe("abierta");
    e.db.close();
  });

  it("marca la cuenta precuenta_emitida y deja la precuenta vigente", async () => {
    const e = await cuentaConUnaOrden((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);

    const emitida = await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), defaultConfig());

    expect(obtenerCuenta(e.db, e.cuentaId).estado).toBe("precuenta_emitida");
    const fila = e.db
      .prepare("SELECT pedido_id, cuenta_id, vigente, mesero_id FROM precuentas WHERE id = ?")
      .get(emitida.precuentaId) as { pedido_id: number | null; cuenta_id: number; vigente: number; mesero_id: number };
    expect(fila).toEqual({ pedido_id: null, cuenta_id: e.cuentaId, vigente: 1, mesero_id: 1 });
    e.db.close();
  });

  it("con firme_al_precuenta firma la reserva; con firme_al_enviar_caja no la toca", async () => {
    const alPrecuenta = await cuentaConUnaOrden((ids) => [{ productoId: ids.jugo, cantidad: 2 }], AL_PRECUENTA);
    expect(stock(alPrecuenta.db, alPrecuenta.ids.jugo)).toEqual({ onHand: 10, reserva: 2 });

    await emitirPrecuentaCuenta(alPrecuenta.db, alPrecuenta.cuentaId, "1234", new MemoryPrinter(), AL_PRECUENTA);

    expect(stock(alPrecuenta.db, alPrecuenta.ids.jugo)).toEqual({ onHand: 8, reserva: 0 });
    expect(pendienteDeFirmar(alPrecuenta.db, [alPrecuenta.ordenId])).toEqual([]);
    alPrecuenta.db.close();

    const alCaja = await cuentaConUnaOrden((ids) => [{ productoId: ids.jugo, cantidad: 2 }], AL_CAJA);

    await emitirPrecuentaCuenta(alCaja.db, alCaja.cuentaId, "1234", new MemoryPrinter(), AL_CAJA);

    expect(stock(alCaja.db, alCaja.ids.jugo)).toEqual({ onHand: 10, reserva: 2 });
    expect(pendienteDeFirmar(alCaja.db, [alCaja.ordenId])).toHaveLength(1);
    alCaja.db.close();
  });

  it("con descuento_al_enviar la precuenta no mueve nada porque ya no hay reserva", async () => {
    const e = await cuentaConUnaOrden((ids) => [{ productoId: ids.jugo, cantidad: 2 }], AL_ENVIAR);
    expect(stock(e.db, e.ids.jugo)).toEqual({ onHand: 8, reserva: 0 });

    await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), AL_ENVIAR);

    expect(stock(e.db, e.ids.jugo)).toEqual({ onHand: 8, reserva: 0 });
    e.db.close();
  });

  it("una segunda precuenta invalida la primera, numera 2 y no vuelve a firmar", async () => {
    const e = await cuentaConUnaOrden((ids) => [{ productoId: ids.jugo, cantidad: 2 }], AL_PRECUENTA);
    const primera = await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), AL_PRECUENTA);
    expect(stock(e.db, e.ids.jugo)).toEqual({ onHand: 8, reserva: 0 });

    const segunda = await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), AL_PRECUENTA);

    expect(segunda.numero).toBe(2);
    expect(segunda.totalCentavos).toBe(primera.totalCentavos);
    // Reemitir sin cambios no puede descontar dos veces las mismas unidades.
    expect(stock(e.db, e.ids.jugo)).toEqual({ onHand: 8, reserva: 0 });
    const vigentes = e.db
      .prepare("SELECT id FROM precuentas WHERE cuenta_id = ? AND vigente = 1")
      .all(e.cuentaId) as { id: number }[];
    expect(vigentes).toEqual([{ id: segunda.precuentaId }]);
    e.db.close();
  });

  it("una orden nueva después de la precuenta la invalida y la siguiente cobra el total nuevo", async () => {
    const e = await cuentaConUnaOrden((ids) => [{ productoId: ids.jugo, cantidad: 2 }], AL_PRECUENTA);
    const primera = await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), AL_PRECUENTA);
    expect(primera.totalCentavos).toBe(5000);

    await enviarOrden(
      e.db,
      {
        mesaId: e.ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: clave("orden-post"),
        lineas: [{ productoId: e.ids.agua, cantidad: 1 }],
      },
      new MemoryPrinter(),
      AL_PRECUENTA,
    );

    expect(
      e.db.prepare("SELECT vigente FROM precuentas WHERE id = ?").get(primera.precuentaId) as { vigente: number },
    ).toEqual({ vigente: 0 });
    expect(obtenerCuenta(e.db, e.cuentaId).estado).toBe("abierta");

    const segunda = await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), AL_PRECUENTA);

    expect(segunda.totalCentavos).toBe(6500);
    expect(segunda.numero).toBe(2);
    expect(segunda.precuentaId).not.toBe(primera.precuentaId);
    // La primera ronda ya estaba firmada: la segunda firma solo el agua nueva.
    expect(stock(e.db, e.ids.jugo)).toEqual({ onHand: 8, reserva: 0 });
    expect(stock(e.db, e.ids.agua)).toEqual({ onHand: 9, reserva: 0 });
    e.db.close();
  });

  it("cambiar la política a firme_al_enviar_caja después del envío deja la reserva para caja", async () => {
    const e = await cuentaConUnaOrden((ids) => [{ productoId: ids.jugo, cantidad: 2 }], AL_PRECUENTA);

    // El local cambia la política con la cuenta viva: la precuenta ya no firma.
    await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), AL_CAJA);

    expect(stock(e.db, e.ids.jugo)).toEqual({ onHand: 10, reserva: 2 });
    expect(pendienteDeFirmar(e.db, [e.ordenId])).toHaveLength(1);
    e.db.close();
  });

  it("una cuenta sin consumo cobrable no emite precuenta", async () => {
    const e = await cuentaConUnaOrden((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    const lineas = versionEfectivaOrden(e.db, e.ordenId);
    await corregirOrden(
      e.db,
      { ordenId: e.ordenId, lineas: [cambio(lineas[0], 0)], claveIdempotencia: clave("corr"), pin: "1234" },
      new MemoryPrinter(),
      defaultConfig(),
    );

    await expect(
      emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), defaultConfig()),
    ).rejects.toMatchObject({ codigo: "cuenta_sin_consumo" });
    expect(e.db.prepare("SELECT count(*) AS c FROM precuentas").get() as { c: number }).toEqual({ c: 0 });
    e.db.close();
  });

  it("una cuenta inexistente o cerrada no emite precuenta", async () => {
    const e = await cuentaConUnaOrden((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);

    await expect(
      emitirPrecuentaCuenta(e.db, 9999, "1234", new MemoryPrinter(), defaultConfig()),
    ).rejects.toMatchObject({ codigo: "cuenta_inexistente" });

    e.db.prepare("UPDATE cuentas SET estado = 'en_caja' WHERE id = ?").run(e.cuentaId);
    await expect(
      emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), defaultConfig()),
    ).rejects.toMatchObject({ codigo: "cuenta_cerrada" });
    expect(e.db.prepare("SELECT count(*) AS c FROM precuentas").get() as { c: number }).toEqual({ c: 0 });
    e.db.close();
  });

  it("imprime el total y reimprime desde el snapshot de la cuenta", async () => {
    const e = await cuentaConDosOrdenes();
    const printer = new MemoryPrinter();
    const emitida = await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", printer, defaultConfig());
    const texto = () => printer.chunks.map((c) => new TextDecoder().decode(c)).join("");
    expect(texto()).toContain("PRECUENTA");
    expect(texto()).toContain("54000");
    expect(texto()).toContain("Hamburguesa");

    const reimpresa = await reimprimirPrecuenta(e.db, emitida.precuentaId, printer);

    expect(reimpresa.numero).toBe(emitida.numero);
    expect(texto()).toContain("PRECUENTA (reimpresión)");
    expect(stock(e.db, e.ids.jugo)).toEqual({ onHand: 10, reserva: 2 });
    e.db.close();
  });

  it("el ticket de la cuenta no imprime cubiertos; el del pedido legacy sí", async () => {
    const e = await cuentaConDosOrdenes();
    const printer = new MemoryPrinter();
    const emitida = await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", printer, defaultConfig());
    const texto = () => printer.chunks.map((c) => new TextDecoder().decode(c)).join("");

    // La cuenta no guarda cubiertos: imprimir "Cubiertos: 0" sería inventar un dato.
    expect(texto()).not.toContain("Cubiertos");
    await reimprimirPrecuenta(e.db, emitida.precuentaId, printer);
    expect(texto()).not.toContain("Cubiertos");
    e.db.close();

    const legacy = openTestDb();
    const ids = seedCartaDemo(legacy);
    const impresora = (await pedidoEjemplo(legacy, ids)).printer;
    const emitidaLegacy = await emitirPrecuenta(legacy, 1, "1234", impresora, defaultConfig());
    const textoLegacy = () => impresora.chunks.map((c) => new TextDecoder().decode(c)).join("");
    expect(textoLegacy()).toContain("Cubiertos: 4");
    await reimprimirPrecuenta(legacy, emitidaLegacy.precuentaId, impresora);
    expect(textoLegacy()).toContain("Cubiertos: 4");
    legacy.close();
  });

  it("dos líneas del mismo producto se distinguen por su nota en snapshot y ticket", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const printer = new MemoryPrinter();
    const envio = await enviarOrden(
      db,
      {
        mesaId: ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: clave("orden-notas"),
        lineas: [
          { productoId: ids.hamburguesa, cantidad: 1, nota: "sin cebolla" },
          { productoId: ids.hamburguesa, cantidad: 1, nota: "sin queso" },
          { productoId: ids.jugo, cantidad: 1 },
        ],
      },
      printer,
      defaultConfig(),
    );

    const emitida = await emitirPrecuentaCuenta(db, envio.cuentaId, "1234", printer, defaultConfig());

    // Sin la nota el snapshot mostraría dos renglones idénticos y el cliente no
    // podría atribuir ninguno de los dos.
    const snap = snapshotDe(db, emitida.precuentaId);
    expect(snap.ordenes[0].lineas.map((l) => ({ nombre: l.nombre, nota: l.nota }))).toEqual([
      { nombre: "Hamburguesa", nota: "sin cebolla" },
      { nombre: "Hamburguesa", nota: "sin queso" },
      { nombre: "Jugo", nota: null },
    ]);
    const texto = printer.chunks.map((c) => new TextDecoder().decode(c)).join("");
    expect(texto).toContain("1 x Hamburguesa (sin cebolla)  8900");
    expect(texto).toContain("1 x Hamburguesa (sin queso)  8900");
    expect(texto).toContain("1 x Jugo  2500");
    expect(emitida.totalCentavos).toBe(8900 + 8900 + 2500);
    db.close();
  });
});
