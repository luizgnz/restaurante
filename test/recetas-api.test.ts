import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { createApp } from "../src/http/app.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { openTestDb } from "./helpers.ts";

describe("editor de recetas", () => {
  it("crea una receta y permite editar posteriormente ingredientes y cantidades", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    const app = createApp({ db, config: defaultConfig(), printer: new MemoryPrinter() });

    const creada = await app.request("/api/productos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nombre: "Sándwich prueba",
        precio_centavos: 5000,
        categoria_id: 1,
        tipo_consumo: "receta_kit",
        disponible_en_pos: true,
        receta: [{ ingredienteId: ids.pan, cantidad: 2 }, { ingredienteId: ids.queso, cantidad: 1 }],
      }),
    });
    expect(creada.status).toBe(201);
    const productoId = ((await creada.json()) as { id: number }).id;

    const actualizada = await app.request(`/api/productos/${productoId}/receta`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ receta: [{ ingredienteId: ids.pan, cantidad: 3 }, { ingredienteId: ids.carne, cantidad: 120 }] }),
    });
    expect(actualizada.status).toBe(200);
    expect(((await actualizada.json()) as { receta: unknown[] }).receta).toEqual([
      expect.objectContaining({ ingredienteId: ids.pan, cantidad: 3, nombre: "Pan" }),
      expect.objectContaining({ ingredienteId: ids.carne, cantidad: 120, nombre: "Carne g" }),
    ]);
    db.close();
  });

  it("rechaza recetas vacías sin dejar un producto incompleto", async () => {
    const db = openTestDb();
    seedCartaDemo(db);
    const app = createApp({ db, config: defaultConfig(), printer: new MemoryPrinter() });
    const respuesta = await app.request("/api/productos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre: "Receta incompleta", precio_centavos: 1000, categoria_id: 1, tipo_consumo: "receta_kit", disponible_en_pos: true, receta: [] }),
    });
    expect(respuesta.status).toBe(400);
    expect(db.prepare("SELECT id FROM productos WHERE nombre = 'Receta incompleta'").get()).toBeUndefined();
    db.close();
  });
});
