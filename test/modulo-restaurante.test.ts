import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { createApp } from "../src/http/app.ts";
import { crearProducto } from "../src/modules/productos/productos.ts";
import { guardarPlano } from "../src/modules/salon/salon.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { openTestDb } from "./helpers.ts";

describe("módulo restaurante", () => {
  it("crea un producto de carta y queda en /api/carta", async () => {
    const db = openTestDb();
    seedCartaDemo(db);
    const cat = db.prepare("SELECT id FROM categorias_pos WHERE nombre = 'Principales'").get() as { id: number };
    const creado = crearProducto(db, {
      nombre: "Completo",
      precio_centavos: 4500,
      categoria_id: cat.id,
      tipo_consumo: "no_almacenable",
      disponible_en_pos: true,
      rastrear_inventario: true,
      codigo: "COM-1",
      color: "#aa3344",
    });
    expect(creado.id).toBeGreaterThan(0);
    const fila = db.prepare("SELECT codigo, color, rastrear_inventario, tipo_consumo FROM productos WHERE id = ?").get(creado.id) as {
      codigo: string;
      color: string;
      rastrear_inventario: number;
      tipo_consumo: string;
    };
    expect(fila.codigo).toBe("COM-1");
    expect(fila.color).toBe("#aa3344");
    expect(fila.rastrear_inventario).toBe(1);
    expect(fila.tipo_consumo).toBe("almacenable_unitario");
    expect(db.prepare("SELECT producto_id FROM stock WHERE producto_id = ?").get(creado.id)).toBeTruthy();
    const app = createApp({ db, config: defaultConfig(), printer: new MemoryPrinter() });
    const carta = await app.request("/api/carta");
    const body = (await carta.json()) as { productos: { nombre: string }[] };
    expect(body.productos.some((p) => p.nombre === "Completo")).toBe(true);
    db.close();
  });

  it("guarda un piso nuevo y una mesa en el plano", () => {
    const db = openTestDb();
    seedCartaDemo(db);
    const salon = db.prepare("SELECT id FROM pisos WHERE nombre = 'Salón'").get() as { id: number };
    const out = guardarPlano(db, {
      pisos: [
        {
          id: salon.id,
          nombre: "Salón",
          mesas: [
            {
              numero: 21,
              asientos: 2,
              pos_x: 10,
              pos_y: 20,
              forma: "round",
              ancho: 80,
              alto: 80,
            },
          ],
        },
        { nombre: "Terraza", mesas: [] },
      ],
    });
    expect(out.pisos.some((p) => p.nombre === "Terraza")).toBe(true);
    const mesa = db.prepare("SELECT numero, forma FROM mesas WHERE numero = 21").get() as { numero: number; forma: string };
    expect(mesa.forma).toBe("round");
    db.close();
  });

  it("no permite dos pisos con el mismo nombre ni dos mesas con el mismo número", () => {
    const db = openTestDb();
    seedCartaDemo(db);
    const salon = db.prepare("SELECT id FROM pisos WHERE nombre = 'Salón'").get() as { id: number };
    expect(() =>
      guardarPlano(db, {
        pisos: [
          { id: salon.id, nombre: "Salón", mesas: [] },
          { nombre: "salón", mesas: [] },
        ],
      }),
    ).toThrow(/Ya hay un piso llamado/);
    expect(() =>
      guardarPlano(db, {
        pisos: [
          {
            id: salon.id,
            nombre: "Salón",
            mesas: [
              { numero: 1, asientos: 2, pos_x: 10, pos_y: 10, forma: "round", ancho: 80, alto: 80 },
              { numero: 1, asientos: 4, pos_x: 20, pos_y: 20, forma: "square", ancho: 80, alto: 80 },
            ],
          },
        ],
      }),
    ).toThrow(/La mesa 1 ya existe/);
    db.close();
  });
});
