import { describe, expect, it } from "vitest";
import { MESA_LADO, columnasPara, ordenarMesas } from "../src/modules/salon/orden.ts";

describe("ordenar mesas", () => {
  it("deja todas cuadradas, del mismo lado y en cuadrícula por número", () => {
    const mesas = ordenarMesas([
      { numero: 3, ancho: 150, alto: 88, forma: "round" },
      { numero: 1, ancho: 84, alto: 84, forma: "round" },
      { numero: 2, ancho: 92, alto: 92, forma: "square" },
      { numero: 4, ancho: 120, alto: 60, forma: "square" },
    ]);
    expect(mesas.map((m) => m.numero)).toEqual([1, 2, 3, 4]);
    for (const m of mesas) {
      expect(m.forma).toBe("square");
      expect(m.ancho).toBe(MESA_LADO);
      expect(m.alto).toBe(MESA_LADO);
    }
    expect(mesas[0].pos_y).toBe(mesas[1].pos_y);
    expect(mesas[0].pos_x).toBeLessThan(mesas[1].pos_x);
    expect(mesas[2].pos_y).toBeGreaterThan(mesas[0].pos_y);
    expect(mesas[2].pos_x).toBe(mesas[0].pos_x);
  });

  it("no saca ninguna mesa del mapa", () => {
    const mesas = ordenarMesas(Array.from({ length: 24 }, (_, i) => ({ numero: i + 1 })));
    expect(columnasPara(24)).toBe(5);
    for (const m of mesas) {
      expect(m.pos_x).toBeGreaterThanOrEqual(0);
      expect(m.pos_x).toBeLessThanOrEqual(90);
      expect(m.pos_y).toBeGreaterThanOrEqual(0);
      expect(m.pos_y).toBeLessThanOrEqual(90);
    }
    const claves = new Set(mesas.map((m) => `${m.pos_x}:${m.pos_y}`));
    expect(claves.size).toBe(24);
  });
});
