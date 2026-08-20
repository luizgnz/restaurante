import { describe, expect, it } from "vitest";
import { available, availableToAssemble } from "../src/modules/inventario/cifras.ts";

describe("cifras", () => {
  it("disponible = a mano - reservado", () => {
    expect(available(10, 3)).toBe(7);
    expect(available(2, 2)).toBe(0);
  });

  it("armable hamburguesa es el mínimo de componentes", () => {
    const n = availableToAssemble([
      { cantidadReceta: 1, disponible: 10 },
      { cantidadReceta: 150, disponible: 750 },
      { cantidadReceta: 1, disponible: 8 },
      { cantidadReceta: 20, disponible: 200 },
    ]);
    expect(n).toBe(5);
  });

  it("receta vacía no limita", () => {
    expect(availableToAssemble([])).toBe(Number.POSITIVE_INFINITY);
  });
});
