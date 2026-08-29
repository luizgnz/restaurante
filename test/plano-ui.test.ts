import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Plano } from "../ui/src/pantallas/Plano.tsx";

describe("plano restaurante", () => {
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

  it("tiene Nueva orden y # para mesa; no QR ni Registrar", () => {
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
        mostrarUltimos: true,
        mostrarAtrasados: true,
        ultimos: [{ id: 9, mesa: 1, mesero: "Ana", hace: "Hace un minuto", espera_min: 1, nivel: "ok" }],
        atrasados: [{ id: 8, mesa: 2, mesero: "Ana", hace: "Hace 20 minutos", espera_min: 20, nivel: "alto" }],
        onPedido: () => undefined,
        onToggleUltimos: () => undefined,
        onToggleAtrasados: () => undefined,
      }),
    );
    expect(html).toContain("Nueva orden");
    expect(html).not.toContain("Imagen de fondo");
    expect(html).toContain("#");
    expect(html).not.toContain("QR");
    expect(html).not.toContain("Registrar");
    expect(html).toContain("Últimos");
    expect(html).toContain("Atrasados");
    expect(html).toContain("espera-alto");
    expect(html).toContain("Mesa 1");
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

