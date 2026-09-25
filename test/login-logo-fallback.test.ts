// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Login } from "../ui/src/pantallas/Login.tsx";

describe("marca de la pantalla de acceso", () => {
  beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("usa el logo incluido y muestra el nombre sin imagen rota si falla", async () => {
    const contenedor = document.createElement("div");
    document.body.append(contenedor);
    const root = createRoot(contenedor);

    try {
      await act(async () => {
        root.render(createElement(Login, { error: "", onEntrar: () => undefined }));
      });

      const logo = contenedor.querySelector<HTMLImageElement>(".login-marca img");
      expect(logo?.getAttribute("src")).toBe("/marcas/olla-horizontal.svg");
      expect(logo?.getAttribute("alt")).toBe("La Olla de Casa");

      await act(async () => {
        logo?.dispatchEvent(new Event("error"));
      });

      expect(contenedor.querySelector(".login-marca img")).toBeNull();
      expect(contenedor.querySelector(".login-marca__respaldo")?.textContent).toContain("La Olla de Casa");
    } finally {
      await act(async () => root.unmount());
      contenedor.remove();
    }
  });
});
