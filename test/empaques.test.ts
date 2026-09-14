import { describe, expect, it } from "vitest";
import { cantidadEmpaquesSugerida, type ProductoCarta } from "../ui/src/pantallas/ConstructorOrden.tsx";
import { defaultConfig, normalizarConfig } from "../src/config.ts";

const productos: ProductoCarta[] = [
  { id: 1, nombre: "Arroz con pollo", precio_centavos: 8500, armable: 0, categoria_nombre: "Platos completos" },
  { id: 2, nombre: "Papas fritas", precio_centavos: 3000, armable: 0, categoria_nombre: "Porciones" },
  { id: 3, nombre: "Coca-Cola", precio_centavos: 2000, armable: 0, categoria_nombre: "Bebidas" },
  { id: 4, nombre: "Empaque", precio_centavos: 500, armable: 0, categoria_nombre: "Extras", codigo: "menu-real:extras:empaque" },
];

describe("sugerencia de empaques", () => {
  it("cuenta cada plato y porción, pero excluye bebidas y el empaque", () => {
    expect(cantidadEmpaquesSugerida(productos, [
      { productoId: 1, cantidad: 2 },
      { productoId: 2, cantidad: 1 },
      { productoId: 3, cantidad: 4 },
      { productoId: 4, cantidad: 2 },
    ])).toBe(3);
  });

  it("queda habilitada por defecto y conserva una desactivación explícita", () => {
    expect(defaultConfig().sugerir_empaque_para_llevar).toBe(true);
    expect(normalizarConfig({ ...defaultConfig(), sugerir_empaque_para_llevar: false }).sugerir_empaque_para_llevar).toBe(false);
  });
});
