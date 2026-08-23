import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig, normalizarConfig, type AppConfig } from "../src/config.ts";
import { createApp } from "../src/http/app.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { agregarLinea, guardarNotasPedido, vistaPreviaComanda } from "../src/modules/pedidos/pedidos.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { abrirMesa } from "../src/modules/salon/salon.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { codigoDe, crearOrden, entornoApi, openTestDb, post, verCuenta } from "./helpers.ts";

describe("opciones API", () => {
  it("guarda nombre y tipografía en config.json", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rest-opt-"));
    const db = openTestDb();
    const config = defaultConfig();
    const app = createApp({ db, config, printer: new MemoryPrinter(), dataDir: dir });
    const res = await app.request("/api/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre_local: "La Mesa", tipografia: "serif", pin_habilitado: false }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { nombre_local: string; pin_al_enviar: boolean; tipografia: string };
    expect(body.nombre_local).toBe("La Mesa");
    expect(body.tipografia).toBe("serif");
    expect(body.pin_al_enviar).toBe(false);
    db.close();
  });

  it("precuenta obligatoria antes de caja se guarda y se expone", async () => {
    const db = openTestDb();
    const config = defaultConfig();
    const app = createApp({ db, config, printer: new MemoryPrinter() });
    expect(((await (await app.request("/api/config")).json()) as { precuenta_obligatoria_antes_de_caja: boolean })
      .precuenta_obligatoria_antes_de_caja).toBe(true);
    const res = await app.request("/api/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ precuenta_obligatoria_antes_de_caja: false }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { precuenta_obligatoria_antes_de_caja: boolean }).precuenta_obligatoria_antes_de_caja).toBe(false);
    db.close();
  });

  it("preview de comanda no incluye nota privada; anular sin PIN falla", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    await crearEmpleado(db, { nombre: "Jefa", pin: "2222", derecho: "avanzado", usuario: "admin", password: "admin" });
    const { pedidoId } = abrirMesa(db, { mesaId: ids.mesa7, cubiertos: 4, preset: "salon", meseroId: 1 });
    const { lineaId } = agregarLinea(db, pedidoId, { productoId: ids.hamburguesa, cantidad: 1, nota: "sin cebolla" });
    guardarNotasPedido(db, pedidoId, { nota_privada: "secreto", indicaciones: "servir junto" });
    const preview = vistaPreviaComanda(db, pedidoId, "Ana");
    expect(preview.texto).toContain("COMANDA");
    expect(preview.texto).toContain("sin cebolla");
    expect(preview.texto).toContain("servir junto");
    expect(preview.texto).not.toContain("secreto");

    const app = createApp({ db, config: defaultConfig(), printer: new MemoryPrinter() });
    await app.request("/api/sesion/abrir", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usuario: "admin", password: "admin" }),
    });
    const no = await app.request(`/api/lineas/${lineaId}/quitar`, { method: "POST" });
    expect(no.status).toBe(403);
    const si = await app.request(`/api/lineas/${lineaId}/quitar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "1234" }),
    });
    expect(si.status).toBe(200);
    db.close();
  });

  it("expone y normaliza auditoría de anulaciones", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rest-opt-"));
    const db = openTestDb();
    const config = defaultConfig();
    const app = createApp({ db, config, printer: new MemoryPrinter(), dataDir: dir });

    const get = await app.request("/api/config");
    const inicial = (await get.json()) as { auditoria_anulaciones: boolean; justificacion_anulacion: boolean };
    expect(inicial.auditoria_anulaciones).toBe(false);
    expect(inicial.justificacion_anulacion).toBe(false);

    const res = await app.request("/api/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ auditoria_anulaciones: true, justificacion_anulacion: true }),
    });
    const body = (await res.json()) as { auditoria_anulaciones: boolean; justificacion_anulacion: boolean };
    expect(body.auditoria_anulaciones).toBe(true);
    expect(body.justificacion_anulacion).toBe(true);

    const res2 = await app.request("/api/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ auditoria_anulaciones: false, justificacion_anulacion: true }),
    });
    const body2 = (await res2.json()) as { auditoria_anulaciones: boolean; justificacion_anulacion: boolean };
    expect(body2.auditoria_anulaciones).toBe(false);
    expect(body2.justificacion_anulacion).toBe(false);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Las opciones que cambian el contrato de la API de cuentas y órdenes.
// ---------------------------------------------------------------------------

describe("opciones y API de órdenes", () => {
  it("con el PIN apagado la orden la firma el administrador de la sesión", async () => {
    const e = await entornoApi(normalizarConfig({ ...defaultConfig(), pin_habilitado: false }));

    const sinSesion = await post(e.app, "/api/ordenes", {
      mesaId: e.ids.mesa7,
      claveIdempotencia: "sin-sesion",
      lineas: [{ productoId: e.ids.jugo, cantidad: 1 }],
    });
    expect(sinSesion.status).toBe(403);
    expect(await codigoDe(sinSesion)).toBe("credenciales_invalidas");

    await post(e.app, "/api/sesion/abrir", { usuario: "admin", password: "admin" });
    const res = await post(e.app, "/api/ordenes", {
      mesaId: e.ids.mesa7,
      claveIdempotencia: "con-sesion",
      lineas: [{ productoId: e.ids.jugo, cantidad: 1 }],
    });

    expect(res.status).toBe(201);
    const { ordenId } = (await res.json()) as { ordenId: number };
    const empleado = e.db
      .prepare(
        "SELECT e.nombre FROM ordenes o JOIN empleados e ON e.id = o.creada_por_empleado_id WHERE o.id = ?",
      )
      .get(ordenId) as { nombre: string };
    expect(empleado.nombre).toBe("Jefa");
    e.db.close();
  });

  it("con precuenta opcional el handoff cierra la cuenta sin documento previo", async () => {
    const cfg: AppConfig = { ...defaultConfig(), precuenta_obligatoria_antes_de_caja: false };
    const e = await entornoApi(cfg);
    const orden = await crearOrden(e);

    const res = await post(e.app, `/api/cuentas/${orden.cuentaId}/enviar-caja`, { pin: "2222" });

    expect(res.status).toBe(201);
    expect((await verCuenta(e.app, orden.cuentaId)).estado).toBe("en_caja");
    e.db.close();
  });

  it("enviar_a_caja_requiere_avanzado decide qué PIN cierra el servicio", async () => {
    const exigente = await entornoApi();
    const orden = await crearOrden(exigente);
    await post(exigente.app, `/api/cuentas/${orden.cuentaId}/precuenta`, { pin: "1234" });
    const negado = await post(exigente.app, `/api/cuentas/${orden.cuentaId}/enviar-caja`, { pin: "1234" });
    expect(negado.status).toBe(403);
    expect(await codigoDe(negado)).toBe("sin_derecho");
    exigente.db.close();

    const relajado = await entornoApi({ ...defaultConfig(), enviar_a_caja_requiere_avanzado: false });
    const otra = await crearOrden(relajado);
    await post(relajado.app, `/api/cuentas/${otra.cuentaId}/precuenta`, { pin: "1234" });
    const basico = await post(relajado.app, `/api/cuentas/${otra.cuentaId}/enviar-caja`, { pin: "1234" });
    expect(basico.status).toBe(201);
    const minimo = await post(relajado.app, `/api/cuentas/${otra.cuentaId}/enviar-caja`, { pin: "3333" });
    expect(minimo.status).toBe(403);
    relajado.db.close();
  });

  it("con auditoría y justificación obligatoria, anular sin motivo se rechaza", async () => {
    const e = await entornoApi(
      normalizarConfig({ ...defaultConfig(), auditoria_anulaciones: true, justificacion_anulacion: true }),
    );
    const orden = await crearOrden(e);

    const sinMotivo = await post(e.app, `/api/ordenes/${orden.ordenId}/anular`, {
      claveIdempotencia: "a1",
      pin: "1234",
    });
    expect(sinMotivo.status).toBe(400);
    expect(await codigoDe(sinMotivo)).toBe("justificacion_requerida");

    const conMotivo = await post(e.app, `/api/ordenes/${orden.ordenId}/anular`, {
      claveIdempotencia: "a2",
      pin: "1234",
      motivo: "producto agotado",
    });
    expect(conMotivo.status).toBe(201);
    const auditoria = e.db
      .prepare("SELECT orden_numero, resumen, justificacion FROM auditoria_anulaciones")
      .all() as { orden_numero: number; resumen: string; justificacion: string }[];
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]).toMatchObject({ orden_numero: 1, justificacion: "producto agotado" });
    expect(auditoria[0].resumen).toContain("Orden anulada");
    e.db.close();
  });
});
