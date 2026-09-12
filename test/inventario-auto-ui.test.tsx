// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Inventario } from "../ui/src/pantallas/Inventario.tsx";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("actualización automática del inventario", () => {
  it("recarga cada 15 segundos y al volver a una pestaña visible", async () => {
    vi.useFakeTimers();
    const onRecargar = vi.fn(async () => undefined);
    const contenedor = document.createElement("div");
    document.body.append(contenedor);
    const root = createRoot(contenedor);

    await act(async () => {
      root.render(
        <Inventario
          materiales={[]}
          puedeIngresar={false}
          onRecargar={onRecargar}
          onRegistrarEntrada={async () => undefined}
          onRegistrarPerdida={async () => undefined}
        />,
      );
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(onRecargar).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(onRecargar).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
  });
});
