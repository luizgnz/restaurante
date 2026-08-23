import { describe, expect, it } from "vitest";
import { defaultConfig, type AppConfig } from "../src/config.ts";
import { enviarACaja, enviarCuentaACaja } from "../src/modules/caja/caja.ts";
import { cuentaActivaPorMesa, obtenerCuenta } from "../src/modules/cuentas/cuentas.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { pendienteDeFirmar } from "../src/modules/inventario/asientos.ts";
import { corregirOrden, type CambioOrdenInput } from "../src/modules/ordenes/correcciones.ts";
import { enviarOrden } from "../src/modules/ordenes/enviar.ts";
import { versionEfectivaOrden, type LineaEfectiva, type NuevaLineaOrden } from "../src/modules/ordenes/ordenes.ts";
import { agregarLinea, enviarACocina } from "../src/modules/pedidos/pedidos.ts";
import { emitirPrecuenta, emitirPrecuentaCuenta } from "../src/modules/precuenta/precuenta.ts";
import { seedCartaDemo, type SeedIds } from "../src/modules/productos/seed.ts";
import { abrirMesa, estadoMesa } from "../src/modules/salon/salon.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { openTestDb } from "./helpers.ts";

type Db = ReturnType<typeof openTestDb>;

describe("enviar a caja", () => {
  it("básico no puede; avanzado firma stock, libera mesa y no se reenvía", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    await crearEmpleado(db, { nombre: "Jefa", pin: "2222", derecho: "avanzado" });
    const { pedidoId } = abrirMesa(db, { mesaId: ids.mesa7, cubiertos: 4, preset: "salon", meseroId: 1 });
    agregarLinea(db, pedidoId, { productoId: ids.hamburguesa, cantidad: 5 });
    const printer = new MemoryPrinter();
    await enviarACocina(db, pedidoId, "1234", printer, defaultConfig());

    await expect(enviarACaja(db, pedidoId, "2222", defaultConfig())).rejects.toMatchObject({
      codigo: "precuenta_requerida",
    });
    await emitirPrecuenta(db, pedidoId, "1234", printer, defaultConfig());

    await expect(enviarACaja(db, pedidoId, "1234", defaultConfig())).rejects.toMatchObject({ codigo: "sin_derecho" });

    await enviarACaja(db, pedidoId, "2222", defaultConfig());
    const pan = db.prepare("SELECT on_hand_real, reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as {
      on_hand_real: number;
      reserved_real: number;
    };
    expect(pan.on_hand_real).toBe(15);
    expect(pan.reserved_real).toBe(0);
    expect(estadoMesa(db, ids.mesa7)).toBe("libre");
    expect(db.prepare("SELECT estado FROM pedidos WHERE id = ?").get(pedidoId) as { estado: string }).toEqual({
      estado: "en_caja",
    });
    await expect(enviarACaja(db, pedidoId, "2222", defaultConfig())).rejects.toMatchObject({ codigo: "pedido_cerrado" });
    db.close();
  });

  async function pedidoEnviado(cfg: AppConfig) {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    await crearEmpleado(db, { nombre: "Jefa", pin: "2222", derecho: "avanzado" });
    const { pedidoId } = abrirMesa(db, { mesaId: ids.mesa7, cubiertos: 4, preset: "salon", meseroId: 1 });
    agregarLinea(db, pedidoId, { productoId: ids.jugo, cantidad: 2 });
    await enviarACocina(db, pedidoId, "1234", new MemoryPrinter(), cfg);
    return { db, ids, pedidoId };
  }

  it("sin precuenta obligatoria guarda el handoff con precuenta_id nulo, no cero", async () => {
    const cfg: AppConfig = { ...defaultConfig(), precuenta_obligatoria_antes_de_caja: false };
    const e = await pedidoEnviado(cfg);

    // Antes se insertaba 0, que no es ningún id: la FK a `precuentas` reventaba
    // con un error crudo de SQLite y el pedido se quedaba sin entregar.
    const { handoffId } = await enviarACaja(e.db, e.pedidoId, "2222", cfg);

    expect(
      e.db.prepare("SELECT pedido_id, cuenta_id, precuenta_id FROM caja_handoffs WHERE id = ?").get(handoffId),
    ).toEqual({ pedido_id: e.pedidoId, cuenta_id: null, precuenta_id: null });
    expect(e.db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(e.db.prepare("SELECT estado FROM pedidos WHERE id = ?").get(e.pedidoId)).toEqual({ estado: "en_caja" });
    e.db.close();
  });

  it("honra enviar_a_caja_requiere_avanzado también en el flujo legacy", async () => {
    const conAvanzado: AppConfig = { ...defaultConfig(), precuenta_obligatoria_antes_de_caja: false };
    const estricto = await pedidoEnviado(conAvanzado);
    await expect(enviarACaja(estricto.db, estricto.pedidoId, "1234", conAvanzado)).rejects.toMatchObject({
      codigo: "sin_derecho",
    });
    estricto.db.close();

    const relajado: AppConfig = { ...conAvanzado, enviar_a_caja_requiere_avanzado: false };
    const suelto = await pedidoEnviado(relajado);
    await expect(enviarACaja(suelto.db, suelto.pedidoId, "1234", relajado)).resolves.toMatchObject({
      handoffId: expect.any(Number),
    });
    suelto.db.close();
  });
});

