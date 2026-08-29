// @vitest-environment happy-dom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { PrecuentaEnPantalla } from "../ui/src/pantallas/PrecuentaEnPantalla.tsx";

describe("precuenta en pantalla (interacción)", () => {
  it("el botón Listo cierra el popup", async () => {
    const contenedor = document.createElement("div");
    document.body.appendChild(contenedor);
    const onCerrar = vi.fn();
    const root = createRoot(contenedor);

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

    const boton = Array.from(contenedor.querySelectorAll("button")).find((b) => b.textContent === "Listo");
    expect(boton).toBeTruthy();

    await act(async () => {
      boton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onCerrar).toHaveBeenCalledTimes(1);
    root.unmount();
  });
});
