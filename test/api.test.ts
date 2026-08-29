import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { createApp } from "../src/http/app.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { codigoDe, crearOrden, entornoApi, openTestDb, post, verCuenta } from "./helpers.ts";

describe("api", () => {
  it("sesión: cualquier usuario con credenciales válidas puede iniciar", async () => {
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
    expect(await vacia.json()).toEqual({ abierta: false, usuario: null, administrador: null });

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

// ---------------------------------------------------------------------------
// API del modelo Cuenta → Órdenes → Correcciones.
// ---------------------------------------------------------------------------

describe("POST /api/ordenes", () => {
  it("crea cuenta, Orden #1 y comanda en un solo envío", async () => {
    const e = await entornoApi();

    const res = await post(e.app, "/api/ordenes", {
      mesaId: e.ids.mesa7,
      claveIdempotencia: "browser-uuid-1",
      pin: "1234",
      lineas: [{ productoId: e.ids.hamburguesa, cantidad: 2, nota: "sin cebolla" }],
      indicaciones: "primero bebidas",
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { cuentaId: number; ordenId: number; ordenNumero: number; repetida: boolean };
    expect(body).toMatchObject({ ordenNumero: 1, repetida: false });
    const cuenta = await verCuenta(e.app, body.cuentaId);
    expect(cuenta).toMatchObject({
      id: body.cuentaId,
      estado: "abierta",
      mesa: { id: e.ids.mesa7, numero: 7 },
      totalCentavos: 17800,
    });
    expect(cuenta.ordenes).toHaveLength(1);
    expect(cuenta.ordenes[0]).toMatchObject({ numero: 1, estado: "enviada", indicaciones: "primero bebidas" });
    expect(cuenta.ordenes[0].lineas[0]).toMatchObject({ productoId: e.ids.hamburguesa, cantidad: 2, nota: "sin cebolla" });
    expect(typeof cuenta.ordenes[0].lineas[0].lineaClave).toBe("string");
    e.db.close();
  });

  it("repetir la clave de idempotencia devuelve la misma orden sin duplicarla", async () => {
    const e = await entornoApi();
    const primera = await crearOrden(e);

    const res = await post(e.app, "/api/ordenes", {
      mesaId: e.ids.mesa7,
      claveIdempotencia: "browser-uuid-1",
      pin: "1234",
      lineas: [{ productoId: e.ids.hamburguesa, cantidad: 2, nota: "sin cebolla" }],
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      cuentaId: primera.cuentaId,
      ordenId: primera.ordenId,
      ordenNumero: 1,
      repetida: true,
    });
    expect((e.db.prepare("SELECT count(*) AS c FROM ordenes").get() as { c: number }).c).toBe(1);
    expect((e.db.prepare("SELECT count(*) AS c FROM comandas").get() as { c: number }).c).toBe(1);
    e.db.close();
  });

  it("sin PIN válido no crea nada", async () => {
    const e = await entornoApi();

    const sinPin = await post(e.app, "/api/ordenes", {
      mesaId: e.ids.mesa7,
      claveIdempotencia: "browser-uuid-1",
      lineas: [{ productoId: e.ids.hamburguesa, cantidad: 1 }],
    });
    const malo = await post(e.app, "/api/ordenes", {
      mesaId: e.ids.mesa7,
      claveIdempotencia: "browser-uuid-2",
      pin: "0000",
      lineas: [{ productoId: e.ids.hamburguesa, cantidad: 1 }],
    });
    const minimo = await post(e.app, "/api/ordenes", {
      mesaId: e.ids.mesa7,
      claveIdempotencia: "browser-uuid-3",
      pin: "3333",
      lineas: [{ productoId: e.ids.hamburguesa, cantidad: 1 }],
    });

    expect([sinPin.status, malo.status, minimo.status]).toEqual([403, 403, 403]);
    expect(await codigoDe(minimo)).toBe("sin_derecho");
    expect((e.db.prepare("SELECT count(*) AS c FROM cuentas").get() as { c: number }).c).toBe(0);
    expect((e.db.prepare("SELECT count(*) AS c FROM ordenes").get() as { c: number }).c).toBe(0);
    e.db.close();
  });

  it("rechaza payloads inválidos con 4xx y sin tocar la base", async () => {
    const e = await entornoApi();
    const base = { mesaId: e.ids.mesa7, pin: "1234", lineas: [{ productoId: e.ids.hamburguesa, cantidad: 1 }] };

    const roto = await e.app.request("/api/ordenes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{no es json",
    });
    expect(roto.status).toBe(400);
    expect(await codigoDe(roto)).toBe("json_invalido");

    const sinCuerpo = await e.app.request("/api/ordenes", { method: "POST" });
    expect(sinCuerpo.status).toBe(400);

    const casos: [string, unknown, number, string][] = [
      ["sin clave", { ...base }, 400, "clave_idempotencia_requerida"],
      ["clave vacía", { ...base, claveIdempotencia: "   " }, 400, "clave_idempotencia_requerida"],
      ["clave no texto", { ...base, claveIdempotencia: 7 }, 400, "clave_idempotencia_requerida"],
      ["mesaId ausente", { ...base, mesaId: undefined, claveIdempotencia: "k1" }, 400, "mesa_invalida"],
      ["mesaId no numérico", { ...base, mesaId: "siete", claveIdempotencia: "k2" }, 400, "mesa_invalida"],
      ["líneas no lista", { ...base, lineas: { productoId: 1 }, claveIdempotencia: "k3" }, 400, "lineas_invalidas"],
      ["línea no objeto", { ...base, lineas: ["hamburguesa"], claveIdempotencia: "k4" }, 400, "lineas_invalidas"],
      ["sin líneas", { ...base, lineas: [], claveIdempotencia: "k5" }, 400, "orden_sin_productos"],
      [
        "cantidad cero",
        { ...base, lineas: [{ productoId: e.ids.hamburguesa, cantidad: 0 }], claveIdempotencia: "k6" },
        400,
        "cantidad_invalida",
      ],
      [
        "cantidad texto",
        { ...base, lineas: [{ productoId: e.ids.hamburguesa, cantidad: "dos" }], claveIdempotencia: "k7" },
        400,
        "cantidad_invalida",
      ],
      [
        "producto no numérico",
        { ...base, lineas: [{ productoId: null, cantidad: 1 }], claveIdempotencia: "k8" },
        400,
        "producto_invalido",
      ],
      [
        "nota no texto",
        { ...base, lineas: [{ productoId: e.ids.hamburguesa, cantidad: 1, nota: 5 }], claveIdempotencia: "k9" },
        400,
        "texto_invalido",
      ],
      ["indicaciones no texto", { ...base, indicaciones: 5, claveIdempotencia: "k10" }, 400, "texto_invalido"],
      ["mesa inexistente", { ...base, mesaId: 99999, claveIdempotencia: "k11" }, 404, "mesa_inexistente"],
      [
        "producto inexistente",
        { ...base, lineas: [{ productoId: 99999, cantidad: 1 }], claveIdempotencia: "k12" },
        404,
        "producto_inexistente",
      ],
    ];
    for (const [caso, cuerpo, status, codigo] of casos) {
      const res = await post(e.app, "/api/ordenes", cuerpo);
      expect(`${caso} → ${res.status} ${await codigoDe(res)}`).toBe(`${caso} → ${status} ${codigo}`);
    }

    expect((e.db.prepare("SELECT count(*) AS c FROM cuentas").get() as { c: number }).c).toBe(0);
    e.db.close();
  });
});

describe("GET /api/cuentas/:id", () => {
  it("404 si la cuenta no existe y 400 si el id no es un número", async () => {
    const e = await entornoApi();

    const inexistente = await e.app.request("/api/cuentas/9999");
    expect(inexistente.status).toBe(404);
    expect(await codigoDe(inexistente)).toBe("cuenta_inexistente");

    const invalido = await e.app.request("/api/cuentas/abc");
    expect(invalido.status).toBe(400);
    expect(await codigoDe(invalido)).toBe("id_invalido");
    e.db.close();
  });
});

describe("POST /api/cuentas/:id/nota-privada", () => {
  it("requiere sesión, actualiza la cuenta y no genera salida de cocina", async () => {
    const e = await entornoApi();
    const orden = await crearOrden(e);
    const comandasAntes = (e.db.prepare("SELECT count(*) AS c FROM comandas").get() as { c: number }).c;
    const jobsAntes = (e.db.prepare("SELECT count(*) AS c FROM print_jobs").get() as { c: number }).c;

    const sinSesion = await post(e.app, `/api/cuentas/${orden.cuentaId}/nota-privada`, {
      notaPrivada: "Cliente alérgico",
    });
    expect(sinSesion.status).toBe(403);

    const login = await post(e.app, "/api/sesion/abrir", { usuario: "admin", password: "admin" });
    expect(login.status).toBe(200);
    const guardada = await post(e.app, `/api/cuentas/${orden.cuentaId}/nota-privada`, {
      notaPrivada: "Cliente alérgico",
    });

    expect(guardada.status).toBe(200);
    expect(await guardada.json()).toEqual({ notaPrivada: "Cliente alérgico" });
    expect((await verCuenta(e.app, orden.cuentaId)).notaPrivada).toBe("Cliente alérgico");
    expect((e.db.prepare("SELECT count(*) AS c FROM comandas").get() as { c: number }).c).toBe(comandasAntes);
    expect((e.db.prepare("SELECT count(*) AS c FROM print_jobs").get() as { c: number }).c).toBe(jobsAntes);
    e.db.close();
  });
});

describe("POST /api/cuentas/:id/ordenes", () => {
  it("agrega Orden #2 a la cuenta abierta sin tocar la Orden #1", async () => {
    const e = await entornoApi();
    const primera = await crearOrden(e);

    const res = await post(e.app, `/api/cuentas/${primera.cuentaId}/ordenes`, {
      claveIdempotencia: "browser-uuid-2",
      pin: "1234",
      lineas: [{ productoId: e.ids.jugo, cantidad: 2 }],
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ cuentaId: primera.cuentaId, ordenNumero: 2, repetida: false });
    const cuenta = await verCuenta(e.app, primera.cuentaId);
    expect(cuenta.ordenes.map((o) => o.numero)).toEqual([1, 2]);
    expect(cuenta.ordenes[0].lineas[0].cantidad).toBe(2);
    expect(cuenta.totalCentavos).toBe(17800 + 5000);
    e.db.close();
  });

  it("una cuenta ya cobrada no acepta órdenes nuevas ni abre otra cuenta", async () => {
    const e = await entornoApi();
    const primera = await crearOrden(e);
    expect((await post(e.app, `/api/cuentas/${primera.cuentaId}/precuenta`, { pin: "1234" })).status).toBe(201);
    expect((await post(e.app, `/api/cuentas/${primera.cuentaId}/enviar-caja`, { pin: "2222" })).status).toBe(201);

    const res = await post(e.app, `/api/cuentas/${primera.cuentaId}/ordenes`, {
      claveIdempotencia: "browser-uuid-3",
      pin: "1234",
      lineas: [{ productoId: e.ids.jugo, cantidad: 1 }],
    });

    expect(res.status).toBe(409);
    expect(await codigoDe(res)).toBe("cuenta_cerrada");
    expect((e.db.prepare("SELECT count(*) AS c FROM cuentas").get() as { c: number }).c).toBe(1);
    e.db.close();
  });

  it("no delata si la cuenta existe antes de validar el PIN", async () => {
    const e = await entornoApi();

    const res = await post(e.app, "/api/cuentas/9999/ordenes", {
      claveIdempotencia: "browser-uuid-4",
      pin: "0000",
      lineas: [{ productoId: e.ids.jugo, cantidad: 1 }],
    });

    expect(res.status).toBe(403);
    expect(await codigoDe(res)).toBe("pin_invalido");
    e.db.close();
  });
});

describe("POST /api/ordenes/:id/correcciones", () => {
  it("baja una cantidad, cambia la nota y la cuenta refleja la versión efectiva", async () => {
    const e = await entornoApi();
    const orden = await crearOrden(e);
    const linea = (await verCuenta(e.app, orden.cuentaId)).ordenes[0].lineas[0];

    const res = await post(e.app, `/api/ordenes/${orden.ordenId}/correcciones`, {
      claveIdempotencia: "correccion-uuid-1",
      pin: "1234",
      lineas: [
        { lineaClave: linea.lineaClave, productoId: linea.productoId, cantidad: 1, nota: "sin queso" },
      ],
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ordenId: orden.ordenId, repetida: false });
    const cuenta = await verCuenta(e.app, orden.cuentaId);
    expect(cuenta.ordenes[0].estado).toBe("corregida");
    expect(cuenta.ordenes[0].lineas[0]).toMatchObject({ cantidad: 1, nota: "sin queso" });
    expect(cuenta.totalCentavos).toBe(8900);
    e.db.close();
  });

  it("repetir la clave devuelve la misma corrección", async () => {
    const e = await entornoApi();
    const orden = await crearOrden(e);
    const linea = (await verCuenta(e.app, orden.cuentaId)).ordenes[0].lineas[0];
    const cuerpo = {
      claveIdempotencia: "correccion-uuid-1",
      pin: "1234",
      lineas: [{ lineaClave: linea.lineaClave, productoId: linea.productoId, cantidad: 1 }],
    };
    const primera = (await (await post(e.app, `/api/ordenes/${orden.ordenId}/correcciones`, cuerpo)).json()) as {
      correccionId: number;
    };

    const res = await post(e.app, `/api/ordenes/${orden.ordenId}/correcciones`, cuerpo);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ correccionId: primera.correccionId, repetida: true });
    expect((e.db.prepare("SELECT count(*) AS c FROM orden_correcciones").get() as { c: number }).c).toBe(1);
    e.db.close();
  });

  it("valida el PIN antes de mirar la orden y mapea los errores de dominio", async () => {
    const e = await entornoApi();
    const orden = await crearOrden(e);
    const linea = (await verCuenta(e.app, orden.cuentaId)).ordenes[0].lineas[0];

    const sinPin = await post(e.app, `/api/ordenes/${orden.ordenId}/correcciones`, {
      claveIdempotencia: "c1",
      lineas: [{ lineaClave: linea.lineaClave, productoId: linea.productoId, cantidad: 1 }],
    });
    expect(sinPin.status).toBe(403);

    const ordenAjena = await post(e.app, "/api/ordenes/9999/correcciones", {
      claveIdempotencia: "c2",
      pin: "0000",
      lineas: [{ lineaClave: linea.lineaClave, productoId: linea.productoId, cantidad: 1 }],
    });
    expect(ordenAjena.status).toBe(403);

    const inexistente = await post(e.app, "/api/ordenes/9999/correcciones", {
      claveIdempotencia: "c3",
      pin: "1234",
      lineas: [{ lineaClave: linea.lineaClave, productoId: linea.productoId, cantidad: 1 }],
    });
    expect(inexistente.status).toBe(404);
    expect(await codigoDe(inexistente)).toBe("orden_inexistente");

    const nuevaEnCero = await post(e.app, `/api/ordenes/${orden.ordenId}/correcciones`, {
      claveIdempotencia: "c4",
      pin: "1234",
      lineas: [{ lineaClave: "inventada", productoId: e.ids.jugo, cantidad: 0 }],
    });
    expect(nuevaEnCero.status).toBe(400);
    expect(await codigoDe(nuevaEnCero)).toBe("linea_agregada_en_cero");

    const sinClave = await post(e.app, `/api/ordenes/${orden.ordenId}/correcciones`, {
      pin: "1234",
      lineas: [{ lineaClave: linea.lineaClave, productoId: linea.productoId, cantidad: 1 }],
    });
    expect(sinClave.status).toBe(400);
    expect(await codigoDe(sinClave)).toBe("clave_idempotencia_requerida");

    const sinLineaClave = await post(e.app, `/api/ordenes/${orden.ordenId}/correcciones`, {
      claveIdempotencia: "c5",
      pin: "1234",
      lineas: [{ productoId: linea.productoId, cantidad: 1 }],
    });
    expect(sinLineaClave.status).toBe(400);
    expect(await codigoDe(sinLineaClave)).toBe("linea_sin_clave");
    e.db.close();
  });
});

describe("POST /api/ordenes/:id/anular", () => {
  it("deja la orden en cero, la marca anulada y avisa a cocina", async () => {
    const e = await entornoApi();
    const orden = await crearOrden(e, {
      lineas: [
        { productoId: e.ids.hamburguesa, cantidad: 2 },
        { productoId: e.ids.jugo, cantidad: 1 },
      ],
    });

    const res = await post(e.app, `/api/ordenes/${orden.ordenId}/anular`, {
      claveIdempotencia: "anular-uuid-1",
      pin: "1234",
      motivo: "el cliente se fue",
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { correccionId: number; comandaId: number };
    const cuenta = await verCuenta(e.app, orden.cuentaId);
    expect(cuenta.ordenes[0].estado).toBe("anulada");
    expect(cuenta.totalCentavos).toBe(0);
    expect(
      (e.db.prepare("SELECT tipo FROM comandas WHERE id = ?").get(body.comandaId) as { tipo: string }).tipo,
    ).toBe("anulacion");
    e.db.close();
  });

  it("anular dos veces no revive la orden", async () => {
    const e = await entornoApi();
    const orden = await crearOrden(e);
    expect(
      (await post(e.app, `/api/ordenes/${orden.ordenId}/anular`, { claveIdempotencia: "a1", pin: "1234" })).status,
    ).toBe(201);

    const repetida = await post(e.app, `/api/ordenes/${orden.ordenId}/anular`, {
      claveIdempotencia: "a1",
      pin: "1234",
    });
    expect(repetida.status).toBe(200);
    expect(await repetida.json()).toMatchObject({ repetida: true });

    const otra = await post(e.app, `/api/ordenes/${orden.ordenId}/anular`, {
      claveIdempotencia: "a2",
      pin: "1234",
    });
    expect(otra.status).toBe(409);
    expect(await codigoDe(otra)).toBe("orden_anulada");
    expect((e.db.prepare("SELECT count(*) AS c FROM orden_correcciones").get() as { c: number }).c).toBe(1);
    e.db.close();
  });
});

describe("precuenta y caja por cuenta", () => {
  it("precuenta, corrección que la invalida, reemisión y handoff", async () => {
    const e = await entornoApi();
    const orden = await crearOrden(e);

    const precuenta = await post(e.app, `/api/cuentas/${orden.cuentaId}/precuenta`, { pin: "1234" });
    expect(precuenta.status).toBe(201);
    expect(await precuenta.json()).toMatchObject({ numero: 1, totalCentavos: 17800 });
    expect((await verCuenta(e.app, orden.cuentaId)).estado).toBe("precuenta_emitida");

    const linea = (await verCuenta(e.app, orden.cuentaId)).ordenes[0].lineas[0];
    expect(
      (
        await post(e.app, `/api/ordenes/${orden.ordenId}/correcciones`, {
          claveIdempotencia: "c1",
          pin: "1234",
          lineas: [{ lineaClave: linea.lineaClave, productoId: linea.productoId, cantidad: 1 }],
        })
      ).status,
    ).toBe(201);

    const desactualizada = await post(e.app, `/api/cuentas/${orden.cuentaId}/enviar-caja`, { pin: "2222" });
    expect(desactualizada.status).toBe(409);
    expect(await codigoDe(desactualizada)).toBe("precuenta_desactualizada");

    const segunda = await post(e.app, `/api/cuentas/${orden.cuentaId}/precuenta`, { pin: "1234" });
    expect(await segunda.json()).toMatchObject({ numero: 2, totalCentavos: 8900 });

    const caja = await post(e.app, `/api/cuentas/${orden.cuentaId}/enviar-caja`, { pin: "2222" });
    expect(caja.status).toBe(201);
    expect(await caja.json()).toMatchObject({ handoffId: expect.any(Number) });
    expect((await verCuenta(e.app, orden.cuentaId)).estado).toBe("en_caja");
    e.db.close();
  });

  it("sin precuenta emitida el handoff se frena", async () => {
    const e = await entornoApi();
    const orden = await crearOrden(e);

    const res = await post(e.app, `/api/cuentas/${orden.cuentaId}/enviar-caja`, { pin: "2222" });

    expect(res.status).toBe(400);
    expect(await codigoDe(res)).toBe("precuenta_requerida");
    expect((await verCuenta(e.app, orden.cuentaId)).estado).toBe("abierta");
    e.db.close();
  });

  it("una cuenta sin órdenes no tiene precuenta que emitir", async () => {
    const e = await entornoApi();
    const cuentaId = Number(
      e.db
        .prepare("INSERT INTO cuentas (mesa_id, estado, abierta_por_empleado_id, abierta_en) VALUES (?, 'abierta', 1, ?)")
        .run(e.ids.mesa7, new Date().toISOString()).lastInsertRowid,
    );

    const res = await post(e.app, `/api/cuentas/${cuentaId}/precuenta`, { pin: "1234" });

    expect(res.status).toBe(400);
    expect(await codigoDe(res)).toBe("cuenta_sin_consumo");
    e.db.close();
  });

  it("no delata la existencia de la cuenta antes de autorizar", async () => {
    const e = await entornoApi();
    const orden = await crearOrden(e);

    const precuentaSinAuth = await post(e.app, "/api/cuentas/9999/precuenta", { pin: "0000" });
    expect(precuentaSinAuth.status).toBe(403);
    const cajaSinAuth = await post(e.app, "/api/cuentas/9999/enviar-caja", { pin: "0000" });
    expect(cajaSinAuth.status).toBe(403);
    // El mismo id, con PIN válido, sí puede saber que no existe.
    const conAuth = await post(e.app, "/api/cuentas/9999/precuenta", { pin: "1234" });
    expect(conAuth.status).toBe(404);
    expect(await codigoDe(conAuth)).toBe("cuenta_inexistente");
    // Y una cuenta cerrada tampoco se delata a quien no tiene PIN.
    await post(e.app, `/api/cuentas/${orden.cuentaId}/precuenta`, { pin: "1234" });
    await post(e.app, `/api/cuentas/${orden.cuentaId}/enviar-caja`, { pin: "2222" });
    const cerrada = await post(e.app, `/api/cuentas/${orden.cuentaId}/precuenta`, { pin: "0000" });
    expect(cerrada.status).toBe(403);
    e.db.close();
  });
});

describe("cocina por HTTP", () => {
  it("/api/kds lista la comanda legacy y las del modelo nuevo", async () => {
    const e = await entornoApi();
    const orden = await crearOrden(e);
    const linea = (await verCuenta(e.app, orden.cuentaId)).ordenes[0].lineas[0];
    await post(e.app, `/api/ordenes/${orden.ordenId}/correcciones`, {
      claveIdempotencia: "c1",
      pin: "1234",
      lineas: [{ lineaClave: linea.lineaClave, productoId: linea.productoId, cantidad: 1 }],
    });
    const mesa1 = (e.db.prepare("SELECT id FROM mesas WHERE numero = 1").get() as { id: number }).id;
    const abrir = await post(e.app, `/api/mesas/${mesa1}/abrir`, { cubiertos: 2, pin: "1234" });
    const { pedidoId } = (await abrir.json()) as { pedidoId: number };
    await post(e.app, `/api/pedidos/${pedidoId}/lineas`, { productoId: e.ids.jugo, cantidad: 1 });
    await post(e.app, `/api/pedidos/${pedidoId}/enviar`, { pin: "1234" });

    const res = await e.app.request("/api/kds");

    expect(res.status).toBe(200);
    const { tarjetas } = (await res.json()) as {
      tarjetas: { tipo: string; referencia: string; lineas: { etapa: string; delta: number | null }[] }[];
    };
    expect(tarjetas.map((t) => t.tipo)).toEqual(["legacy", "correccion", "orden"]);
    expect(tarjetas.map((t) => t.referencia)).toEqual([
      "Mesa #1 · Orden #1",
      "Mesa #7 · Orden #1 · Corrección #1",
      "Mesa #7 · Orden #1",
    ]);
    expect(tarjetas[1].lineas[0]).toMatchObject({ etapa: "aviso", delta: -1 });
    e.db.close();
  });

  it("avanza la etapa de una línea y protege avisos y etapas terminales", async () => {
    const e = await entornoApi();
    const orden = await crearOrden(e);
    const linea = (await verCuenta(e.app, orden.cuentaId)).ordenes[0].lineas[0];
    await post(e.app, `/api/ordenes/${orden.ordenId}/correcciones`, {
      claveIdempotencia: "c1",
      pin: "1234",
      lineas: [{ lineaClave: linea.lineaClave, productoId: linea.productoId, cantidad: 1 }],
    });
    const { tarjetas } = (await (await e.app.request("/api/kds")).json()) as {
      tarjetas: { tipo: string; lineas: { id: number; etapa: string }[] }[];
    };
    const tarea = tarjetas.filter((t) => t.tipo === "orden")[0].lineas[0];
    const aviso = tarjetas.filter((t) => t.tipo === "correccion")[0].lineas[0];

    const ok = await post(e.app, `/api/kds/lineas/${tarea.id}/etapa`, { etapa: "en_proceso" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ etapa: "en_proceso" });

    const sobreAviso = await post(e.app, `/api/kds/lineas/${aviso.id}/etapa`, { etapa: "en_proceso" });
    expect(sobreAviso.status).toBe(409);
    expect(await codigoDe(sobreAviso)).toBe("etapa_no_avanzable");

    expect((await post(e.app, `/api/kds/lineas/${tarea.id}/etapa`, { etapa: "listo" })).status).toBe(200);
    const terminal = await post(e.app, `/api/kds/lineas/${tarea.id}/etapa`, { etapa: "servido" });
    expect(terminal.status).toBe(409);

    const invalida = await post(e.app, `/api/kds/lineas/${tarea.id}/etapa`, { etapa: "inventada" });
    expect(invalida.status).toBe(400);
    expect(await codigoDe(invalida)).toBe("etapa_invalida");

    const inexistente = await post(e.app, "/api/kds/lineas/99999/etapa", { etapa: "en_proceso" });
    expect(inexistente.status).toBe(404);
    e.db.close();
  });
});

describe("adaptadores legacy", () => {
  it("las mutaciones legacy siguen funcionando, avisan que están obsoletas y no escriben cuentas", async () => {
    const e = await entornoApi();
    const mesa1 = (e.db.prepare("SELECT id FROM mesas WHERE numero = 1").get() as { id: number }).id;

    const abrir = await post(e.app, `/api/mesas/${mesa1}/abrir`, { cubiertos: 2, pin: "1234" });
    expect(abrir.status).toBe(200);
    expect(abrir.headers.get("deprecation")).toBe("true");
    expect(abrir.headers.get("link")).toContain("/api/ordenes");
    const { pedidoId } = (await abrir.json()) as { pedidoId: number };

    const agregar = await post(e.app, `/api/pedidos/${pedidoId}/lineas`, { productoId: e.ids.jugo, cantidad: 2 });
    expect(agregar.headers.get("deprecation")).toBe("true");
    const enviar = await post(e.app, `/api/pedidos/${pedidoId}/enviar`, { pin: "1234" });
    expect(enviar.status).toBe(200);
    expect(enviar.headers.get("deprecation")).toBe("true");
    const precuenta = await post(e.app, `/api/pedidos/${pedidoId}/precuenta`, { pin: "1234" });
    expect(precuenta.status).toBe(200);
    expect(precuenta.headers.get("link")).toContain("/api/cuentas/:id/precuenta");
    const caja = await post(e.app, `/api/pedidos/${pedidoId}/enviar-caja`, { pin: "2222" });
    expect(caja.status).toBe(200);
    expect(caja.headers.get("link")).toContain("/api/cuentas/:id/enviar-caja");

    // Sin escritura doble: el circuito legacy no inventa cuentas ni órdenes.
    expect((e.db.prepare("SELECT count(*) AS c FROM cuentas").get() as { c: number }).c).toBe(0);
    expect((e.db.prepare("SELECT count(*) AS c FROM ordenes").get() as { c: number }).c).toBe(0);
    e.db.close();
  });

  it("las lecturas legacy no llevan aviso de deprecación", async () => {
    const e = await entornoApi();

    const mesas = await e.app.request("/api/mesas");
    expect(mesas.status).toBe(200);
    expect(mesas.headers.get("deprecation")).toBeNull();
    e.db.close();
  });

  it("en-proceso legacy delega en la etapa protegida", async () => {
    const e = await entornoApi();
    const mesa1 = (e.db.prepare("SELECT id FROM mesas WHERE numero = 1").get() as { id: number }).id;
    const abrir = await post(e.app, `/api/mesas/${mesa1}/abrir`, { cubiertos: 2, pin: "1234" });
    const { pedidoId } = (await abrir.json()) as { pedidoId: number };
    const agregar = await post(e.app, `/api/pedidos/${pedidoId}/lineas`, { productoId: e.ids.jugo, cantidad: 1 });
    const { lineaId } = (await agregar.json()) as { lineaId: number };
    await post(e.app, `/api/pedidos/${pedidoId}/enviar`, { pin: "1234" });

    const res = await post(e.app, `/api/lineas/${lineaId}/en-proceso`);
    expect(res.status).toBe(200);
    expect(res.headers.get("deprecation")).toBe("true");

    e.db.prepare("UPDATE comanda_lineas SET etapa = 'listo' WHERE pedido_linea_id = ?").run(lineaId);
    const terminal = await post(e.app, `/api/lineas/${lineaId}/en-proceso`);
    expect(terminal.status).toBe(409);

    const sinComanda = await post(e.app, "/api/lineas/99999/en-proceso");
    expect(sinComanda.status).toBe(404);
    e.db.close();
  });
});
