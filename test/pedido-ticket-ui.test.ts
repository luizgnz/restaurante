import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Pedido } from "../ui/src/pantallas/Pedido.tsx";

describe("ticket del pedido", () => {
  it("permite cambiar o anular líneas editables", () => {
    const html = renderToStaticMarkup(
      createElement(Pedido, {
        productos: [{ id: 1, nombre: "Hamburguesa", precio_centavos: 8900, armable: 8 }],
        lineas: [{ id: 10, nombre: "Hamburguesa", cantidad: 2, estado: "nueva", sePuedeEditar: true }],
        onAgregar: () => undefined,
        onEnviar: () => undefined,
        onPrecuenta: () => undefined,
        onCaja: () => undefined,
        onQuitar: () => undefined,
        onCantidad: () => undefined,
      }),
    );
    expect(html).toContain("Anular");
    expect(html).toContain("+");
    expect(html).toContain("−");
  });
});
