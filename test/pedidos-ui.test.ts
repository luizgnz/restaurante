import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Pedidos } from "../ui/src/pantallas/Pedidos.tsx";

describe("pantalla Pedidos", () => {
  it("muestra productos, mesero y hace cuanto; no se titula Cocina", () => {
    const html = renderToStaticMarkup(
      createElement(Pedidos, {
        tabletCocina: true,
        pedidos: [
          {
            id: 1,
            mesa: 7,
            mesero: "Ana",
            hace: "Hace dos minutos",
            lineas: [{ id: 10, nombre: "Hamburguesa", cantidad: 5, estado: "enviada", sePuedeEditar: true }],
          },
        ],
        onAbrir: () => undefined,
        onQuitar: () => undefined,
        onEnProceso: () => undefined,
        onTablet: () => undefined,
      }),
    );
    expect(html).toContain("Pedidos");
    expect(html).not.toContain(">Cocina<");
    expect(html).toContain("Hamburguesa");
    expect(html).toContain("Ana");
    expect(html).toContain("Hace dos minutos");
    expect(html).toContain("Anular");
  });

  it("con papel no ofrece anular lo enviado", () => {
    const html = renderToStaticMarkup(
      createElement(Pedidos, {
        tabletCocina: false,
        pedidos: [
          {
            id: 1,
            mesa: 7,
            mesero: "Ana",
            hace: "Hace un minuto",
            lineas: [{ id: 10, nombre: "Jugo", cantidad: 1, estado: "enviada", sePuedeEditar: false }],
          },
        ],
        onAbrir: () => undefined,
        onQuitar: () => undefined,
        onEnProceso: () => undefined,
        onTablet: () => undefined,
      }),
    );
    expect(html).not.toContain("Anular");
  });

  it("con tablet ofrece anular y cambiar cantidad", () => {
    const html = renderToStaticMarkup(
      createElement(Pedidos, {
        tabletCocina: true,
        pedidos: [
          {
            id: 1,
            mesa: 7,
            mesero: "Ana",
            hace: "Hace un momento",
            lineas: [{ id: 10, nombre: "Jugo", cantidad: 2, estado: "enviada", sePuedeEditar: true }],
          },
        ],
        onAbrir: () => undefined,
        onQuitar: () => undefined,
        onEnProceso: () => undefined,
        onCantidad: () => undefined,
        onTablet: () => undefined,
      }),
    );
    expect(html).toContain("Anular");
    expect(html).toContain("+");
    expect(html).toContain("−");
  });
});
