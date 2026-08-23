import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConstructorOrden } from "../ui/src/pantallas/ConstructorOrden.tsx";

describe("ticket del pedido", () => {
  it("permite cambiar cantidades solo dentro del constructor activo", () => {
    const html = renderToStaticMarkup(
      createElement(ConstructorOrden, {
        productos: [{ id: 1, nombre: "Hamburguesa", precio_centavos: 8900, armable: 8 }],
        mesaFija: { id: 1, numero: 1 },
        borrador: {
          version: 1,
          mesaId: 1,
          claveIdempotencia: "ticket-1",
          lineas: [{ productoId: 1, cantidad: 2, nota: "" }],
          indicaciones: "",
          actualizadoEn: "2026-08-22T12:00:00.000Z",
        },
        onCambiar: () => undefined,
        onEnviar: async () => undefined,
        onCancelar: () => undefined,
      }),
    );
    expect(html).toContain("Nueva orden · Mesa #1");
    expect(html).toContain("Indicaciones del cliente");
    // La cantidad vive en la tarjeta del menú; no hay notas por producto.
    expect(html).toContain("2 × Hamburguesa");
    expect(html).not.toContain("Nota del producto");
    expect(html).toContain('aria-label="Agregar una unidad de Hamburguesa"');
    expect(html).toContain('aria-label="Quitar una unidad de Hamburguesa"');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("Nota privada");
  });

  it("sin productos nuevos no deja enviar", () => {
    const html = renderToStaticMarkup(
      createElement(ConstructorOrden, {
        productos: [{ id: 1, nombre: "Hamburguesa", precio_centavos: 8900, armable: 8 }],
        mesaFija: { id: 1, numero: 1 },
        borrador: {
          version: 1,
          mesaId: 1,
          claveIdempotencia: "ticket-2",
          lineas: [],
          indicaciones: "",
          actualizadoEn: "2026-08-22T12:00:00.000Z",
        },
        onCambiar: () => undefined,
        onEnviar: async () => undefined,
        onCancelar: () => undefined,
      }),
    );
    expect(html).toContain("Toca un producto del menú para agregarlo");
    expect(html).toContain("disabled");
  });
});
