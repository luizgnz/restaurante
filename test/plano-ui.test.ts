import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Plano, alturaAutomaticaPlano } from "../ui/src/pantallas/Plano.tsx";

describe("plano restaurante", () => {
  it("reduce la altura automática cuando un área usa menos filas", () => {
    const mesa = (numero: number, posY: number) => ({
      id: numero,
      numero,
      estado: "libre",
      cuentaId: null,
      asientos: 2,
      pos_x: 10 + numero * 8,
      pos_y: posY,
      forma: "square",
      ancho: 96,
      alto: 96,
    });
    const barra = [mesa(1, 14), mesa(2, 14), mesa(3, 14)];
    const salon = [
      mesa(1, 8), mesa(2, 8), mesa(3, 8), mesa(4, 8),
      mesa(5, 38), mesa(6, 38), mesa(7, 38), mesa(8, 38),
      mesa(9, 68), mesa(10, 68),
    ];

    expect(alturaAutomaticaPlano(barra, 1, true)).toBeLessThan(alturaAutomaticaPlano(salon));
  });

  it("pinta el mapa de mesas con posición y estado, no una lista suelta", () => {
    const html = renderToStaticMarkup(
      createElement(Plano, {
        piso: "Salón",
        mesas: [
          {
            id: 1,
            numero: 7,
            estado: "libre",
            cuentaId: null,
            asientos: 4,
            pos_x: 48,
            pos_y: 40,
            forma: "round",
            ancho: 90,
            alto: 90,
          },
          {
            id: 2,
            numero: 1,
            estado: "ocupada",
            cuentaId: 9,
            asientos: 2,
            pos_x: 8,
            pos_y: 18,
            forma: "square",
            ancho: 88,
            alto: 88,
          },
        ],
        onMesa: () => undefined,
      }),
    );
    expect(html).toContain("plano-mapa");
    expect(html).toContain("Mesa 7");
    expect(html).toContain("Mesa 1");
    expect(html).toContain("Salón");
    expect(html).toContain("libre");
    expect(html).toContain("ocupada");
    expect(html).toContain("left:48%");
    expect(html).toContain("top:40%");
  });

  it("tiene Nueva orden; no QR ni Registrar", () => {
    const html = renderToStaticMarkup(
      createElement(Plano, {
        piso: "Piso 1",
        mesas: [
          {
            id: 1,
            numero: 1,
            estado: "ocupada",
            cuentaId: 9,
            asientos: 2,
            pos_x: 8,
            pos_y: 18,
            forma: "square",
            ancho: 88,
            alto: 88,
          },
        ],
        onMesa: () => undefined,
        onNuevoPedido: () => undefined,
        onBuscarMesa: () => undefined,
      }),
    );
    expect(html).toContain("Nueva orden");
    expect(html).not.toContain("Imagen de fondo");
    expect(html).not.toContain("QR");
    expect(html).not.toContain("Registrar");
    expect(html).not.toContain("Últimos");
    expect(html).not.toContain("Atrasados");
    expect(html).not.toContain("barra-pedidos");
    expect(html).toContain("Mesa 1");
  });

  it("permite probar una Nueva orden V2 sin cambiar la variante original", () => {
    const html = renderToStaticMarkup(
      createElement(Plano, {
        nuevaOrdenV2: true,
        piso: "Salón",
        mesas: [],
        onMesa: () => undefined,
        onNuevoPedido: () => undefined,
      }),
    );

    expect(html).toContain("salon-odoo__nueva--v2");
    expect(html).toContain("Nueva orden");
  });

  it("muestra un único Salón como título cuando no hay más áreas", () => {
    const html = renderToStaticMarkup(
      createElement(Plano, {
        soloSalon: true,
        piso: "Salón",
        mesas: [],
        onMesa: () => undefined,
        onNuevoPedido: () => undefined,
      }),
    );

    expect(html).toContain("salon-odoo--solo");
    expect(html).toContain("salon-odoo__titulo-area");
    expect(html).toContain("salon-odoo__nueva--v3");
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain("Terraza");
    expect(html).not.toContain("Barra");
  });

  it("pone los pisos al centro, marca el actual y lista los demás", () => {
    const html = renderToStaticMarkup(
      createElement(Plano, {
        piso: "Piso 1",
        pisoId: 1,
        pisos: [
          { id: 1, nombre: "Piso 1" },
          { id: 2, nombre: "Terraza" },
        ],
        mesas: [
          {
            id: 1,
            numero: 1,
            estado: "libre",
            cuentaId: null,
            asientos: 2,
            pos_x: 8,
            pos_y: 18,
            forma: "square",
            ancho: 88,
            alto: 88,
            piso_id: 1,
          },
        ],
        onMesa: () => undefined,
        onPiso: () => undefined,
        onNuevoPedido: () => undefined,
      }),
    );
    expect(html).toContain("salon-odoo__pisos-centro");
    expect(html).toContain("Piso 1");
    expect(html).toContain("Terraza");
    expect(html).toMatch(/salon-odoo__piso is-on[^>]*>Piso 1/);
    expect(html).not.toMatch(/salon-odoo__piso is-on[^>]*>Terraza/);
  });
});
