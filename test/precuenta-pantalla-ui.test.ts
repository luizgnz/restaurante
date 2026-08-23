import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrecuentaEnPantalla } from "../ui/src/pantallas/PrecuentaEnPantalla.tsx";

describe("precuenta en pantalla", () => {
  it("sale como papel blanco con valores por línea y total acumulado", () => {
    const html = renderToStaticMarkup(
      createElement(PrecuentaEnPantalla, {
        restaurante: "La Prueba",
        precuenta: {
          mesaNumero: 7,
          numero: 1,
          mesero: "Ana",
          lineas: [
            { nombre: "Hamburguesa", cantidad: 2, precioCentavos: 8900, nota: "sin cebolla" },
            { nombre: "Jugo", cantidad: 1, precioCentavos: 3500, nota: null },
          ],
          totalCentavos: 21300,
        },
        onCerrar: () => undefined,
      }),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("ticket-papel");
    expect(html).toContain("La Prueba");
    expect(html).toContain("PRECUENTA");
    expect(html).toContain("Mesa #7 · Precuenta #1");
    expect(html).toContain("Ana");
    expect(html).toContain("2 × Hamburguesa");
    expect(html).toContain("(sin cebolla)");
    expect(html).toContain("$17800");
    expect(html).toContain("1 × Jugo");
    expect(html).toContain("$3500");
    expect(html).toContain("TOTAL");
    expect(html).toContain("$21300");
    expect(html).toContain("Listo");
  });
});
