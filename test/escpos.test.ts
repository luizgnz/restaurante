import { describe, expect, it } from "vitest";
import { renderComanda, renderPrecuenta } from "../src/print/escpos.ts";

describe("escpos", () => {
  it("comanda incluye mesa y mesero", () => {
    const bytes = renderComanda({
      mesaNumero: 7,
      mesero: "Ana",
      lineas: [{ nombre: "Hamburguesa", cantidad: 5 }],
    });
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("Mesa 7");
    expect(text).toContain("Ana");
    expect(text).toContain("Hamburguesa");
  });

  it("precuenta aclara que no es boleta", () => {
    const text = new TextDecoder().decode(
      renderPrecuenta({
        mesaNumero: 7,
        mesero: "Ana",
        cubiertos: 4,
        lineas: [{ nombre: "Hamburguesa", cantidad: 5, precio_centavos: 8900 }],
        totalCentavos: 44500,
      }),
    );
    expect(text).toMatch(/no es boleta/i);
  });
});
