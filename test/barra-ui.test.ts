import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Barra } from "../ui/src/pantallas/Barra.tsx";

describe("barra POS", () => {
  it("un solo botón de menú y sin conmutador de vista global", () => {
    const html = renderToStaticMarkup(
      createElement(Barra, {
        vista: "plano",
        marca: "Restaurante",
        nombre: "Jefa",
        onMesas: () => undefined,
        onOrdenes: () => undefined,
        onInventario: () => undefined,
        onCerrarSesion: () => undefined,
        onIr: () => undefined,
      }),
    );
    expect(html).toContain("Mesas");
    expect(html).toContain("Órdenes");
    expect(html).toContain("Inventario");
    expect(html).toContain('aria-label="Menú y cuenta"');
    expect(html).not.toContain("Vista Mesero");
    expect(html).not.toContain("Vista Cocina");
    expect(html).not.toContain("Complementos");
    expect(html).not.toContain(">Jefa<");
    expect(html).not.toContain("Cerrar sesión");
    expect(html).toContain("pos-nav__label");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Crear producto");
    expect(html).not.toContain("Editar mapa");
    expect(html).not.toContain("Backend");
    expect(html).not.toContain("Opciones");
  });

  it("con permisos de cocina ofrece Órdenes e Inventario, sin Mesas", () => {
    const html = renderToStaticMarkup(
      createElement(Barra, {
        vista: "pedidos",
        marca: "Restaurante",
        nombre: "Ana",
        puedeMesas: false,
        puedeOrdenes: false,
        puedeCocina: true,
        onMesas: () => undefined,
        onOrdenes: () => undefined,
        onInventario: () => undefined,
        onCerrarSesion: () => undefined,
        onIr: () => undefined,
      }),
    );
    expect(html).toContain("Órdenes");
    expect(html).toContain("Inventario");
    expect(html).not.toContain("Mesas (M)");
    expect(html).not.toContain("Vista Cocina");
  });
});
