import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComandaEnPantalla } from "../ui/src/pantallas/ComandaEnPantalla.tsx";

describe("comanda en pantalla", () => {
  it("sale como papel blanco con el nombre del local, sin valores", () => {
    const html = renderToStaticMarkup(
      createElement(ComandaEnPantalla, {
        restaurante: "La Prueba",
        comanda: {
          mesaNumero: 7,
          ordenNumero: 2,
          mesero: "Ana",
          indicaciones: "primero las bebidas",
          lineas: [
            { nombre: "Hamburguesa", cantidad: 2, nota: "sin cebolla" },
            { nombre: "Jugo", cantidad: 1, nota: null },
          ],
        },
        onCerrar: () => undefined,
      }),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("ticket-papel");
    expect(html).toContain("La Prueba");
    expect(html).toContain("COMANDA");
    expect(html).toContain("Mesa #7 · Orden #2");
    expect(html).toContain("Ana");
    expect(html).toContain("2 × Hamburguesa");
    expect(html).toContain("(sin cebolla)");
    expect(html).toContain("1 × Jugo");
    expect(html).toContain("primero las bebidas");
    expect(html).toContain("Listo");
    // La comanda no muestra precios.
    expect(html).not.toContain("$");
    expect(html).not.toContain("TOTAL");
  });

  it("sin mesa ni indicaciones no inventa datos", () => {
    const html = renderToStaticMarkup(
      createElement(ComandaEnPantalla, {
        restaurante: "La Prueba",
        comanda: {
          mesaNumero: null,
          ordenNumero: 1,
          mesero: "Ana",
          indicaciones: null,
          lineas: [{ nombre: "Jugo", cantidad: 1, nota: null }],
        },
        onCerrar: () => undefined,
      }),
    );

    expect(html).toContain("Sin mesa · Orden #1");
    expect(html).not.toContain("ticket-papel__indicaciones");
  });
});
