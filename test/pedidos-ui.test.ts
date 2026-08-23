import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Pedidos } from "../ui/src/pantallas/Pedidos.tsx";

describe("pantalla Pedidos", () => {
  it("muestra productos, mesero y hace cuanto; no se titula Cocina", () => {
    const html = renderToStaticMarkup(
      createElement(Pedidos, {
        mostrarEnProceso: true,
        pedidos: [
          {
            id: 1,
            mesa: 7,
            mesero: "Ana",
            hace: "Hace dos minutos",
            estado: "borrador",
            lineas: [{ id: 10, nombre: "Hamburguesa", cantidad: 5, estado: "enviada", sePuedeEditar: true }],
          },
        ],
        onAbrir: () => undefined,
        onEnProceso: () => undefined,
      }),
    );
    expect(html).toContain("Órdenes");
    expect(html).not.toContain(">Cocina<");
    expect(html).toContain("Hamburguesa");
    expect(html).toContain("Ana");
    expect(html).toContain("Hace dos minutos");
    expect(html).not.toContain("Anular");
    expect(html).toContain("Mesa 7");
    expect(html).toContain("Sin completar");
    expect(html).not.toContain(">borrador<");
  });

  it("con papel no ofrece anular lo enviado", () => {
    const html = renderToStaticMarkup(
      createElement(Pedidos, {
        mostrarEnProceso: false,
        pedidos: [
          {
            id: 1,
            mesa: null,
            mesero: "Ana",
            hace: "Hace un minuto",
            estado: "enviado",
            lineas: [{ id: 10, nombre: "Jugo", cantidad: 1, estado: "enviada", sePuedeEditar: false }],
          },
        ],
        onAbrir: () => undefined,
        onEnProceso: () => undefined,
      }),
    );
    expect(html).not.toContain("Anular");
    expect(html).toContain("Sin mesa asignada");
    expect(html).toContain("En cocina");
  });

  it("con tablet no deja controles permanentes junto a líneas enviadas", () => {
    const html = renderToStaticMarkup(
      createElement(Pedidos, {
        mostrarEnProceso: true,
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
        onEnProceso: () => undefined,
      }),
    );
    expect(html).not.toContain("Anular");
    expect(html).not.toContain(">+<");
    expect(html).not.toContain(">−<");
    expect(html).toContain("En proceso");
  });
});
