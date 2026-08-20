import type Database from "better-sqlite3";
import { Hono } from "hono";
import { saveConfig, type AppConfig } from "../config.ts";
import { CajaError, enviarACaja } from "../modules/caja/caja.ts";
import { listarPlugins, mensajesVacios } from "../modules/complementos/complementos.ts";
import { PinError, probarPin } from "../modules/empleados/empleados.ts";
import { abrirSesion, cerrarSesion, sesionAbierta } from "../modules/empleados/sesion.ts";
import { avanzarEtapa } from "../modules/kds/kds.ts";
import {
  agregarLinea,
  cambiarCantidad,
  enviarACocina,
  listarPedidosEnCurso,
  PedidoError,
  quitarLinea,
  sePuedeEditarLinea,
} from "../modules/pedidos/pedidos.ts";
import { emitirPrecuenta, reimprimirPrecuenta } from "../modules/precuenta/precuenta.ts";
import { armableDeProducto } from "../modules/productos/productos.ts";
import { abrirMesa, abrirTab, asignarMesa, estadoMesa, pedidoIdAbierto, SalonError } from "../modules/salon/salon.ts";
import { despacharJobs } from "../print/queue.ts";
import type { PrinterPort } from "../print/types.ts";

export type AppDeps = {
  db: Database.Database;
  config: AppConfig;
  printer: PrinterPort;
  dataDir?: string;
};

function codigoStatus(err: unknown): number {
  if (err instanceof PinError) return 403;
  if (err instanceof SalonError || err instanceof CajaError || err instanceof PedidoError) return 400;
  return 500;
}

