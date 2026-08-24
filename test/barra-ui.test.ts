import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Barra } from "../ui/src/pantallas/Barra.tsx";

describe("barra POS", () => {
  it("no muestra Complementos ni el nombre; cuenta y menú son iconos", () => {
    const html = renderToStaticMarkup(
      createElement(Barra, {
        vista: "plano",
        area: "mesero",
        marca: "Restaurante",
        nombre: "Jefa",
        onMesas: () => undefined,
        onOrdenes: () => undefined,
        onInventario: () => undefined,
        onCocina: () => undefined,
        onCambiarArea: () => undefined,
        onCerrarSesion: () => undefined,
        onCrearProducto: () => undefined,
        onIr: () => undefined,
      }),
    );
    expect(html).toContain("Mesas");
    expect(html).toContain("Órdenes");
    expect(html).toContain("Inventario");
    expect(html).toContain("Mesero");
    expect(html).toContain("Cocina");
    expect(html).not.toContain("Complementos");
    expect(html).not.toContain(">Jefa<");
    expect(html).not.toMatch(/>Cerrar</);
    expect(html).toContain("aria-label=\"Cuenta\"");
    expect(html).toContain("aria-label=\"Menú\"");
    expect(html).toContain("pos-nav__label");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Crear producto");
    expect(html).not.toContain("Editar mapa");
    expect(html).not.toContain("Backend");
    expect(html).not.toContain("Opciones");
  });

  it("en el área de cocina solo ofrece Cocina e Inventario", () => {
    const html = renderToStaticMarkup(
      createElement(Barra, {
        vista: "kds",
        area: "cocina",
        marca: "Restaurante",
        nombre: "Jefa",
        onMesas: () => undefined,
        onOrdenes: () => undefined,
        onInventario: () => undefined,
        onCocina: () => undefined,
        onCambiarArea: () => undefined,
        onCerrarSesion: () => undefined,
        onCrearProducto: () => undefined,
        onIr: () => undefined,
      }),
    );
    expect(html).toContain("Cocina");
    expect(html).toContain("Inventario");
    expect(html).not.toContain("Órdenes");
    expect(html).not.toContain("Mesas (M)");
  });
});
