// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditarMapa } from "../ui/src/pantallas/EditarMapa.tsx";
import type { Mesa } from "../ui/src/pantallas/Plano.tsx";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => vi.unstubAllGlobals());

describe("recuperación de mesas históricas", () => {
  it("avisa de una mesa fuera del lienzo y solo cambia su posición al pedir traerla", async () => {
    class Observer {
      constructor(private callback: ResizeObserverCallback) {}
      observe() {
        this.callback([{ contentRect: { width: 280, height: 560 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", Observer);
    const mesa: Mesa = {
      id: 1, numero: 7, estado: "libre", cuentaId: null, asientos: 4,
      pos_x: 99, pos_y: 99, forma: "square", ancho: 96, alto: 96, piso_id: 1,
    };
    const onGuardar = vi.fn();
    const contenedor = document.createElement("div");
    document.body.append(contenedor);
    const root = createRoot(contenedor);
    await act(async () => root.render(createElement(EditarMapa, {
      pisos: [{ id: 1, nombre: "Salón" }], mesas: [mesa], onGuardar, onDescartar: () => undefined,
    })));

    expect(contenedor.textContent).toContain("1 mesa quedó fuera del plano");
    const botonGuardar = Array.from(contenedor.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.trim() === "Guardar")!;
    await act(async () => botonGuardar.click());
    expect(onGuardar.mock.calls[0][0].pisos[0].mesas[0].pos_x).toBe(99);

    const traer = Array.from(contenedor.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.includes("Traer mesa 7"))!;
    await act(async () => traer.click());
    expect(contenedor.textContent).not.toContain("1 mesa quedó fuera del plano");
    await act(async () => botonGuardar.click());
    const recuperada = onGuardar.mock.calls[1][0].pisos[0].mesas[0];
    expect(recuperada.pos_x).toBeLessThan(70);
    expect(recuperada.pos_y).toBeLessThan(83);
    expect(mesa.pos_x).toBe(99);
    await act(async () => root.unmount());
    contenedor.remove();
  });
});
