import { describe, expect, it } from "vitest";
import { crearOrden, entornoApi, post } from "./helpers.ts";

describe("cola de impresión", () => {
  it("lista trabajos y permite reintentar uno desde Administración", async () => {
    const e = await entornoApi();
    await post(e.app, "/api/sesion/abrir", { usuario: "admin", password: "admin" });
    await crearOrden(e);

    const listado = await e.app.request("/api/impresion/trabajos");
    expect(listado.status).toBe(200);
    const trabajos = ((await listado.json()) as { trabajos: Array<{ id: number; estado: string; intentos: number }> }).trabajos;
    expect(trabajos[0]).toMatchObject({ estado: "sent", intentos: 1 });

    const reintento = await post(e.app, `/api/impresion/trabajos/${trabajos[0].id}/reintentar`);
    expect(reintento.status).toBe(200);
    expect(await reintento.json()).toMatchObject({ trabajo: { id: trabajos[0].id, estado: "sent", intentos: 2 } });
    e.db.close();
  });
});
