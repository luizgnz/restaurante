// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { Pedidos, type CuentaEnCursoUi } from "../ui/src/pantallas/Pedidos.tsx";

const cuenta: CuentaEnCursoUi = {
  id: 1, mesaId: 2, mesa: 2, mesero: "Ana", estado: "abierta", hace: "", totalCentavos: 8000,
  ordenes: [{ id: 4, numero: 1, etapa: "listo", lineas: [
    { lineaClave: "l1", productoId: 3, nombre: "Producto con descripción larga ".repeat(8), cantidad: 1, nota: null },
  ] }],
};

it("el check entrega sin abrir la orden, bloquea reenvíos y permite reintentar un fallo", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  onTestFinished(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
  const onAbrir = vi.fn();
  let rechazar!: (reason: Error) => void;
  const onEntregar = vi.fn(() => new Promise<void>((_, reject) => { rechazar = reject; }));
  await act(async () => root.render(<Pedidos cuentas={[cuenta]} onAbrir={onAbrir} onEntregar={onEntregar} />));
  const check = host.querySelector<HTMLButtonElement>('[aria-label="Marcar Orden #4 como entregada"]')!;
  expect(check).not.toBeNull();
  expect(check.textContent).toBe("");
  expect(check.closest(".tabla-ordenes__descripcion")).toBeNull();
  expect(host.querySelector("button button")).toBeNull();
  await act(async () => check.click());
  expect(onEntregar).toHaveBeenCalledExactlyOnceWith(4);
  expect(onAbrir).not.toHaveBeenCalled();
  expect(check.disabled).toBe(true);
  await act(async () => rechazar(new Error("No se pudo confirmar la entrega")));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("No se pudo confirmar la entrega");
  expect(check.disabled).toBe(false);
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Abrir Orden #4 de la Mesa #2"]')!.click());
  expect(onAbrir).toHaveBeenCalledExactlyOnceWith(1, 4);
});
