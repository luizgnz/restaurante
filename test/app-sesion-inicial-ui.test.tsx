// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../ui/src/App.tsx";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function respuesta(data: unknown) {
  return { ok: true, json: async () => data } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("comprobación inicial de la sesión", () => {
  it("espera la respuesta antes de mostrar la vista autenticada", async () => {
    let resolverSesion!: (response: Response) => void;
    const consultaSesion = new Promise<Response>((resolve) => { resolverSesion = resolve; });
    vi.stubGlobal("fetch", vi.fn((path: string) =>
      path === "/api/sesion" ? consultaSesion : new Promise<Response>(() => undefined),
    ));
    const contenedor = document.createElement("div");
    document.body.append(contenedor);
    const root = createRoot(contenedor);

    await act(async () => root.render(<App />));
    expect(contenedor.textContent).toContain("Preparando el sistema");
    expect(contenedor.textContent).not.toContain("Iniciar sesión");

    await act(async () => resolverSesion(respuesta({
      abierta: true,
      usuario: { id: 1, nombre: "Bodega", derecho: "basico", roles: ["inventario"] },
      administrador: null,
    })));
    expect(contenedor.textContent).not.toContain("Iniciar sesión");
    expect(contenedor.textContent).not.toContain("Preparando el sistema");
    expect(contenedor.textContent).toContain("Inventario");
    await act(async () => root.unmount());
  });

  it("muestra el login solo después de confirmar que no hay sesión", async () => {
    let resolverSesion!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolverSesion = resolve; })));
    const contenedor = document.createElement("div");
    document.body.append(contenedor);
    const root = createRoot(contenedor);

    await act(async () => root.render(<App />));
    expect(contenedor.textContent).not.toContain("Iniciar sesión");

    await act(async () => resolverSesion(respuesta({ abierta: false, usuario: null, administrador: null })));
    expect(contenedor.textContent).toContain("Iniciar sesión");
    await act(async () => root.unmount());
  });

  it("ofrece reintentar si no pudo comprobar la sesión", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sin red"); }));
    const contenedor = document.createElement("div");
    document.body.append(contenedor);
    const root = createRoot(contenedor);

    await act(async () => root.render(<App />));
    expect(contenedor.textContent).toContain("No se pudo comprobar la sesión");
    expect(contenedor.textContent).toContain("Reintentar");
    expect(contenedor.textContent).not.toContain("Iniciar sesión");
    await act(async () => root.unmount());
  });
});
