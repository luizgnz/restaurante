import { describe, expect, it } from "vitest";
import { codigoDe, entornoApi, post } from "./helpers.ts";

async function abrirSalon(e: Awaited<ReturnType<typeof entornoApi>>) {
  const res = await post(e.app, "/api/sesion/abrir", { usuario: "admin", password: "admin" });
  expect(res.status).toBe(200);
}

describe("API de inventario", () => {
  it("permite consultar materiales a cualquier usuario del salón", async () => {
    const e = await entornoApi();
    expect((await e.app.request("/api/inventario")).status).toBe(403);

    await abrirSalon(e);
    const res = await e.app.request("/api/inventario");
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      materiales: Array<{ id: number; nombre: string; enMano: number; reservado: number; disponible: number }>;
    };
    expect(data.materiales).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: e.ids.pan, nombre: "Pan", enMano: 20, reservado: 0, disponible: 20 }),
        expect.objectContaining({ id: e.ids.jugo, nombre: "Jugo", enMano: 10, reservado: 0, disponible: 10 }),
      ]),
    );
    e.db.close();
  });

  it("solo un PIN avanzado registra entradas y deja historial", async () => {
    const e = await entornoApi();
    await abrirSalon(e);

    const basico = await post(e.app, `/api/inventario/${e.ids.pan}/entradas`, { cantidad: 5, pin: "1234" });
    expect(basico.status).toBe(403);
    expect(await codigoDe(basico)).toBe("sin_derecho");
    expect(
      (e.db.prepare("SELECT on_hand_real FROM stock WHERE producto_id = ?").get(e.ids.pan) as { on_hand_real: number })
        .on_hand_real,
    ).toBe(20);

    const avanzado = await post(e.app, `/api/inventario/${e.ids.pan}/entradas`, { cantidad: 2.5, pin: "2222" });
    expect(avanzado.status).toBe(201);
    expect(await avanzado.json()).toMatchObject({
      material: { id: e.ids.pan, enMano: 22.5, reservado: 0, disponible: 22.5 },
    });
    expect(
      e.db
        .prepare(
          "SELECT cantidad_real, stock_anterior_real, stock_nuevo_real FROM inventario_movimientos WHERE producto_id = ?",
        )
        .get(e.ids.pan),
    ).toEqual({ cantidad_real: 2.5, stock_anterior_real: 20, stock_nuevo_real: 22.5 });
    e.db.close();
  });

  it("rechaza cantidades inválidas sin modificar existencias", async () => {
    const e = await entornoApi();
    await abrirSalon(e);
    for (const cantidad of [0, -1, 1_000_001]) {
      const res = await post(e.app, `/api/inventario/${e.ids.jugo}/entradas`, { cantidad, pin: "2222" });
      expect(res.status).toBe(400);
      expect(await codigoDe(res)).toBe("cantidad_invalida");
    }
    expect(
      (e.db.prepare("SELECT on_hand_real FROM stock WHERE producto_id = ?").get(e.ids.jugo) as { on_hand_real: number })
        .on_hand_real,
    ).toBe(10);
    expect((e.db.prepare("SELECT count(*) AS c FROM inventario_movimientos").get() as { c: number }).c).toBe(0);
    e.db.close();
  });

  it("registra una pérdida con motivo y descuenta la existencia física", async () => {
    const e = await entornoApi();
    await abrirSalon(e);

    const res = await post(e.app, `/api/inventario/${e.ids.pan}/perdidas`, {
      cantidad: 2.5,
      motivo: "producto_danado",
      pin: "2222",
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      material: { id: e.ids.pan, enMano: 17.5, reservado: 0, disponible: 17.5 },
    });
    expect(
      e.db
        .prepare(
          `SELECT tipo, cantidad_real, stock_anterior_real, stock_nuevo_real, motivo
           FROM inventario_movimientos WHERE producto_id = ?`,
        )
        .get(e.ids.pan),
    ).toEqual({
      tipo: "perdida",
      cantidad_real: 2.5,
      stock_anterior_real: 20,
      stock_nuevo_real: 17.5,
      motivo: "producto_danado",
    });
    e.db.close();
  });

  it("protege las pérdidas con PIN y no permite descontar más de lo existente", async () => {
    const e = await entornoApi();
    await abrirSalon(e);

    const basico = await post(e.app, `/api/inventario/${e.ids.jugo}/perdidas`, {
      cantidad: 1,
      motivo: "consumo_interno",
      pin: "1234",
    });
    expect(basico.status).toBe(403);
    expect(await codigoDe(basico)).toBe("sin_derecho");

    const excesiva = await post(e.app, `/api/inventario/${e.ids.jugo}/perdidas`, {
      cantidad: 11,
      motivo: "consumo_interno",
      pin: "2222",
    });
    expect(excesiva.status).toBe(409);
    expect(await codigoDe(excesiva)).toBe("stock_insuficiente");
    expect(
      (e.db.prepare("SELECT on_hand_real FROM stock WHERE producto_id = ?").get(e.ids.jugo) as { on_hand_real: number })
        .on_hand_real,
    ).toBe(10);
    expect((e.db.prepare("SELECT count(*) AS c FROM inventario_movimientos").get() as { c: number }).c).toBe(0);
    e.db.close();
  });

  it("rechaza un motivo de pérdida que no esté tipificado", async () => {
    const e = await entornoApi();
    await abrirSalon(e);
    const res = await post(e.app, `/api/inventario/${e.ids.jugo}/perdidas`, {
      cantidad: 1,
      motivo: "otro",
      pin: "2222",
    });
    expect(res.status).toBe(400);
    expect(await codigoDe(res)).toBe("motivo_invalido");
    e.db.close();
  });
});
