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

  it("Auto reduce columnas en un lienzo estrecho y deja espacio entre mesas", () => {
    for (const cantidad of [10, 24]) {
      const ancho = 280;
      const mesas = ordenarMesas(Array.from({ length: cantidad }, (_, i) => ({ numero: i + 1 })), ancho);
      const columnas = columnasPara(cantidad, ancho);
      const alto = Math.max(560, 40 + Math.ceil(cantidad / columnas) * 120);
      expect(columnas).toBe(2);
      const rects = mesas.map((m) => ({
        x: m.pos_x / 100 * ancho, y: m.pos_y / 100 * alto,
        ancho: m.ancho, alto: m.alto,
      }));
      for (const [i, rect] of rects.entries()) {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.ancho).toBeLessThanOrEqual(ancho - 8);
        expect(rect.y + rect.alto).toBeLessThanOrEqual(alto - 8);
        expect(rects.every((other, j) => i === j ||
          rect.x + rect.ancho <= other.x || other.x + other.ancho <= rect.x ||
          rect.y + rect.alto <= other.y || other.y + other.alto <= rect.y)).toBe(true);
      }
    }
  });
});
