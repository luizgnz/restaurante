import { describe, expect, it } from "vitest";
import { totalEfectivoCuenta } from "../src/modules/cuentas/totales.ts";
import { configurarSlots, crearGrupo, crearVariante } from "../src/modules/contornos/contornos.ts";
import { enviarOrden, OrdenError } from "../src/modules/ordenes/enviar.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { defaultConfig } from "../src/config.ts";
import { codigoDe, crearOrden, entornoApi, post } from "./helpers.ts";

async function escenario() {
  const db = (await entornoApi()).db;
  const ids = seedCartaDemo(db);
  const proteina = crearGrupo(db, { nombre: "Proteína" });
  const carbohidrato = crearGrupo(db, { nombre: "Carbohidrato" });
  const ensalada = crearGrupo(db, { nombre: "Ensalada" });
  const pollo = crearVariante(db, { grupoId: proteina.id, nombre: "Pollo", extraCentavos: 1500 });
  const carne = crearVariante(db, { grupoId: proteina.id, nombre: "Carne", suplementoCentavos: 500, extraCentavos: 2000 });
  const papas = crearVariante(db, { grupoId: carbohidrato.id, nombre: "Papas fritas" });
  const rusa = crearVariante(db, { grupoId: ensalada.id, nombre: "Ensalada rusa" });
  configurarSlots(db, ids.hamburguesa, [
    { posicion: 1, nombre: "Proteína", permiteExtra: true, grupoIds: [proteina.id] },
    { posicion: 2, nombre: "Contorno", grupoIds: [carbohidrato.id] },
    { posicion: 3, nombre: "Segundo contorno", grupoIds: [carbohidrato.id, ensalada.id] },
  ]);
  return { db, ids, pollo, carne, papas, rusa };
}

const CONFIG = defaultConfig();

describe("envío de órdenes con contornos", () => {
  it("guarda las selecciones como snapshot y cobra suplemento y extra", async () => {
    const e = await escenario();
    const envio = await enviarOrden(
      e.db,
      {
        mesaId: e.ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: "contornos-1",
        lineas: [
          {
            productoId: e.ids.hamburguesa,
            cantidad: 2,
            contornos: [
              { slotPosicion: 1, varianteId: e.carne.id },
              { slotPosicion: 2, varianteId: e.papas.id },
              { slotPosicion: 3, varianteId: e.rusa.id },
              { slotPosicion: 1, varianteId: e.pollo.id },
            ],
          },
        ],
      },
      new MemoryPrinter(),
      CONFIG,
    );

    const filas = e.db
      .prepare("SELECT slot_posicion, variante_nombre, precio_centavos, orden_extra FROM orden_linea_contornos ORDER BY id")
      .all() as Array<{ slot_posicion: number; variante_nombre: string; precio_centavos: number; orden_extra: number }>;
    expect(filas).toEqual([
      { slot_posicion: 1, variante_nombre: "Carne", precio_centavos: 500, orden_extra: 0 },
      { slot_posicion: 1, variante_nombre: "Pollo", precio_centavos: 1500, orden_extra: 1 },
      { slot_posicion: 2, variante_nombre: "Papas fritas", precio_centavos: 0, orden_extra: 0 },
      { slot_posicion: 3, variante_nombre: "Ensalada rusa", precio_centavos: 0, orden_extra: 0 },
    ]);

    // 8900 + 500 (suplemento carne) + 1500 (extra pollo) por unidad, × 2.
    expect(totalEfectivoCuenta(e.db, envio.cuentaId)).toBe((8900 + 500 + 1500) * 2);
    e.db.close();
  });

  it("rechaza un plato configurable sin contornos", async () => {
    const e = await escenario();
    await expect(
      enviarOrden(
        e.db,
        {
          mesaId: e.ids.mesa7,
          empleadoId: 1,
          claveIdempotencia: "contornos-2",
          lineas: [{ productoId: e.ids.hamburguesa, cantidad: 1 }],
        },
        new MemoryPrinter(),
        CONFIG,
      ),
    ).rejects.toMatchObject({ codigo: "contornos_incompletos" });
    e.db.close();
  });

  it("rechaza contornos para un plato sin slots", async () => {
    const e = await escenario();
    await expect(
      enviarOrden(
        e.db,
        {
          mesaId: e.ids.mesa7,
          empleadoId: 1,
          claveIdempotencia: "contornos-3",
          lineas: [
            { productoId: e.ids.jugo, cantidad: 1, contornos: [{ slotPosicion: 1, varianteId: e.pollo.id }] },
          ],
        },
        new MemoryPrinter(),
        CONFIG,
      ),
    ).rejects.toMatchObject({ codigo: "slot_inexistente" });
    e.db.close();
  });

  it("un reintento idempotente no duplica los contornos", async () => {
    const e = await escenario();
    const linea = {
      productoId: e.ids.hamburguesa,
      cantidad: 1,
      contornos: [
        { slotPosicion: 1, varianteId: e.pollo.id },
        { slotPosicion: 2, varianteId: e.papas.id },
        { slotPosicion: 3, varianteId: e.rusa.id },
      ],
    };
    const primero = await enviarOrden(
      e.db,
      { mesaId: e.ids.mesa7, empleadoId: 1, claveIdempotencia: "contornos-4", lineas: [linea] },
      new MemoryPrinter(),
      CONFIG,
    );
    const segundo = await enviarOrden(
      e.db,
      { mesaId: e.ids.mesa7, empleadoId: 1, claveIdempotencia: "contornos-4", lineas: [linea] },
      new MemoryPrinter(),
      CONFIG,
    );
    expect(segundo.ordenId).toBe(primero.ordenId);
    expect(segundo.repetida).toBe(true);
    const n = e.db.prepare("SELECT count(*) AS c FROM orden_linea_contornos").get() as { c: number };
    expect(n.c).toBe(3);
    e.db.close();
  });

  it("por API valida igual que el módulo", async () => {
    const e = await entornoApi();
    const ids = e.ids;
    const proteina = (await (await post(e.app, "/api/contornos/grupos", { nombre: "Proteína" })).json()) as { id: number };
    const pollo = (await (
      await post(e.app, "/api/contornos/variantes", { grupoId: proteina.id, nombre: "Pollo" })
    ).json()) as { id: number };
    configurarSlots(e.db, ids.hamburguesa, [
      { posicion: 1, nombre: "Proteína", grupoIds: [proteina.id] },
      { posicion: 2, nombre: "Contorno", grupoIds: [proteina.id] },
    ]);

    const incompleta = await post(e.app, "/api/ordenes", {
      mesaId: ids.mesa7,
      claveIdempotencia: "api-contornos-1",
      pin: "1234",
      lineas: [
        { productoId: ids.hamburguesa, cantidad: 1, contornos: [{ slotPosicion: 1, varianteId: pollo.id }] },
      ],
    });
    expect(incompleta.status).toBe(400);
    expect(await codigoDe(incompleta)).toBe("contornos_incompletos");
    e.db.close();
  });
});
