import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Pedidos, type CuentaEnCursoUi } from "../ui/src/pantallas/Pedidos.tsx";

function cuenta(parcial: Partial<CuentaEnCursoUi> = {}): CuentaEnCursoUi {
  return {
    id: 1,
    mesaId: 5,
    mesa: 7,
    mesero: "Ana",
    estado: "abierta",
    hace: "Hace dos minutos",
    totalCentavos: 25000,
    ordenes: [
      {
        id: 10,
        numero: 1,
        lineas: [{ lineaClave: "l1", productoId: 3, nombre: "Hamburguesa", cantidad: 2, nota: "sin cebolla" }],
      },
    ],
    ...parcial,
  };
}

describe("pantalla Órdenes sobre cuentas", () => {
  it("muestra la cuenta activa con mesa, mesero y líneas agrupadas por orden", () => {
    const html = renderToStaticMarkup(
      createElement(Pedidos, { cuentas: [cuenta()], onAbrir: () => undefined }),
    );
    expect(html).toContain("Órdenes");
    expect(html).not.toContain(">Cocina<");
    expect(html).toContain("Mesa 7");
    expect(html).toContain("Ana");
    expect(html).toContain("Hace dos minutos");
    expect(html).toContain("En pedido");
    expect(html).toContain("Orden #1");
    expect(html).toContain("2 × Hamburguesa");
    expect(html).toContain("(sin cebolla)");
    expect(html).not.toContain("Anular");
    expect(html).not.toContain("En proceso");
  });

  it("muestra varias órdenes dentro de la misma cuenta", () => {
    const html = renderToStaticMarkup(
      createElement(Pedidos, {
        cuentas: [
          cuenta({
            estado: "precuenta_emitida",
            ordenes: [
              { id: 10, numero: 1, lineas: [{ lineaClave: "l1", productoId: 3, nombre: "Hamburguesa", cantidad: 2, nota: null }] },
              { id: 11, numero: 2, lineas: [{ lineaClave: "l2", productoId: 4, nombre: "Jugo", cantidad: 1, nota: null }] },
            ],
          }),
        ],
        onAbrir: () => undefined,
      }),
    );
    expect(html).toContain("Precuenta emitida");
    expect(html).toContain("Orden #1");
    expect(html).toContain("Orden #2");
    expect(html).toContain("1 × Jugo");
  });

  it("sin cuentas en curso lo dice", () => {
    const html = renderToStaticMarkup(createElement(Pedidos, { cuentas: [], onAbrir: () => undefined }));
    expect(html).toContain("No hay cuentas en curso");
  });
});
