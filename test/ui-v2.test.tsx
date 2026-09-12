import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Barra } from "../ui/src/pantallas/Barra.tsx";
import { ConstructorOrden } from "../ui/src/pantallas/ConstructorOrden.tsx";
import { Plano } from "../ui/src/pantallas/Plano.tsx";
import type { BorradorOrden } from "../ui/src/lib/borradores.ts";

const borrador = {
  version: 1,
  claveIdempotencia: "mesa-7",
  mesaId: 7,
  lineas: [],
  indicaciones: "",
  actualizadoEn: "2026-08-28T00:00:00.000Z",
} satisfies BorradorOrden;

describe("UI V2 transaction-first", () => {
  it("organiza marca, navegación e iconos sin etiquetas redundantes", () => {
    const html = renderToStaticMarkup(
      createElement(Barra, {
        vista: "plano",
        marca: "Restaurante",
        nombre: "Ana",
        onMesas: () => undefined,
        onOrdenes: () => undefined,
        onInventario: () => undefined,
        onCerrarSesion: () => undefined,
        onIr: () => undefined,
      }),
    );
    expect(html).toContain('class="pos-nav__identity"');
    expect(html).toContain('class="pos-nav__right"');
    expect(html).toContain("Mesas");
    expect(html).toContain("Órdenes");
    expect(html).toContain("Inventario");
    expect(html).toContain('aria-label="Menú y cuenta"');
    expect(html).not.toContain("Vista Mesero");
    expect(html).not.toContain("Vista Cocina");
    expect(html).not.toContain(">Sesión<");
    expect(html).not.toContain(">Menú<");
  });

  it("mantiene el plano como mapa", () => {
    const html = renderToStaticMarkup(
      createElement(Plano, {
        piso: "Salón",
        mesas: [{ id: 7, numero: 7, estado: "libre", cuentaId: null, asientos: 4, pos_x: 20, pos_y: 25, forma: "round", ancho: 90, alto: 90 }],
        onMesa: () => undefined,
      }),
    );
    expect(html).toContain("plano-mapa");
    expect(html).toContain("Mesa 7");
    expect(html).toContain("left:20%");
    expect(html).not.toContain("Elegir mesa por número");
  });

  it("oculta búsqueda e indicaciones hasta que el usuario las solicita", () => {
    const html = renderToStaticMarkup(
      createElement(ConstructorOrden, {
        mesaFija: { id: 7, numero: 7 },
        productos: [{ id: 1, nombre: "Hamburguesa", precio_centavos: 8500, armable: 0 }],
        borrador,
        onCambiar: () => undefined,
        onEnviar: async () => undefined,
        onCancelar: () => undefined,
      }),
    );
    expect(html).toContain('aria-label="Buscar producto"');
    expect(html).not.toContain('placeholder="Buscar producto"');
    expect(html).toContain('aria-controls="resumen-orden"');
    expect(html).not.toContain("Agregar indicaciones");
    expect(html).not.toContain("Ej.: sin sal");
  });

});