// ---------------------------------------------------------------------------
// Caja por cuenta (modelo Cuenta → Órdenes).
// ---------------------------------------------------------------------------

let claves = 0;
function clave(prefijo: string): string {
  claves += 1;
  return `${prefijo}-${claves}`;
}

async function cuentaAbierta(lineas: (ids: SeedIds) => NuevaLineaOrden[], cfg: AppConfig = defaultConfig()) {
  const db = openTestDb();
  const ids = seedCartaDemo(db);
  await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
  await crearEmpleado(db, { nombre: "Jefa", pin: "2222", derecho: "avanzado" });
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

function stock(db: Db, productoId: number): { onHand: number; reserva: number } {
  const row = db.prepare("SELECT on_hand_real, reserved_real FROM stock WHERE producto_id = ?").get(productoId) as
    | { on_hand_real: number; reserved_real: number }
    | undefined;
  return { onHand: row?.on_hand_real ?? 0, reserva: row?.reserved_real ?? 0 };
}

const AL_PRECUENTA: AppConfig = { ...defaultConfig(), politica_inventario: "reserva_al_enviar_firme_al_precuenta" };
const AL_CAJA: AppConfig = { ...defaultConfig(), politica_inventario: "reserva_al_enviar_firme_al_enviar_caja" };
const AL_ENVIAR: AppConfig = { ...defaultConfig(), politica_inventario: "descuento_al_enviar" };

describe("enviar cuenta a caja", () => {
  it("exige precuenta vigente antes del handoff", async () => {
    const e = await cuentaAbierta((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);

    await expect(enviarCuentaACaja(e.db, e.cuentaId, "2222", defaultConfig())).rejects.toMatchObject({
      codigo: "precuenta_requerida",
    });
    expect(obtenerCuenta(e.db, e.cuentaId).estado).toBe("abierta");
    e.db.close();
  });

  it("exige derecho avanzado", async () => {
    const e = await cuentaAbierta((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), defaultConfig());

    await expect(enviarCuentaACaja(e.db, e.cuentaId, "1234", defaultConfig())).rejects.toMatchObject({
      codigo: "sin_derecho",
    });
    expect(e.db.prepare("SELECT count(*) AS c FROM caja_handoffs").get() as { c: number }).toEqual({ c: 0 });
    expect(obtenerCuenta(e.db, e.cuentaId).estado).toBe("precuenta_emitida");
    e.db.close();
  });

  it("cierra la cuenta, guarda el handoff con la precuenta y libera la mesa", async () => {
    const e = await cuentaAbierta((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    const precuenta = await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), defaultConfig());

    const { handoffId } = await enviarCuentaACaja(e.db, e.cuentaId, "2222", defaultConfig());

    const handoff = e.db
      .prepare("SELECT pedido_id, cuenta_id, precuenta_id, mesero_id, snapshot_json FROM caja_handoffs WHERE id = ?")
      .get(handoffId) as {
      pedido_id: number | null;
      cuenta_id: number;
      precuenta_id: number;
      mesero_id: number;
      snapshot_json: string;
    };
    expect(handoff.pedido_id).toBeNull();
    expect(handoff.cuenta_id).toBe(e.cuentaId);
    expect(handoff.precuenta_id).toBe(precuenta.precuentaId);
    expect(handoff.mesero_id).toBe(2);
    expect((JSON.parse(handoff.snapshot_json) as { totalCentavos: number }).totalCentavos).toBe(5000);

    const cuenta = e.db.prepare("SELECT estado, cerrada_en FROM cuentas WHERE id = ?").get(e.cuentaId) as {
      estado: string;
      cerrada_en: string | null;
    };
    expect(cuenta.estado).toBe("en_caja");
    expect(cuenta.cerrada_en).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
    expect(cuentaActivaPorMesa(e.db, e.ids.mesa7)).toBeNull();
    e.db.close();
  });

  it("una cuenta ya cerrada no se reenvía ni firma dos veces", async () => {
    const e = await cuentaAbierta((ids) => [{ productoId: ids.jugo, cantidad: 2 }], AL_CAJA);
    await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), AL_CAJA);
    await enviarCuentaACaja(e.db, e.cuentaId, "2222", AL_CAJA);
    expect(stock(e.db, e.ids.jugo)).toEqual({ onHand: 8, reserva: 0 });

    await expect(enviarCuentaACaja(e.db, e.cuentaId, "2222", AL_CAJA)).rejects.toMatchObject({
      codigo: "cuenta_cerrada",
    });

    expect(stock(e.db, e.ids.jugo)).toEqual({ onHand: 8, reserva: 0 });
    expect(e.db.prepare("SELECT count(*) AS c FROM caja_handoffs").get() as { c: number }).toEqual({ c: 1 });
    e.db.close();
  });

  it("una cuenta inexistente no llega a caja", async () => {
    const e = await cuentaAbierta((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);

    await expect(enviarCuentaACaja(e.db, 9999, "2222", defaultConfig())).rejects.toMatchObject({
      codigo: "cuenta_inexistente",
    });
    e.db.close();
  });

  it("una orden posterior a la precuenta bloquea el handoff hasta reemitir", async () => {
    const e = await cuentaAbierta((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), defaultConfig());
    await enviarOrden(
      e.db,
      {
        mesaId: e.ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: clave("orden-post"),
        lineas: [{ productoId: e.ids.agua, cantidad: 1 }],
      },
      new MemoryPrinter(),
      defaultConfig(),
    );

    await expect(enviarCuentaACaja(e.db, e.cuentaId, "2222", defaultConfig())).rejects.toMatchObject({
      codigo: "precuenta_desactualizada",
    });

    const segunda = await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), defaultConfig());
    const { handoffId } = await enviarCuentaACaja(e.db, e.cuentaId, "2222", defaultConfig());
    const handoff = e.db.prepare("SELECT precuenta_id, snapshot_json FROM caja_handoffs WHERE id = ?").get(handoffId) as {
      precuenta_id: number;
      snapshot_json: string;
    };
    expect(handoff.precuenta_id).toBe(segunda.precuentaId);
    expect((JSON.parse(handoff.snapshot_json) as { totalCentavos: number }).totalCentavos).toBe(6500);
    e.db.close();
  });

  it("una corrección posterior a la precuenta bloquea el handoff", async () => {
    const e = await cuentaAbierta((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), defaultConfig());
    await corregirOrden(
      e.db,
      { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 1)], claveIdempotencia: clave("corr"), pin: "1234" },
      new MemoryPrinter(),
      defaultConfig(),
    );

    await expect(enviarCuentaACaja(e.db, e.cuentaId, "2222", defaultConfig())).rejects.toMatchObject({
      codigo: "precuenta_desactualizada",
    });

    const segunda = await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), defaultConfig());
    expect(segunda.totalCentavos).toBe(2500);
    await enviarCuentaACaja(e.db, e.cuentaId, "2222", defaultConfig());
    expect(obtenerCuenta(e.db, e.cuentaId).estado).toBe("en_caja");
    e.db.close();
  });

  it("una precuenta que quedó vigente pero no refleja la última orden no sirve", async () => {
    const e = await cuentaAbierta((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    const primera = await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), defaultConfig());
    await enviarOrden(
      e.db,
      {
        mesaId: e.ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: clave("orden-post"),
        lineas: [{ productoId: e.ids.agua, cantidad: 1 }],
      },
      new MemoryPrinter(),
      defaultConfig(),
    );
    // La bandera `vigente` sola no alcanza: acá se revive a mano lo que un bug o
    // una migración a medias podría dejar, y caja tiene que darse cuenta igual.
    e.db.prepare("UPDATE precuentas SET vigente = 1 WHERE id = ?").run(primera.precuentaId);

    await expect(enviarCuentaACaja(e.db, e.cuentaId, "2222", defaultConfig())).rejects.toMatchObject({
      codigo: "precuenta_desactualizada",
    });
    expect(e.db.prepare("SELECT count(*) AS c FROM caja_handoffs").get() as { c: number }).toEqual({ c: 0 });
    expect(obtenerCuenta(e.db, e.cuentaId).estado).toBe("abierta");
    e.db.close();
  });

  // La opción decide si hace falta una **primera** precuenta. Una precuenta que
  // quedó atrás frena en los dos casos: el cliente ya vio ese documento y cobrar
  // otro total en silencio es peor que pedir que se reemita. Sin este barrido, la
  // rama `obligatoria = false` cobraba callada un total que nadie mostró.
  for (const obligatoria of [true, false]) {
    for (const cambioPosterior of ["orden", "corrección"] as const) {
      it(`con obligatoria=${obligatoria}, una ${cambioPosterior} posterior deja la precuenta desactualizada`, async () => {
        const cfg: AppConfig = { ...defaultConfig(), precuenta_obligatoria_antes_de_caja: obligatoria };
        const e = await cuentaAbierta((ids) => [{ productoId: ids.jugo, cantidad: 2 }], cfg);
        await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), cfg);

        if (cambioPosterior === "orden") {
          await enviarOrden(
            e.db,
            {
              mesaId: e.ids.mesa7,
              empleadoId: 1,
              claveIdempotencia: clave("orden-post"),
              lineas: [{ productoId: e.ids.agua, cantidad: 1 }],
            },
            new MemoryPrinter(),
            cfg,
          );
        } else {
          await corregirOrden(
            e.db,
            { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 1)], claveIdempotencia: clave("corr"), pin: "1234" },
            new MemoryPrinter(),
            cfg,
          );
        }

        // Se llega acá sin tocar la base: el camino normal apaga `vigente`, y es
        // justo el caso que antes se reportaba como `precuenta_requerida` (o
        // pasaba de largo con la opción apagada).
        await expect(enviarCuentaACaja(e.db, e.cuentaId, "2222", cfg)).rejects.toMatchObject({
          codigo: "precuenta_desactualizada",
        });
        expect(e.db.prepare("SELECT count(*) AS c FROM caja_handoffs").get() as { c: number }).toEqual({ c: 0 });
        expect(obtenerCuenta(e.db, e.cuentaId).estado).toBe("abierta");

        // Y reemitir desbloquea en los dos casos.
        const alDia = await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), cfg);
        const { handoffId } = await enviarCuentaACaja(e.db, e.cuentaId, "2222", cfg);
        expect(
          (e.db.prepare("SELECT precuenta_id FROM caja_handoffs WHERE id = ?").get(handoffId) as {
            precuenta_id: number;
          }).precuenta_id,
        ).toBe(alDia.precuentaId);
        expect(obtenerCuenta(e.db, e.cuentaId).estado).toBe("en_caja");
        e.db.close();
      });
    }
  }

  it("`precuenta_requerida` queda para la cuenta que nunca emitió ninguna", async () => {
    const e = await cuentaAbierta((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);

    // Sin ninguna precuenta emitida no hay documento que comparar: el que falta
    // es el primero, y ese sí lo decide la configuración.
    await expect(enviarCuentaACaja(e.db, e.cuentaId, "2222", defaultConfig())).rejects.toMatchObject({
      codigo: "precuenta_requerida",
    });
    expect(e.db.prepare("SELECT count(*) AS c FROM precuentas").get() as { c: number }).toEqual({ c: 0 });
    e.db.close();
  });

  it("sin precuenta obligatoria cierra la cuenta y firma igual", async () => {
    const cfg: AppConfig = { ...AL_CAJA, precuenta_obligatoria_antes_de_caja: false };
    const e = await cuentaAbierta((ids) => [{ productoId: ids.jugo, cantidad: 2 }], cfg);

    const { handoffId } = await enviarCuentaACaja(e.db, e.cuentaId, "2222", cfg);

    const handoff = e.db.prepare("SELECT precuenta_id, snapshot_json FROM caja_handoffs WHERE id = ?").get(handoffId) as {
      precuenta_id: number | null;
      snapshot_json: string;
    };
    expect(handoff.precuenta_id).toBeNull();
    expect((JSON.parse(handoff.snapshot_json) as { totalCentavos: number }).totalCentavos).toBe(5000);
    expect(stock(e.db, e.ids.jugo)).toEqual({ onHand: 8, reserva: 0 });
    expect(obtenerCuenta(e.db, e.cuentaId).estado).toBe("en_caja");
    e.db.close();
  });

  it("con enviar_a_caja_requiere_avanzado apagado el básico también hace el handoff", async () => {
    const cfg: AppConfig = { ...defaultConfig(), enviar_a_caja_requiere_avanzado: false };
    const e = await cuentaAbierta((ids) => [{ productoId: ids.jugo, cantidad: 2 }], cfg);
    await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), cfg);

    // Es lo que la opción promete: el mesero básico cierra el servicio.
    const { handoffId } = await enviarCuentaACaja(e.db, e.cuentaId, "1234", cfg);

    expect(
      (e.db.prepare("SELECT mesero_id FROM caja_handoffs WHERE id = ?").get(handoffId) as { mesero_id: number })
        .mesero_id,
    ).toBe(1);
    expect(obtenerCuenta(e.db, e.cuentaId).estado).toBe("en_caja");
    e.db.close();
  });

  it("con la opción apagada el derecho mínimo sigue sin poder", async () => {
    const cfg: AppConfig = { ...defaultConfig(), enviar_a_caja_requiere_avanzado: false };
    const e = await cuentaAbierta((ids) => [{ productoId: ids.jugo, cantidad: 2 }], cfg);
    await crearEmpleado(e.db, { nombre: "Nuevo", pin: "9999", derecho: "minimo" });
    await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), cfg);

    // Apagar la opción baja el listón a quien emite la precuenta, no lo elimina.
    await expect(enviarCuentaACaja(e.db, e.cuentaId, "9999", cfg)).rejects.toMatchObject({ codigo: "sin_derecho" });
    expect(e.db.prepare("SELECT count(*) AS c FROM caja_handoffs").get() as { c: number }).toEqual({ c: 0 });
    e.db.close();
  });

  it("con la opción encendida el avanzado sigue siendo el único con PIN", async () => {
    const cfg: AppConfig = { ...defaultConfig(), enviar_a_caja_requiere_avanzado: true };
    const e = await cuentaAbierta((ids) => [{ productoId: ids.jugo, cantidad: 2 }], cfg);
    await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), cfg);

    await expect(enviarCuentaACaja(e.db, e.cuentaId, "1234", cfg)).rejects.toMatchObject({ codigo: "sin_derecho" });
    await enviarCuentaACaja(e.db, e.cuentaId, "2222", cfg);

    expect(obtenerCuenta(e.db, e.cuentaId).estado).toBe("en_caja");
    e.db.close();
  });

  it("firma cualquier reserva pendiente aunque la política ya no firme en caja", async () => {
    const e = await cuentaAbierta((ids) => [{ productoId: ids.jugo, cantidad: 2 }], AL_CAJA);
    await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), AL_CAJA);
    expect(stock(e.db, e.ids.jugo)).toEqual({ onHand: 10, reserva: 2 });

    // La política cambia con la cuenta viva. Estas dos unidades ya están
    // apartadas: si caja preguntara por la política de hoy, quedarían colgadas.
    await enviarCuentaACaja(e.db, e.cuentaId, "2222", AL_ENVIAR);

    expect(stock(e.db, e.ids.jugo)).toEqual({ onHand: 8, reserva: 0 });
    expect(pendienteDeFirmar(e.db, [e.ordenId])).toEqual([]);
    e.db.close();
  });

  it("con firme_al_precuenta caja firma solo lo que la precuenta dejó pendiente", async () => {
    const e = await cuentaAbierta((ids) => [{ productoId: ids.jugo, cantidad: 2 }], AL_PRECUENTA);
    await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), AL_PRECUENTA);
    expect(stock(e.db, e.ids.jugo)).toEqual({ onHand: 8, reserva: 0 });
    await corregirOrden(
      e.db,
      { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 3)], claveIdempotencia: clave("corr"), pin: "1234" },
      new MemoryPrinter(),
      AL_PRECUENTA,
    );
    expect(stock(e.db, e.ids.jugo)).toEqual({ onHand: 8, reserva: 1 });
    await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), AL_PRECUENTA);
    expect(stock(e.db, e.ids.jugo)).toEqual({ onHand: 7, reserva: 0 });

    await enviarCuentaACaja(e.db, e.cuentaId, "2222", AL_PRECUENTA);

    // La segunda precuenta ya firmó la unidad nueva: caja no descuenta de nuevo.
    expect(stock(e.db, e.ids.jugo)).toEqual({ onHand: 7, reserva: 0 });
    e.db.close();
  });

  it("con descuento_al_enviar el handoff no vuelve a tocar el stock", async () => {
    const e = await cuentaAbierta((ids) => [{ productoId: ids.jugo, cantidad: 2 }], AL_ENVIAR);
    await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), AL_ENVIAR);

    await enviarCuentaACaja(e.db, e.cuentaId, "2222", AL_ENVIAR);

    expect(stock(e.db, e.ids.jugo)).toEqual({ onHand: 8, reserva: 0 });
    e.db.close();
  });

  it("una cuenta en caja no acepta órdenes ni correcciones nuevas", async () => {
    const e = await cuentaAbierta((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    await emitirPrecuentaCuenta(e.db, e.cuentaId, "1234", new MemoryPrinter(), defaultConfig());
    await enviarCuentaACaja(e.db, e.cuentaId, "2222", defaultConfig());

    await expect(
      corregirOrden(
        e.db,
        { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 1)], claveIdempotencia: clave("corr"), pin: "1234" },
        new MemoryPrinter(),
        defaultConfig(),
      ),
    ).rejects.toMatchObject({ codigo: "cuenta_cerrada" });

    // La mesa quedó libre: una orden nueva abre otra cuenta, no revive la cerrada.
    const otra = await enviarOrden(
      e.db,
      {
        mesaId: e.ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: clave("orden-nueva"),
        lineas: [{ productoId: e.ids.agua, cantidad: 1 }],
      },
      new MemoryPrinter(),
      defaultConfig(),
    );
    expect(otra.cuentaId).not.toBe(e.cuentaId);
    e.db.close();
  });
});
