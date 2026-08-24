import { describe, expect, it } from "vitest";
import { codigoDe, crearOrden, entornoApi, post, verCuenta } from "./helpers.ts";

type Tarjeta = {
  id: number;
  tipo: string;
  lineas: Array<{ id: number; nombre: string; etapa: string }>;
  incidencias: Array<{
    id: number;
    tipo: string;
    alcance: string;
    estado: string;
    motivo: string;
    propuesta: string | null;
  }>;
};

async function tarjetas(app: Awaited<ReturnType<typeof entornoApi>>["app"]): Promise<Tarjeta[]> {
  return ((await (await app.request("/api/kds")).json()) as { tarjetas: Tarjeta[] }).tarjetas;
}

describe("coordinación Cocina ↔ Mesero", () => {
  it("bloquea la preparación hasta que el mesero acepta la sugerencia", async () => {
    const e = await entornoApi();
    expect((await e.app.request("/api/cocina/incidencias")).status).toBe(403);
    await post(e.app, "/api/sesion/abrir", { usuario: "admin", password: "admin" });
    const orden = await crearOrden(e);
    const tarjeta = (await tarjetas(e.app)).find((item) => item.tipo === "orden")!;
    const linea = tarjeta.lineas[0];

    const creada = await post(e.app, "/api/cocina/incidencias", {
      comandaId: tarjeta.id,
      comandaLineaId: linea.id,
      tipo: "sugerencia",
      alcance: "linea",
      motivo: "No queda cebolla morada",
      propuesta: "Usar cebolla blanca",
    });
    expect(creada.status).toBe(201);
    const incidencia = (await creada.json()) as { id: number };

    const bloqueada = await post(e.app, `/api/kds/lineas/${linea.id}/etapa`, { etapa: "en_proceso" });
    expect(bloqueada.status).toBe(409);
    expect(await codigoDe(bloqueada)).toBe("incidencia_pendiente");

    const pendientes = (await (await e.app.request("/api/cocina/incidencias")).json()) as {
      incidencias: Array<{ id: number; mesa: number; ordenNumero: number; producto: string }>;
    };
    expect(pendientes.incidencias).toEqual([
      expect.objectContaining({ id: incidencia.id, mesa: 7, ordenNumero: 1, producto: "Hamburguesa" }),
    ]);

    expect((await post(e.app, `/api/cocina/incidencias/${incidencia.id}/aceptar`)).status).toBe(200);
    expect(((await tarjetas(e.app)).find((item) => item.id === tarjeta.id)!).incidencias).toEqual([
      expect.objectContaining({ estado: "aceptada", propuesta: "Usar cebolla blanca" }),
    ]);
    expect((await post(e.app, `/api/kds/lineas/${linea.id}/etapa`, { etapa: "en_proceso" })).status).toBe(200);
    e.db.close();
  });

  it("si el cliente no acepta, elimina solo el producto y avisa a cocina", async () => {
    const e = await entornoApi();
    await post(e.app, "/api/sesion/abrir", { usuario: "admin", password: "admin" });
    const orden = await crearOrden(e, {
      lineas: [
        { productoId: e.ids.hamburguesa, cantidad: 1 },
        { productoId: e.ids.jugo, cantidad: 2 },
      ],
    });
    const tarjeta = (await tarjetas(e.app)).find((item) => item.tipo === "orden")!;
    const hamburguesa = tarjeta.lineas.find((linea) => linea.nombre === "Hamburguesa")!;
    const creada = await post(e.app, "/api/cocina/incidencias", {
      comandaId: tarjeta.id,
      comandaLineaId: hamburguesa.id,
      tipo: "sugerencia",
      alcance: "linea",
      motivo: "No queda pan",
      propuesta: "Cambiar por ensalada",
    });
    const incidencia = (await creada.json()) as { id: number };

    const sinPin = await post(e.app, `/api/cocina/incidencias/${incidencia.id}/eliminar`, { pin: "0000" });
    expect(sinPin.status).toBe(403);

    const eliminada = await post(e.app, `/api/cocina/incidencias/${incidencia.id}/eliminar`, { pin: "1234" });
    expect(eliminada.status).toBe(200);
    const cuenta = await verCuenta(e.app, orden.cuentaId);
    expect(cuenta.ordenes[0].lineas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nombre: "Hamburguesa", cantidad: 0 }),
        expect.objectContaining({ nombre: "Jugo", cantidad: 2 }),
      ]),
    );
    expect(
      (e.db.prepare("SELECT etapa FROM comanda_lineas WHERE id = ?").get(hamburguesa.id) as { etapa: string }).etapa,
    ).toBe("cancelado");
    e.db.close();
  });

  it("permite rechazar la orden completa solo antes de iniciar la preparación", async () => {
    const e = await entornoApi();
    await post(e.app, "/api/sesion/abrir", { usuario: "admin", password: "admin" });
    await crearOrden(e);
    const tarjeta = (await tarjetas(e.app)).find((item) => item.tipo === "orden")!;

    const creada = await post(e.app, "/api/cocina/incidencias", {
      comandaId: tarjeta.id,
      tipo: "rechazo",
      alcance: "orden",
      motivo: "Falla del equipo de cocina",
    });
    expect(creada.status).toBe(201);
    expect(await creada.json()).toMatchObject({ tipo: "rechazo", alcance: "orden", propuesta: null });

    const duplicada = await post(e.app, "/api/cocina/incidencias", {
      comandaId: tarjeta.id,
      tipo: "rechazo",
      alcance: "orden",
      motivo: "Segundo rechazo",
    });
    expect(duplicada.status).toBe(409);
    expect(await codigoDe(duplicada)).toBe("incidencia_pendiente");
    e.db.close();
  });
});
