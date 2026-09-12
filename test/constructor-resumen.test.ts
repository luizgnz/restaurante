// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { ConstructorOrden, type ProductoCarta } from "../ui/src/pantallas/ConstructorOrden.tsx";
import type { BorradorOrden } from "../ui/src/lib/borradores.ts";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const producto: ProductoCarta = {
  id: 1,
  nombre: "Hamburguesa",
  precio_centavos: 8900,
  armable: 0,
  categoria_nombre: "Comida",
};

const borrador: BorradorOrden = {
  version: 1,
  claveIdempotencia: "resumen-emergente",
  mesaId: 3,
  lineas: [{ productoId: 1, cantidad: 2, nota: "" }],
  indicaciones: "",
  actualizadoEn: "2026-09-07T12:00:00.000Z",
};

describe("resumen emergente de la orden", () => {
  it("mantiene el detalle plegado y lo abre desde la cinta inferior", async () => {
    const contenedor = document.createElement("div");
    document.body.appendChild(contenedor);
    const root = createRoot(contenedor);

    await act(async () => {
      root.render(
        createElement(ConstructorOrden, {
          mesaFija: { id: 3, numero: 7 },
          productos: [producto],
          borrador,
          onCambiar: () => undefined,
          onEnviar: async () => undefined,
          onCancelar: () => undefined,
        }),
      );
    });

    const cinta = document.body.querySelector<HTMLButtonElement>('button[aria-controls="resumen-orden"]');
    expect(cinta?.getAttribute("aria-expanded")).toBe("false");
    expect(document.body.textContent).not.toContain("2 × Hamburguesa");

    await act(async () => {
      cinta!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("2 × Hamburguesa");
    expect(document.body.textContent).toContain("Agregar indicaciones");
    expect(document.body.textContent).toContain("Enviar · $17.800");

    const cerrar = document.body.querySelector<HTMLButtonElement>('button[aria-label="Cerrar resumen de la orden"]');
    await act(async () => {
      cerrar!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.body.textContent).not.toContain("2 × Hamburguesa");

    await act(async () => root.unmount());
    contenedor.remove();
  });

  it("revela los contornos guardados solo dentro del detalle", async () => {
    const contenedor = document.createElement("div");
    document.body.appendChild(contenedor);
    const root = createRoot(contenedor);

    await act(async () => {
      root.render(
        createElement(ConstructorOrden, {
          mesaFija: { id: 3, numero: 7 },
          productos: [{ ...producto, nombre: "Menú del día" }],
          borrador: {
            ...borrador,
            lineas: [{
              productoId: 1,
              cantidad: 1,
              nota: "",
              contornos: [{ slotPosicion: 1, varianteId: 10 }],
              contornosTexto: "Pollo · Arroz · Ensalada rusa",
            }],
          },
          onCambiar: () => undefined,
          onEnviar: async () => undefined,
          onCancelar: () => undefined,
        }),
      );
    });

    expect(document.body.textContent).not.toContain("Pollo · Arroz · Ensalada rusa");
    const cinta = document.body.querySelector<HTMLButtonElement>('button[aria-controls="resumen-orden"]');
    await act(async () => cinta!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(document.body.textContent).toContain("1 × Menú del día");
    expect(document.body.textContent).toContain("Pollo · Arroz · Ensalada rusa");

    await act(async () => root.unmount());
    contenedor.remove();
  });
});
