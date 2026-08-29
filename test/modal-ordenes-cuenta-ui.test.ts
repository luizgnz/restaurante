import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModalOrdenesCuenta } from "../ui/src/pantallas/ModalOrdenesCuenta.tsx";
import type { CuentaDetalleUi } from "../ui/src/pantallas/CuentaMesa.tsx";

const cuenta: CuentaDetalleUi = {
  id: 8,
  mesa: { id: 3, numero: 7 },
  estado: "abierta",
  notaPrivada: null,
  totalCentavos: 21300,
  ordenes: [
    {
      id: 11,
      numero: 1,
      estado: "enviada",
      indicaciones: null,
      indicacionesOriginales: null,
      creadaEn: "2026-08-23T12:00:00.000Z",
      empleado: "Ana",
      lineas: [
        {
          lineaClave: "l1",
          ordenLineaId: 20,
          productoId: 1,
          nombre: "Hamburguesa",
          cantidad: 2,
          precioCentavos: 8900,
          nota: "sin cebolla",
        },
        {
          lineaClave: "l2",
          ordenLineaId: 21,
          productoId: 2,
          nombre: "Jugo",
          cantidad: 1,
          precioCentavos: 3500,
          nota: null,
        },
      ],
    },
  ],
};

describe("ventana de órdenes de la cuenta", () => {
  it("muestra las órdenes con sus productos y acciones de edición", () => {
    const html = renderToStaticMarkup(
      createElement(ModalOrdenesCuenta, {
        cuenta,
        onEditarOrden: () => undefined,
        onAnularOrden: () => undefined,
        onCerrar: () => undefined,
      }),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Cuenta de mesa #7");
    expect(html).toContain("Orden #1");
    // Productos en una sola línea, separados por coma.
    expect(html).toContain("2 × Hamburguesa (sin cebolla), 1 × Jugo");
    expect(html).toContain('title="Editar orden"');
    expect(html).toContain('title="Anular orden"');
    expect(html).toContain("Cerrar");
  });

  it("omite las líneas en cero", () => {
    const html = renderToStaticMarkup(
      createElement(ModalOrdenesCuenta, {
        cuenta: {
          ...cuenta,
          ordenes: [
            {
              ...cuenta.ordenes[0],
              lineas: [
                ...cuenta.ordenes[0].lineas,
                {
                  lineaClave: "l3",
                  ordenLineaId: 22,
                  productoId: 3,
                  nombre: "Anulado",
                  cantidad: 0,
                  precioCentavos: 1000,
                  nota: null,
                },
              ],
            },
          ],
        },
        onEditarOrden: () => undefined,
        onAnularOrden: () => undefined,
        onCerrar: () => undefined,
      }),
    );

    expect(html).not.toContain("Anulado");
  });

  it("al elegir una orden muestra solo su menú de editar o eliminar", () => {
    const html = renderToStaticMarkup(
      createElement(ModalOrdenesCuenta, {
        cuenta,
        ordenId: 11,
        onEditarOrden: () => undefined,
        onAnularOrden: () => undefined,
        onCerrar: () => undefined,
      }),
    );
    expect(html).toContain('aria-label="Acciones para Orden #1"');
    expect(html).toContain("Orden #1 · Mesa 7");
    expect(html).toContain("Editar pedido");
    expect(html).toContain("Eliminar pedido");
    expect(html).not.toContain('title="Editar orden"');
  });
});
