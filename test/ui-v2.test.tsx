import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Barra } from "../ui/src/pantallas/Barra.tsx";
import { ConstructorOrden } from "../ui/src/pantallas/ConstructorOrden.tsx";
import { Plano } from "../ui/src/pantallas/Plano.tsx";

const borrador = {
  clave: "mesa-7",
  contexto: { tipo: "mesa" as const, mesaId: 7, mesaNumero: 7 },
  mesaId: 7,
  lineas: [],
  indicaciones: "",
  actualizadoEn: "2026-08-28T00:00:00.000Z",
};

describe("UI V2 transaction-first", () => {
  it("organiza marca, vistas de trabajo e iconos sin etiquetas redundantes", () => {
    const html = renderToStaticMarkup(
      createElement(Barra, {
        uiVersion: "nueva",
        vista: "plano",
        area: "mesero",
        marca: "Restaurante",
        nombre: "Ana",
        onMesas: () => undefined,
        onOrdenes: () => undefined,
        onInventario: () => undefined,
        onCocina: () => undefined,
        onCambiarArea: () => undefined,
        onCerrarSesion: () => undefined,
        onIr: () => undefined,
      }),
    );
    expect(html).toContain('class="pos-nav__identity"');
    expect(html).toContain('class="pos-nav__right"');
    expect(html).toContain("Vista Mesero");
    expect(html).toContain("Vista Cocina");
    expect(html).not.toContain(">Sesión<");
    expect(html).not.toContain(">Menú<");
  });

  it("mantiene el plano como mapa y acepta el modo nuevo", () => {
    const html = renderToStaticMarkup(
      createElement(Plano, {
        uiVersion: "nueva",
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
        uiVersion: "nueva",
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
    expect(html).toContain("Agregar indicaciones");
    expect(html).not.toContain("Ej.: sin sal");
  });

});
