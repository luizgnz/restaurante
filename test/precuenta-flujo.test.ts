// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { App } from "../ui/src/App.tsx";

const cuentaDetalle = {
  id: 1,
  mesa: { id: 5, numero: 7 },
  estado: "abierta",
  notaPrivada: null,
  totalCentavos: 17800,
  ordenes: [
    {
      id: 11,
      numero: 1,
      estado: "enviada",
      indicaciones: null,
      indicacionesOriginales: null,
      creadaEn: "2026-08-23T12:00:00.000Z",
      empleado: "Jefa",
      lineas: [
        {
          lineaClave: "l1",
          ordenLineaId: 21,
          productoId: 1,
          nombre: "Hamburguesa",
          cantidad: 2,
          precioCentavos: 8900,
          nota: null,
        },
      ],
    },
  ],
};

function responder(url: string, init?: RequestInit): { status: number; body: unknown } {
  const metodo = init?.method ?? "GET";
  if (url === "/api/sesion") return { status: 200, body: { abierta: true, administrador: { id: 1, nombre: "Jefa", derecho: "avanzado" } } };
  if (url === "/api/mesas")
    return {
      status: 200,
      body: {
        mesas: [
          { id: 5, numero: 7, estado: "en_cocina", cuentaId: 1, asientos: 4, pos_x: 10, pos_y: 10, forma: "square", ancho: 90, alto: 90, piso_id: 1 },
        ],
        pisos: [{ id: 1, nombre: "Salón", tiene_fondo: 0 }],
      },
    };
  if (url === "/api/carta") return { status: 200, body: { productos: [{ id: 1, nombre: "Hamburguesa", precio_centavos: 8900, armable: 0 }] } };
  if (url === "/api/cuentas") return { status: 200, body: { cuentas: [] } };
  if (url === "/api/config") return { status: 200, body: { pin_habilitado: true } };
  if (url === "/api/cuentas/1") return { status: 200, body: { ...cuentaDetalle, estado: "precuenta_emitida" } };
  if (url === "/api/cuentas/1/precuenta" && metodo === "POST") return { status: 201, body: { precuentaId: 9, numero: 1, totalCentavos: 17800 } };
  return { status: 404, body: { codigo: "no_encontrado" } };
}

describe("flujo precuenta en el POS", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input).replace("http://localhost", "");
        const { status, body } = responder(url, init);
        return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      }),
    );
  });

  afterAll(() => vi.unstubAllGlobals());

  it("el Listo de la precuenta cierra el popup", async () => {
    const contenedor = document.createElement("div");
    document.body.appendChild(contenedor);
    const root = createRoot(contenedor);

    await act(async () => {
      root.render(createElement(App));
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Abrir la cuenta de la mesa 7 (tiene cuenta activa).
    const mesa = Array.from(contenedor.querySelectorAll("button")).find((b) => b.textContent?.includes("Mesa 7"));
    expect(mesa).toBeTruthy();
    await act(async () => {
      mesa!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(contenedor.textContent).toContain("Cuenta de mesa #7");

    // Emitir la precuenta (PIN habilitado: abre el PinPad).
    const precuenta = Array.from(contenedor.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Precuenta");
    expect(precuenta).toBeTruthy();
    await act(async () => {
      precuenta!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(contenedor.textContent).toContain("PIN para precuenta");

    // Teclear el PIN y confirmar con Enter.
    for (const digito of "2222") {
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: digito, bubbles: true }));
        await Promise.resolve();
      });
    }
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(contenedor.textContent).toContain("PRECUENTA");

    // Cerrarla con Listo.
    const listo = Array.from(contenedor.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Listo");
    expect(listo).toBeTruthy();
    await act(async () => {
      listo!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(contenedor.textContent).not.toContain("PRECUENTA");
    root.unmount();
  });
});