function codigoDe(err: unknown): string {
  if (err instanceof PinError || err instanceof SalonError || err instanceof CajaError || err instanceof PedidoError) {
    return err.codigo;
  }
  return "error";
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const { db, config, printer, dataDir } = deps;

  app.onError((err, c) => {
    const status = codigoStatus(err);
    const message = err instanceof Error ? err.message : "error";
    return c.json({ error: message, codigo: codigoDe(err) }, status as 400 | 403 | 500);
  });

  app.get("/api/salud", (c) => c.json({ ok: true }));

  app.get("/api/sesion", (c) => {
    const s = sesionAbierta(db);
    if (!s) return c.json({ abierta: false, administrador: null });
    return c.json({ abierta: true, administrador: s.administrador });
  });

  app.post("/api/sesion/abrir", async (c) => {
    const body = await c.req.json<{ usuario?: string; password?: string }>();
    const s = await abrirSesion(db, { usuario: body.usuario ?? "", password: body.password ?? "" });
    return c.json({ abierta: true, administrador: s.administrador });
  });

  app.post("/api/sesion/cerrar", (c) => {
    cerrarSesion(db);
    return c.json({ abierta: false, administrador: null });
  });

  app.get("/api/complementos", (c) => c.json({ plugins: listarPlugins(), mensajes: mensajesVacios() }));

  app.get("/api/empleados", (c) => {
    const rows = db.prepare("SELECT id, nombre, derecho, activo FROM empleados WHERE activo = 1").all();
    return c.json({ empleados: rows });
  });

  app.get("/api/mesas", (c) => {
    const rows = db
      .prepare("SELECT id, piso_id, numero, asientos, activa, pos_x, pos_y, forma, ancho, alto FROM mesas WHERE activa = 1")
      .all() as {
      id: number;
      piso_id: number;
      numero: number;
      asientos: number;
      activa: number;
      pos_x: number;
      pos_y: number;
      forma: string;
      ancho: number;
      alto: number;
    }[];
    return c.json({
      mesas: rows.map((m) => ({ ...m, estado: estadoMesa(db, m.id), pedidoId: pedidoIdAbierto(db, m.id) })),
      pisos: db.prepare("SELECT id, nombre, CASE WHEN fondo_blob IS NULL THEN 0 ELSE 1 END AS tiene_fondo FROM pisos").all(),
    });
  });

  app.get("/api/carta", (c) => {
    const rows = db
      .prepare(
        "SELECT id, nombre, precio_centavos, categoria_id, tipo_consumo FROM productos WHERE activo = 1 AND disponible_en_pos = 1",
      )
      .all() as { id: number; nombre: string; precio_centavos: number; categoria_id: number; tipo_consumo: string }[];
    return c.json({
      productos: rows.map((p) => ({ ...p, armable: armableDeProducto(db, p.id) })),
    });
  });

  app.get("/api/config", (c) => c.json({ tablet_cocina: config.tablet_cocina, pin_al_enviar: config.pin_al_enviar }));

  app.post("/api/config", async (c) => {
    const body = await c.req.json<{ tablet_cocina?: boolean }>();
    if (typeof body.tablet_cocina === "boolean") config.tablet_cocina = body.tablet_cocina;
    if (dataDir) saveConfig(dataDir, config);
    return c.json({ tablet_cocina: config.tablet_cocina, pin_al_enviar: config.pin_al_enviar });
  });

  app.get("/api/pisos/:id/fondo", (c) => {
    const row = db.prepare("SELECT fondo_mime, fondo_blob FROM pisos WHERE id = ?").get(Number(c.req.param("id"))) as
      | { fondo_mime: string | null; fondo_blob: Buffer | null }
      | undefined;
    if (!row?.fondo_blob) return c.body(null, 404);
    return new Response(new Uint8Array(row.fondo_blob), { headers: { "content-type": row.fondo_mime || "image/jpeg" } });
  });

  app.post("/api/pisos/:id/fondo", async (c) => {
    const body = await c.req.json<{ dataUrl: string }>();
    const m = /^data:([^;]+);base64,(.+)$/.exec(body.dataUrl ?? "");
    if (!m) return c.json({ error: "imagen inválida", codigo: "imagen_invalida" }, 400);
    const blob = Buffer.from(m[2], "base64");
    db.prepare("UPDATE pisos SET fondo_mime = ?, fondo_blob = ? WHERE id = ?").run(m[1], blob, Number(c.req.param("id")));
    return c.json({ ok: true });
  });

  app.get("/api/kds", (c) => {
    const tarjetas = db
      .prepare(
        `SELECT c.id, c.pedido_id, c.envio_n, e.nombre AS mesero, m.numero AS mesa
         FROM comandas c
         JOIN empleados e ON e.id = c.mesero_id
         LEFT JOIN pedidos p ON p.id = c.pedido_id
         LEFT JOIN mesas m ON m.id = p.mesa_id
         ORDER BY c.id DESC`,
      )
      .all();
    return c.json({ tarjetas });
  });

  app.get("/api/pedidos", (c) => c.json({ pedidos: listarPedidosEnCurso(db, config) }));

  app.post("/api/pedidos", async (c) => {
    const body = await c.req.json<{ cubiertos?: number }>().catch(() => ({ cubiertos: 1 }));
    const s = sesionAbierta(db);
    if (!s) throw new PinError("credenciales_invalidas", "Hace falta sesión");
    return c.json(abrirTab(db, { cubiertos: body.cubiertos || 1, preset: "salon", meseroId: s.administrador.id }));
  });

  app.post("/api/pedidos/:id/asignar-mesa", async (c) => {
    const body = await c.req.json<{ mesaId: number }>();
    asignarMesa(db, Number(c.req.param("id")), body.mesaId);
    return c.json({ ok: true });
  });

  app.post("/api/lineas/:id/quitar", async (c) => {
    quitarLinea(db, Number(c.req.param("id")), config);
    await despacharJobs(db, printer);
    return c.json({ ok: true });
  });

  app.post("/api/lineas/:id/cantidad", async (c) => {
    const body = await c.req.json<{ cantidad: number }>();
    cambiarCantidad(db, Number(c.req.param("id")), body.cantidad, config);
    return c.json({ ok: true });
  });

  app.post("/api/lineas/:id/en-proceso", (c) => {
    const cl = db.prepare("SELECT id FROM comanda_lineas WHERE pedido_linea_id = ?").get(Number(c.req.param("id"))) as
      | { id: number }
      | undefined;
    if (!cl) return c.json({ error: "no encontrado", codigo: "no_encontrado" }, 404);
    avanzarEtapa(db, cl.id, "en_proceso");
    return c.json({ ok: true });
  });

  app.get("/api/pedidos/:id", (c) => {
    const id = Number(c.req.param("id"));
    const pedido = db.prepare("SELECT id, mesa_id, preset, cubiertos, estado, mesero_id FROM pedidos WHERE id = ?").get(id);
    if (!pedido) return c.json({ error: "no encontrado", codigo: "no_encontrado" }, 404);
    const lineas = db
      .prepare(
        `SELECT pl.id, pl.producto_id, pl.cantidad, pl.nota, pl.estado, pl.precio_centavos, p.nombre
         FROM pedido_lineas pl JOIN productos p ON p.id = pl.producto_id
         WHERE pl.pedido_id = ? AND pl.estado NOT LIKE 'anulada%'`,
      )
      .all(id) as { id: number; producto_id: number; cantidad: number; nota: string | null; estado: string; precio_centavos: number; nombre: string }[];
    return c.json({
      pedido,
      lineas: lineas.map((l) => ({ ...l, sePuedeEditar: sePuedeEditarLinea(db, l.id, config) })),
    });
  });

  app.post("/api/mesas/:id/abrir", async (c) => {
    const body = await c.req.json<{ cubiertos?: number; pin?: string }>();
    let meseroId: number;
    if (body.pin) {
      const mesero = await probarPin(db, body.pin);
      if (!mesero) throw new PinError("pin_invalido", "PIN incorrecto");
      meseroId = mesero.id;
    } else {
      const s = sesionAbierta(db);
      if (!s) throw new PinError("credenciales_invalidas", "Hace falta sesión");
      meseroId = s.administrador.id;
    }
    const result = abrirMesa(db, {
      mesaId: Number(c.req.param("id")),
      cubiertos: body.cubiertos || 4,
      preset: "salon",
      meseroId,
    });
    return c.json(result);
  });

  app.post("/api/pedidos/:id/lineas", async (c) => {
    const body = await c.req.json<{ productoId: number; cantidad: number; nota?: string }>();
    const result = agregarLinea(db, Number(c.req.param("id")), body);
    return c.json(result);
  });

  app.post("/api/pedidos/:id/enviar", async (c) => {
    const body = await c.req.json<{ pin: string }>();
    const result = await enviarACocina(db, Number(c.req.param("id")), body.pin, printer, config);
    return c.json(result);
  });

  app.post("/api/pedidos/:id/precuenta", async (c) => {
    const body = await c.req.json<{ pin?: string }>();
    const result = await emitirPrecuenta(db, Number(c.req.param("id")), body.pin, printer, config);
    return c.json(result);
  });

  app.post("/api/precuentas/:id/reimprimir", async (c) => {
    const result = await reimprimirPrecuenta(db, Number(c.req.param("id")), printer);
    return c.json(result);
  });

  app.post("/api/pedidos/:id/enviar-caja", async (c) => {
    const body = await c.req.json<{ pin?: string }>();
    const result = await enviarACaja(db, Number(c.req.param("id")), body.pin, config);
    return c.json(result);
  });

  return app;
}
