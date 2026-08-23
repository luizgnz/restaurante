import { describe, expect, it } from "vitest";
import { estadoMesa } from "../src/modules/salon/salon.ts";
import { crearOrden, entornoApi, post } from "./helpers.ts";

describe("salón con cuentas", () => {
  it("navegar el plano no crea filas: la mesa se ocupa recién al enviar", async () => {
    const e = await entornoApi();
    const filas = () =>
      (e.db.prepare("SELECT count(*) AS c FROM pedidos").get() as { c: number }).c +
      (e.db.prepare("SELECT count(*) AS c FROM cuentas").get() as { c: number }).c;
    const antes = filas();
    await e.app.request("/api/mesas");
    await e.app.request("/api/mesas");
    expect(filas()).toBe(antes);
    expect(estadoMesa(e.db, e.ids.mesa7)).toBe("libre");
    e.db.close();
  });

  it("el primer envío crea la cuenta y ocupa la mesa", async () => {
    const e = await entornoApi();
    expect(estadoMesa(e.db, e.ids.mesa7)).toBe("libre");
    const orden = await crearOrden(e);
    expect(estadoMesa(e.db, e.ids.mesa7)).toBe("en_cocina");
    const body = (await (await e.app.request("/api/mesas")).json()) as {
      mesas: { id: number; estado: string; cuentaId: number | null }[];
    };
    const mesa = body.mesas.find((m) => m.id === e.ids.mesa7);
    expect(mesa?.estado).toBe("en_cocina");
    expect(mesa?.cuentaId).toBe(orden.cuentaId);
    e.db.close();
  });

  it("cerrar la cuenta libera la mesa", async () => {
    const e = await entornoApi();
    const orden = await crearOrden(e);
    const precuenta = await post(e.app, `/api/cuentas/${orden.cuentaId}/precuenta`, { pin: "1234" });
    expect(precuenta.status).toBe(201);
    expect(estadoMesa(e.db, e.ids.mesa7)).toBe("precuenta");
    const caja = await post(e.app, `/api/cuentas/${orden.cuentaId}/enviar-caja`, { pin: "2222" });
    expect(caja.status).toBe(201);
    expect(estadoMesa(e.db, e.ids.mesa7)).toBe("libre");
    e.db.close();
  });

  it("una mesa no puede tener dos cuentas activas", async () => {
    const e = await entornoApi();
    const uno = await crearOrden(e);
    const dos = await crearOrden(e, { claveIdempotencia: "browser-uuid-2" });
    expect(dos.cuentaId).toBe(uno.cuentaId);
    const activas = e.db
      .prepare("SELECT count(*) AS c FROM cuentas WHERE mesa_id = ? AND estado IN ('abierta', 'precuenta_emitida')")
      .get(e.ids.mesa7) as { c: number };
    expect(activas.c).toBe(1);
    e.db.close();
  });
});
