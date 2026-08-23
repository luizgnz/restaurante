import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { createApp } from "../src/http/app.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { codigoDe, entornoApi, post } from "./helpers.ts";

async function crearBase() {
  const e = await entornoApi();
  return e;
}

describe("API de contornos", () => {
  it("crea grupos y variantes y los lista agrupados", async () => {
    const e = await crearBase();

    const grupo = await post(e.app, "/api/contornos/grupos", { nombre: "Proteína" });
    expect(grupo.status).toBe(201);
    const { id: grupoId } = (await grupo.json()) as { id: number };

    const variante = await post(e.app, "/api/contornos/variantes", {
      grupoId,
      nombre: "Pollo",
      suplementoCentavos: 0,
      extraCentavos: 1500,
    });
    expect(variante.status).toBe(201);

    const listado = (await (await e.app.request("/api/contornos")).json()) as {
      grupos: { id: number; nombre: string; variantes: { nombre: string; extraCentavos: number }[] }[];
    };
    const proteina = listado.grupos.find((g) => g.nombre === "Proteína");
    expect(proteina?.variantes.map((v) => ({ nombre: v.nombre, extraCentavos: v.extraCentavos }))).toEqual([
      { nombre: "Pollo", extraCentavos: 1500 },
    ]);
    e.db.close();
  });

  it("rechaza duplicados con 400 y código de dominio", async () => {
    const e = await crearBase();
    await post(e.app, "/api/contornos/grupos", { nombre: "Proteína" });
    const duplicado = await post(e.app, "/api/contornos/grupos", { nombre: "proteína" });
    expect(duplicado.status).toBe(400);
    expect(await codigoDe(duplicado)).toBe("grupo_duplicado");

    const { id: grupoId } = (await (await post(e.app, "/api/contornos/grupos", { nombre: "Carbohidrato" })).json()) as {
      id: number;
    };
    await post(e.app, "/api/contornos/variantes", { grupoId, nombre: "Arroz" });
    const varianteDup = await post(e.app, "/api/contornos/variantes", { grupoId, nombre: "arroz" });
    expect(varianteDup.status).toBe(400);
    expect(await codigoDe(varianteDup)).toBe("variante_duplicada");
    e.db.close();
  });

  it("valida cuerpos inválidos sin tocar la base", async () => {
    const e = await crearBase();
    const sinNombre = await post(e.app, "/api/contornos/grupos", { nombre: "   " });
    expect(sinNombre.status).toBe(400);
    const varianteSinGrupo = await post(e.app, "/api/contornos/variantes", { nombre: "Pollo" });
    expect(varianteSinGrupo.status).toBe(400);
    expect((e.db.prepare("SELECT count(*) AS c FROM contorno_grupos").get() as { c: number }).c).toBe(0);
    e.db.close();
  });

  it("configura y lee los slots de un plato", async () => {
    const e = await crearBase();
    const proteina = (await (await post(e.app, "/api/contornos/grupos", { nombre: "Proteína" })).json()) as { id: number };
    const carbohidrato = (await (await post(e.app, "/api/contornos/grupos", { nombre: "Carbohidrato" })).json()) as {
      id: number;
    };

    const put = await e.app.request(`/api/productos/${e.ids.hamburguesa}/slots`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slots: [
          { posicion: 1, nombre: "Proteína", permiteExtra: true, grupoIds: [proteina.id] },
          { posicion: 2, nombre: "Contorno", grupoIds: [carbohidrato.id] },
        ],
      }),
    });
    expect(put.status).toBe(200);

    const get = await e.app.request(`/api/productos/${e.ids.hamburguesa}/slots`);
    const body = (await get.json()) as { slots: { posicion: number; nombre: string; permiteExtra: boolean }[] };
    expect(body.slots.map((s) => s.posicion)).toEqual([1, 2]);
    expect(body.slots[0].permiteExtra).toBe(true);

    // Un plato sin configurar no tiene slots.
    const vacio = (await (await e.app.request(`/api/productos/${e.ids.jugo}/slots`)).json()) as { slots: unknown[] };
    expect(vacio.slots).toEqual([]);
    e.db.close();
  });
});
