// @vitest-environment happy-dom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from "vitest";
import { PrecuentaEnPantalla } from "../ui/src/pantallas/PrecuentaEnPantalla.tsx";

describe("precuenta en pantalla (interacción)", () => {
  beforeAll(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
  afterAll(() => vi.unstubAllGlobals());

  it("el botón Listo cierra el popup", async () => {
    const contenedor = document.createElement("div");
    document.body.appendChild(contenedor);
    const onCerrar = vi.fn();
    const root = createRoot(contenedor);
    onTestFinished(async () => {
      try {
        await act(async () => root.unmount());
      } finally {
        contenedor.remove();
      }
    });

    await act(async () => {
      root.render(
        createElement(PrecuentaEnPantalla, {
          restaurante: "La Prueba",
          precuenta: {
            mesaNumero: 7,
            numero: 1,
            mesero: "Ana",
            lineas: [{ nombre: "Hamburguesa", cantidad: 2, precioCentavos: 8900, nota: null }],
            totalCentavos: 17800,
          },
          onCerrar,
        }),
      );
    });

    // el modal se monta en el body via el Portal de Radix
    const boton = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Listo");
    expect(boton).toBeTruthy();

    await act(async () => {
      boton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onCerrar).toHaveBeenCalledTimes(1);
  });
});
