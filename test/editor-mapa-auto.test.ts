// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { EditarMapa } from "../ui/src/pantallas/EditarMapa.tsx";
import type { Mesa } from "../ui/src/pantallas/Plano.tsx";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mesas: Mesa[] = [
  {
    id: 1,
    numero: 2,
    estado: "libre",
    cuentaId: null,
    asientos: 4,
    pos_x: 70,
    pos_y: 45,
    forma: "round",
    ancho: 150,
    alto: 80,
    piso_id: 1,
  },
  {
    id: 2,
    numero: 1,
    estado: "libre",
    cuentaId: null,
    asientos: 2,
    pos_x: 35,
    pos_y: 72,
    forma: "round",
    ancho: 72,
    alto: 72,
    piso_id: 1,
  },
];

describe("orden automático del editor de mapa", () => {
  it("activa Auto y normaliza posición, forma y tamaño de las mesas", async () => {
    const contenedor = document.createElement("div");
    document.body.appendChild(contenedor);
    const root = createRoot(contenedor);

    await act(async () => {
      root.render(
        createElement(EditarMapa, {
          pisos: [{ id: 1, nombre: "Salón" }],
          mesas,
          onGuardar: () => undefined,
          onDescartar: () => undefined,
        }),
      );
    });

    const auto = contenedor.querySelector<HTMLButtonElement>('button[aria-pressed="false"]');
    expect(auto?.textContent).toBe("Auto");

    await act(async () => {
      auto!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(auto?.getAttribute("aria-pressed")).toBe("true");
    const mesasOrdenadas = Array.from(contenedor.querySelectorAll<HTMLElement>(".mesa-odoo"));
    expect(mesasOrdenadas).toHaveLength(2);
    expect(mesasOrdenadas[0].style.width).toBe("96px");
    expect(mesasOrdenadas[0].style.height).toBe("96px");
    expect(mesasOrdenadas[0].className).toContain("mesa-odoo--square");
    expect(mesasOrdenadas[0].style.left).toBe("49%");
    expect(mesasOrdenadas[1].style.left).toBe("4%");

    const nuevaMesa = contenedor.querySelector<HTMLButtonElement>('button[title="Nueva mesa"]');
    await act(async () => {
      nuevaMesa!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const mesasConNueva = Array.from(contenedor.querySelectorAll<HTMLElement>(".mesa-odoo"));
    expect(mesasConNueva).toHaveLength(3);
    expect(mesasConNueva[2].style.width).toBe("96px");
    expect(mesasConNueva[2].style.left).toBe("4%");
    expect(mesasConNueva[2].style.top).toBe("30%");
    expect(auto?.getAttribute("aria-pressed")).toBe("true");

    const reducir = contenedor.querySelector<HTMLButtonElement>('button[title="Reducir"]');
    await act(async () => {
      reducir!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(auto?.getAttribute("aria-pressed")).toBe("false");
    expect(mesasConNueva[2].style.width).toBe("80px");

    await act(async () => root.unmount());
    contenedor.remove();
  });
});
