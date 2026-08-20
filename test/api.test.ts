import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { createApp } from "../src/http/app.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { openTestDb } from "./helpers.ts";

describe("api", () => {
  it("sesión: básico no abre; avanzado sí; GET refleja abierta", async () => {
    const db = openTestDb();
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    await crearEmpleado(db, {
      nombre: "Jefa",
      pin: "2222",
      derecho: "avanzado",
      usuario: "admin",
      password: "admin",
    });
    const app = createApp({ db, config: defaultConfig(), printer: new MemoryPrinter() });

    const vacia = await app.request("/api/sesion");
    expect(await vacia.json()).toEqual({ abierta: false, administrador: null });

    const no = await app.request("/api/sesion/abrir", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usuario: "admin", password: "1234" }),
    });
    expect(no.status).toBe(403);

    const si = await app.request("/api/sesion/abrir", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usuario: "admin", password: "admin" }),
    });
    expect(si.status).toBe(200);
    const abierta = (await si.json()) as { abierta: boolean; administrador: { nombre: string } };
    expect(abierta.abierta).toBe(true);
    expect(abierta.administrador.nombre).toBe("Jefa");
    db.close();
  });

  it("salud ok", async () => {
    const db = openTestDb();
    const app = createApp({ db, config: defaultConfig(), printer: new MemoryPrinter() });
    const res = await app.request("/api/salud");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    db.close();
  });

  it("recorre mesa 7: enviar, precuenta 54000, caja", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    await crearEmpleado(db, { nombre: "Jefa", pin: "2222", derecho: "avanzado" });
    const printer = new MemoryPrinter();
    const app = createApp({ db, config: defaultConfig(), printer });

    const abrir = await app.request(`/api/mesas/${ids.mesa7}/abrir`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cubiertos: 4, pin: "1234" }),
    });
    expect(abrir.status).toBe(200);
    const { pedidoId } = (await abrir.json()) as { pedidoId: number };

    for (const [productoId, cantidad] of [
      [ids.hamburguesa, 5],
      [ids.jugo, 2],
      [ids.agua, 3],
    ] as const) {
      const add = await app.request(`/api/pedidos/${pedidoId}/lineas`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productoId, cantidad }),
      });
      expect(add.status).toBe(200);
    }

    const enviar = await app.request(`/api/pedidos/${pedidoId}/enviar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "1234" }),
    });
    expect(enviar.status).toBe(200);

    const precuenta = await app.request(`/api/pedidos/${pedidoId}/precuenta`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "1234" }),
    });
    expect(precuenta.status).toBe(200);
    const pre = (await precuenta.json()) as { totalCentavos: number; precuentaId: number };
    expect(pre.totalCentavos).toBe(54000);

    const reprint = await app.request(`/api/precuentas/${pre.precuentaId}/reimprimir`, { method: "POST" });
    expect(reprint.status).toBe(200);

    const caja = await app.request(`/api/pedidos/${pedidoId}/enviar-caja`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "2222" }),
    });
    expect(caja.status).toBe(200);

    const complementos = await app.request("/api/complementos");
    expect(await complementos.json()).toEqual({
      plugins: [],
      mensajes: ["No hay plugins para mostrar", "No hay plugins disponibles"],
    });
    db.close();
  });

  it("cambia cantidad de una línea nueva por API", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const app = createApp({ db, config: defaultConfig(), printer: new MemoryPrinter() });
    const abrir = await app.request(`/api/mesas/${ids.mesa7}/abrir`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cubiertos: 4, pin: "1234" }),
    });
    const { pedidoId } = (await abrir.json()) as { pedidoId: number };
    const add = await app.request(`/api/pedidos/${pedidoId}/lineas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productoId: ids.hamburguesa, cantidad: 1 }),
    });
    const { lineaId } = (await add.json()) as { lineaId: number };
    const res = await app.request(`/api/lineas/${lineaId}/cantidad`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cantidad: 4 }),
    });
    expect(res.status).toBe(200);
    const pedido = await app.request(`/api/pedidos/${pedidoId}`);
    const data = (await pedido.json()) as { lineas: { cantidad: number; sePuedeEditar: boolean }[] };
    expect(data.lineas[0].cantidad).toBe(4);
    expect(data.lineas[0].sePuedeEditar).toBe(true);
    db.close();
  });
});
