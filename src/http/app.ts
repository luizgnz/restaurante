import type Database from "better-sqlite3";
import { Hono, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { networkInterfaces } from "node:os";
import { saveConfig, normalizarConfig, type AppConfig, type ImpresoraRedConfig } from "../config.ts";
import { CajaError, enviarACaja } from "../modules/caja/caja.ts";
import { listarPlugins, mensajesVacios } from "../modules/complementos/complementos.ts";
import { ContornoError, configurarSlots, slotsDeProducto } from "../modules/contornos/contornos.ts";
import { CuentaError } from "../modules/cuentas/cuentas.ts";
import {
  actualizarUsuario,
  crearEmpleado,
  EmpleadoError,
  listarUsuarios,
  PinError,
  ROLES,
  exigirPin,
  type RolClave,
} from "../modules/empleados/empleados.ts";
import {
  abrirSesionUsuario,
  cerrarSesion,
  cerrarSesionUsuario,
  cerrarTodasSesionesUsuario,
  sesionAbierta,
  sesionUsuarioPorToken,
  type UsuarioSesion,
} from "../modules/empleados/sesion.ts";
import { avanzarEtapa, KdsError, tarjetasKds } from "../modules/kds/kds.ts";
import {
  aceptarSugerencia,
  crearIncidenciaCocina,
  IncidenciaCocinaError,
  listarIncidenciasMesero,
  marcarIncidenciaEliminada,
  prepararEliminacion,
  prepararSustitucion,
} from "../modules/kds/incidencias.ts";
import {
  registrarEntradaInventario,
  registrarPerdidaInventario,
  listarInventario,
  type MotivoPerdidaInventario,
} from "../modules/inventario/gestion.ts";
import { InventarioError } from "../modules/inventario/asientos.ts";
import { corregirOrden, CorreccionError } from "../modules/ordenes/correcciones.ts";
import { OrdenError } from "../modules/ordenes/enviar.ts";
import { PrecuentaError } from "../modules/precuenta/precuenta.ts";
import { idDeRuta, leerJson, SolicitudError, textoRequerido } from "./entrada.ts";
import { rutasContornos } from "./rutas/contornos.ts";
import { rutasCuentas } from "./rutas/cuentas.ts";
import { rutasOrdenes } from "./rutas/ordenes.ts";
import {
  agregarLinea,
  cambiarCantidad,
  enviarACocina,
  guardarNotaLinea,
  guardarNotasPedido,
  listarPedidosEnCurso,
  PedidoError,
  quitarLinea,
  sePuedeEditarLinea,
  vistaPreviaComanda,
} from "../modules/pedidos/pedidos.ts";
import { emitirPrecuenta, reimprimirPrecuenta } from "../modules/precuenta/precuenta.ts";
import { armableDeProducto, crearCategoria, crearProducto, guardarReceta, listarCategorias, listarProductos, ProductoError, recetaDeProducto, type LineaRecetaInput } from "../modules/productos/productos.ts";
import { cuentaActivaPorMesa } from "../modules/cuentas/cuentas.ts";
import {
  abrirMesa,
  abrirTab,
  asignarMesa,
  estadoMesa,
  guardarPlano,
  limpiarPedidosSinMesa,
  SalonError,
} from "../modules/salon/salon.ts";
import { despacharJobs } from "../print/queue.ts";
import { diagnosticarImpresora, enviarAImpresoraRed, textoPrueba } from "../print/network.ts";
import type { PrinterPort } from "../print/types.ts";

export type AppDeps = {
  db: Database.Database;
  config: AppConfig;
  printer: PrinterPort;
  dataDir?: string;
  exigirAutenticacion?: boolean;
};

type AppVariables = { usuario: UsuarioSesion | null };
const COOKIE_SESION = "restaurante_sesion";

function tieneRol(usuario: UsuarioSesion, permitidos: RolClave[]): boolean {
  return usuario.roles.includes("administrador") || permitidos.some((rol) => usuario.roles.includes(rol));
}

function rolesDeRuta(pathname: string, method: string): RolClave[] | null {
  if (pathname === "/api/salud" || pathname === "/api/sesion" || pathname === "/api/sesion/abrir") return null;
  if (pathname.startsWith("/api/usuarios")) return ["administrador"];
  if (pathname.startsWith("/api/empleados")) return ["administrador"];
  if (pathname.startsWith("/api/impresoras") || pathname.startsWith("/api/impresion")) return ["administrador"];
  if (pathname.startsWith("/api/red/")) return ["administrador"];
  if (pathname === "/api/config") return method === "GET" ? [] : ["administrador"];
  if (pathname === "/api/productos" && method === "GET") return ["administrador"];
  if (pathname === "/api/productos" && method !== "GET") return ["administrador"];
  if (/^\/api\/productos\/\d+\/receta$/.test(pathname)) return ["administrador"];
  if (/^\/api\/productos\/\d+\/slots$/.test(pathname)) return method === "GET" ? ["mesero", "administrador"] : ["administrador"];
  if (pathname.startsWith("/api/categorias")) return method === "GET" ? ["mesero", "administrador"] : ["administrador"];
  if (pathname.startsWith("/api/contornos")) return method === "GET" ? ["mesero", "administrador"] : ["administrador"];
  if (pathname === "/api/plano" || pathname.startsWith("/api/pisos/")) return method === "GET" ? ["mesero", "administrador"] : ["administrador"];
  if (pathname === "/api/kds" || pathname.startsWith("/api/kds/")) return ["cocina", "administrador"];
  if (pathname === "/api/cocina/incidencias") return method === "GET" ? ["mesero", "administrador"] : ["cocina", "administrador"];
  if (pathname.startsWith("/api/cocina/incidencias/")) return ["mesero", "administrador"];
  if (pathname.startsWith("/api/inventario")) return method === "GET" ? [] : ["administrador"];
  if (pathname === "/api/carta") return ["mesero", "cocina", "administrador"];
  if (pathname.startsWith("/api/cuentas")) {
    if (pathname.endsWith("/ordenes") || pathname.endsWith("/nota-privada")) return ["mesero", "administrador"];
    return ["mesero", "caja", "administrador"];
  }
  if (pathname.startsWith("/api/ordenes") || pathname.startsWith("/api/pedidos") || pathname.startsWith("/api/lineas") || pathname.startsWith("/api/mesas")) {
    return ["mesero", "administrador"];
  }
  if (pathname.startsWith("/api/precuentas")) return ["mesero", "caja", "administrador"];
  return [];
}

type StatusError = 400 | 403 | 404 | 409 | 500;

/** El recurso que la ruta o el cuerpo nombraba no existe. */
const CODIGOS_404 = new Set([
  "cuenta_inexistente",
  "orden_inexistente",
  "precuenta_inexistente",
  "linea_inexistente",
  "mesa_inexistente",
  "producto_inexistente",
  "empleado_inexistente",
  "variante_inexistente",
  "grupo_inexistente",
  "incidencia_inexistente",
]);

/** Existe, pero su estado actual no admite la operación. */
const CODIGOS_409 = new Set([
  "cuenta_cerrada",
  "orden_anulada",
  "precuenta_desactualizada",
  "etapa_no_avanzable",
  "incidencia_pendiente",
  "incidencia_resuelta",
  "producto_ya_iniciado",
  "orden_ya_iniciada",
  "stock_insuficiente",
]);

function statusPorCodigo(codigo: string): StatusError {
  if (CODIGOS_404.has(codigo)) return 404;
  if (CODIGOS_409.has(codigo)) return 409;
  return 400;
}

/**
 * Un error de dominio nunca es un 500: el cliente pidió algo que el negocio no
 * permite y necesita saber qué.
 *
 * Las clases del modelo nuevo distinguen 404 y 409 por código. Las del flujo
 * legacy siguen respondiendo 400 como siempre, para no cambiarle el contrato a
 * una UI que todavía está en transición.
 */
function codigoStatus(err: unknown): StatusError {
  if (err instanceof PinError) return 403;
  if (
    err instanceof CuentaError ||
    err instanceof OrdenError ||
    err instanceof CorreccionError ||
    err instanceof PrecuentaError ||
    err instanceof CajaError ||
    err instanceof KdsError ||
    err instanceof IncidenciaCocinaError ||
    err instanceof ContornoError ||
    err instanceof InventarioError ||
    err instanceof EmpleadoError
  ) {
    return statusPorCodigo(err.codigo);
  }
  if (
    err instanceof SolicitudError ||
    err instanceof SalonError ||
    err instanceof PedidoError ||
    err instanceof ProductoError
  ) {
    return 400;
  }
  return 500;
}

function codigoDe(err: unknown): string {
  if (
    err instanceof PinError ||
    err instanceof SalonError ||
    err instanceof CajaError ||
    err instanceof PedidoError ||
    err instanceof ProductoError ||
    err instanceof CuentaError ||
    err instanceof OrdenError ||
    err instanceof CorreccionError ||
    err instanceof PrecuentaError ||
    err instanceof KdsError ||
    err instanceof IncidenciaCocinaError ||
    err instanceof ContornoError ||
    err instanceof InventarioError ||
    err instanceof EmpleadoError ||
    err instanceof SolicitudError
  ) {
    return err.codigo;
  }
  return "error";
}

/**
 * Marca una ruta del modelo anterior sin apagarla. La UI sigue funcionando y el
 * encabezado dice adónde mudarse; nada de esto escribe en el modelo nuevo, así
 * que no hay doble escritura que reconciliar después.
 */
function deprecado(sucesor: string): MiddlewareHandler {
  return async (c, next) => {
    c.header("Deprecation", "true");
    c.header("Link", `<${sucesor}>; rel="successor-version"`);
    await next();
  };
}

const LOGO_MAX = 400 * 1024;

function configPublica(config: AppConfig) {
  return {
    tablet_cocina: config.tablet_cocina,
    pin_al_enviar: config.pin_al_enviar,
    barra_ultimos_pedidos: config.barra_ultimos_pedidos,
    barra_atrasados: config.barra_atrasados,
    nombre_local: config.nombre_local,
    logo_data: config.logo_data,
    tipografia: config.tipografia,
    tamano_ui: config.tamano_ui,
    pin_habilitado: config.pin_habilitado,
    pin_momento: config.pin_momento,
    confirmar_comanda: config.confirmar_comanda,
    pin_al_anular: config.pin_al_anular,
    auditoria_anulaciones: config.auditoria_anulaciones,
    justificacion_anulacion: config.justificacion_anulacion,
    precuenta_obligatoria_antes_de_caja: config.precuenta_obligatoria_antes_de_caja,
    enviar_a_caja_requiere_avanzado: config.enviar_a_caja_requiere_avanzado,
    impresora_comanda: config.impresora_comanda,
    impresora_boleta: config.impresora_boleta,
    plantilla_comanda: config.plantilla_comanda,
    plantilla_boleta: config.plantilla_boleta,
    servidor_red_habilitado: config.servidor_red_habilitado,
    nombre_servidor: config.nombre_servidor,
  };
}

function impresoraValida(valor: unknown, anterior: ImpresoraRedConfig): ImpresoraRedConfig {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
    throw new SolicitudError("impresora_invalida", "La configuración de impresora no es válida");
  }
  const entrada = valor as Partial<ImpresoraRedConfig>;
  const puerto = entrada.puerto ?? anterior.puerto;
  const ancho = entrada.ancho_mm ?? anterior.ancho_mm;
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    throw new SolicitudError("puerto_invalido", "El puerto de la impresora debe estar entre 1 y 65535");
  }
  if (ancho !== 58 && ancho !== 80) throw new SolicitudError("ancho_invalido", "El papel debe ser de 58 u 80 mm");
  return {
    habilitada: entrada.habilitada ?? anterior.habilitada,
    nombre: typeof entrada.nombre === "string" ? entrada.nombre.trim().slice(0, 60) : anterior.nombre,
    host: typeof entrada.host === "string" ? entrada.host.trim().slice(0, 255) : anterior.host,
    puerto,
    ancho_mm: ancho,
  };
}

function urlsDeRed(puerto: number, habilitado: boolean): string[] {
  if (!habilitado) return [];
  const ips = Object.values(networkInterfaces()).flatMap((interfaces) => interfaces ?? [])
    .filter((interfaz) => interfaz.family === "IPv4" && !interfaz.internal)
    .map((interfaz) => interfaz.address);
  return [...new Set(ips)].map((ip) => `http://${ip}:${puerto}`);
}

function logoValido(data: string | null | undefined): string | null {
  if (data == null || data === "") return null;
  const m = /^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!m) throw new PedidoError("logo_invalido", "El logo no es una imagen válida");
  const bytes = Math.floor((m[1].length * 3) / 4);
  if (bytes > LOGO_MAX) throw new PedidoError("logo_grande", "El logo supera 400 KB");
  return data;
}

function normalizarSlotsInput(slots: unknown[]): Parameters<typeof configurarSlots>[2] {
  return slots.map((slot) => {
    if (typeof slot !== "object" || slot === null) throw new SolicitudError("slots_invalidos", "Slot inválido");
    const s = slot as Record<string, unknown>;
    if (typeof s.posicion !== "number" || !Number.isInteger(s.posicion)) {
      throw new SolicitudError("slots_invalidos", "El slot necesita posición entera");
    }
    if (typeof s.nombre !== "string") throw new SolicitudError("slots_invalidos", "El slot necesita nombre");
    const grupoIds = Array.isArray(s.grupoIds) ? (s.grupoIds.filter((g) => typeof g === "number") as number[]) : [];
    return { posicion: s.posicion, nombre: s.nombre, permiteExtra: s.permiteExtra === true, grupoIds };
  });
}

async function meseroAlCrear(db: AppDeps["db"], config: AppConfig, pin?: string) {
  if (config.pin_habilitado && config.pin_momento === "crear_orden") {
    return exigirPin(db, pin ?? "", "crear_pedido");
  }
  if (pin) return exigirPin(db, pin, "crear_pedido");
  const s = sesionAbierta(db);
  if (!s) throw new PinError("credenciales_invalidas", "Hace falta sesión");
  return { id: s.administrador.id };
}

export function createApp(deps: AppDeps): Hono<{ Variables: AppVariables }> {
  const app = new Hono<{ Variables: AppVariables }>();
  const { db, config, printer, dataDir } = deps;

  app.onError((err, c) => {
    const message = err instanceof Error ? err.message : "error";
    return c.json({ error: message, codigo: codigoDe(err) }, codigoStatus(err));
  });

  app.use("/api/*", async (c, next) => {
    const sesion = sesionUsuarioPorToken(db, getCookie(c, COOKIE_SESION));
    c.set("usuario", sesion?.usuario ?? null);
    const roles = rolesDeRuta(c.req.path, c.req.method);
    if (roles === null) return next();
    if (!deps.exigirAutenticacion && !sesion) return next();
    if (!sesion) throw new PinError("credenciales_invalidas", "Inicia sesión para continuar");
    if (roles.length > 0 && !tieneRol(sesion.usuario, roles)) {
      throw new PinError("sin_derecho", "Tu rol no permite realizar esta acción");
    }
    return next();
  });

  // `createApp` sigue siendo la raíz de composición: los módulos reciben sus
  // dependencias y no importan estado global.
  app.route("/api/cuentas", rutasCuentas({ db, config, printer }));
  app.route("/api/ordenes", rutasOrdenes({ db, config, printer }));
  app.route("/api/contornos", rutasContornos({ db, config, printer }));

  app.get("/api/productos/:id/slots", (c) => c.json({ slots: slotsDeProducto(db, idDeRuta(c)) }));

  app.put("/api/productos/:id/slots", async (c) => {
    const productoId = idDeRuta(c);
    const body = await leerJson<{ slots: unknown }>(c);
    const slots = Array.isArray(body.slots) ? body.slots : [];
    configurarSlots(db, productoId, normalizarSlotsInput(slots));
    return c.json({ slots: slotsDeProducto(db, productoId) });
  });

  app.get("/api/productos/:id/receta", (c) => c.json({ receta: recetaDeProducto(db, idDeRuta(c)) }));

  app.put("/api/productos/:id/receta", async (c) => {
    const productoId = idDeRuta(c);
    const body = await leerJson<{ receta: unknown }>(c);
    if (!Array.isArray(body.receta)) throw new SolicitudError("receta_invalida", "La receta debe ser una lista de ingredientes");
    const receta = body.receta.map((linea) => {
      if (typeof linea !== "object" || linea === null) throw new SolicitudError("receta_invalida", "Ingrediente inválido");
      const item = linea as Record<string, unknown>;
      return { ingredienteId: Number(item.ingredienteId), cantidad: Number(item.cantidad) };
    });
    guardarReceta(db, productoId, receta);
    return c.json({ receta: recetaDeProducto(db, productoId) });
  });

  app.get("/api/salud", (c) => c.json({ ok: true }));

  app.get("/api/sesion", (c) => {
    const individual = sesionUsuarioPorToken(db, getCookie(c, COOKIE_SESION));
    if (individual) {
      return c.json({ abierta: true, usuario: individual.usuario, administrador: individual.usuario });
    }
    if (deps.exigirAutenticacion) return c.json({ abierta: false, usuario: null, administrador: null });
    const s = sesionAbierta(db);
    if (!s) return c.json({ abierta: false, usuario: null, administrador: null });
    const usuario = { ...s.administrador, roles: ["administrador"] as RolClave[] };
    return c.json({ abierta: true, usuario, administrador: usuario });
  });

  app.post("/api/sesion/abrir", async (c) => {
    const body = await c.req.json<{ usuario?: string; password?: string }>();
    const { token, sesion } = await abrirSesionUsuario(db, { usuario: body.usuario ?? "", password: body.password ?? "" });
    setCookie(c, COOKIE_SESION, token, { httpOnly: true, sameSite: "Strict", path: "/", maxAge: 60 * 60 * 12 });
    return c.json({ abierta: true, usuario: sesion.usuario, administrador: sesion.usuario });
  });

  app.post("/api/sesion/cerrar", (c) => {
    const token = getCookie(c, COOKIE_SESION);
    cerrarSesionUsuario(db, token);
    deleteCookie(c, COOKIE_SESION, { path: "/" });
    if (!deps.exigirAutenticacion && !token) cerrarSesion(db);
    return c.json({ abierta: false, usuario: null, administrador: null });
  });

  app.post("/api/sesion/cerrar-turno", (c) => {
    const usuario = c.get("usuario");
    if (deps.exigirAutenticacion && (!usuario || !usuario.roles.includes("administrador"))) {
      throw new PinError("sin_derecho", "Solo un administrador puede cerrar el turno");
    }
    cerrarTodasSesionesUsuario(db);
    cerrarSesion(db);
    deleteCookie(c, COOKIE_SESION, { path: "/" });
    return c.json({ abierta: false, usuario: null, administrador: null });
  });

  app.get("/api/complementos", (c) => c.json({ plugins: listarPlugins(), mensajes: mensajesVacios() }));

  app.get("/api/empleados", (c) => {
    const rows = db.prepare("SELECT id, nombre, derecho, activo FROM empleados WHERE activo = 1").all();
    return c.json({ empleados: rows });
  });

  app.get("/api/usuarios", (c) => {
    if (!sesionAbierta(db)) throw new PinError("credenciales_invalidas", "Hace falta sesión de administrador");
    return c.json({ usuarios: listarUsuarios(db), roles: ROLES });
  });

  app.post("/api/usuarios", async (c) => {
    if (!sesionAbierta(db)) throw new PinError("credenciales_invalidas", "Hace falta sesión de administrador");
    const body = await leerJson<{ nombre: unknown; usuario: unknown; pin: unknown; password: unknown; roles: unknown }>(c);
    if (typeof body.nombre !== "string" || typeof body.usuario !== "string" || !body.usuario.trim() || typeof body.pin !== "string" || typeof body.password !== "string" || !body.password.trim() || !Array.isArray(body.roles)) {
      throw new SolicitudError("usuario_invalido", "Completa nombre, usuario, contraseña, PIN y al menos un rol");
    }
    const creado = await crearEmpleado(db, {
      nombre: body.nombre,
      usuario: typeof body.usuario === "string" ? body.usuario : undefined,
      pin: body.pin,
      password: typeof body.password === "string" ? body.password : undefined,
      roles: body.roles.filter((rol): rol is RolClave => typeof rol === "string") as RolClave[],
    });
    return c.json({ usuario: listarUsuarios(db).find((item) => item.id === creado.id) }, 201);
  });

  app.put("/api/usuarios/:id", async (c) => {
    if (!sesionAbierta(db)) throw new PinError("credenciales_invalidas", "Hace falta sesión de administrador");
    const body = await leerJson<{ nombre: unknown; usuario: unknown; pin: unknown; password: unknown; roles: unknown; activo: unknown }>(c);
    if (typeof body.nombre !== "string" || !Array.isArray(body.roles) || typeof body.activo !== "boolean") {
      throw new SolicitudError("usuario_invalido", "Completa nombre, estado y al menos un rol");
    }
    return c.json({ usuario: await actualizarUsuario(db, idDeRuta(c), {
      nombre: body.nombre,
      usuario: typeof body.usuario === "string" ? body.usuario : null,
      pin: typeof body.pin === "string" ? body.pin : undefined,
      password: typeof body.password === "string" ? body.password : undefined,
      roles: body.roles.filter((rol): rol is RolClave => typeof rol === "string") as RolClave[],
      activo: body.activo,
    }) });
  });

  app.get("/api/mesas", (c) => {
    const rows = db
      .prepare(
        "SELECT id, piso_id, numero, asientos, activa, pos_x, pos_y, forma, ancho, alto, fondo_color, fondo_data FROM mesas WHERE activa = 1",
      )
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
      fondo_color: string | null;
      fondo_data: string | null;
    }[];
    return c.json({
      mesas: rows.map((m) => ({ ...m, estado: estadoMesa(db, m.id), cuentaId: cuentaActivaPorMesa(db, m.id)?.id ?? null })),
      pisos: db
        .prepare(
          "SELECT id, nombre, fondo_color, CASE WHEN fondo_blob IS NULL THEN 0 ELSE 1 END AS tiene_fondo FROM pisos WHERE COALESCE(activo, 1) = 1",
        )
        .all(),
    });
  });

  app.get("/api/carta", (c) => {
    const rows = db
      .prepare(
        `SELECT p.id, p.nombre, p.precio_centavos, p.categoria_id, c.nombre AS categoria_nombre,
                p.tipo_consumo, p.codigo, p.color, p.foto_data, p.rastrear_inventario
         FROM productos p
         LEFT JOIN categorias_pos c ON c.id = p.categoria_id
         WHERE p.activo = 1 AND p.disponible_en_pos = 1
         ORDER BY COALESCE(lower(c.nombre), ''), lower(p.nombre)`,
      )
      .all() as {
        id: number;
        nombre: string;
        precio_centavos: number;
        categoria_id: number;
        categoria_nombre: string | null;
        tipo_consumo: string;
        codigo: string | null;
        color: string | null;
        foto_data: string | null;
        rastrear_inventario: number;
      }[];
    return c.json({
      productos: rows.map((p) => ({
        ...p,
        armable: armableDeProducto(db, p.id),
        configurable:
          Number(
            (db.prepare("SELECT count(*) AS c FROM plato_slots WHERE producto_id = ?").get(p.id) as { c: number }).c,
          ) > 0,
      })),
    });
  });

  app.get("/api/categorias", (c) => c.json({ categorias: listarCategorias(db) }));

  app.post("/api/categorias", async (c) => {
    const body = await leerJson<{ nombre: unknown }>(c);
    const nombre = typeof body.nombre === "string" ? body.nombre : "";
    const creada = crearCategoria(db, { nombre });
    return c.json(creada, 201);
  });

  app.get("/api/productos", (c) => c.json({ productos: listarProductos(db) }));

  app.get("/api/inventario", (c) => {
    if (!sesionAbierta(db)) throw new PinError("credenciales_invalidas", "Hace falta sesión");
    return c.json({ materiales: listarInventario(db) });
  });

  app.post("/api/inventario/:id/entradas", async (c) => {
    if (!sesionAbierta(db)) throw new PinError("credenciales_invalidas", "Hace falta sesión");
    const body = await leerJson<{ cantidad: unknown; pin: unknown }>(c);
    if (typeof body.cantidad !== "number") throw new SolicitudError("cantidad_invalida", "Cantidad inválida");
    if (typeof body.pin !== "string") throw new SolicitudError("pin_invalido", "Hace falta el PIN de administrador");
    return c.json(
      await registrarEntradaInventario(db, {
        productoId: idDeRuta(c),
        cantidad: body.cantidad,
        pin: body.pin,
      }),
      201,
    );
  });

  app.post("/api/inventario/:id/perdidas", async (c) => {
    if (!sesionAbierta(db)) throw new PinError("credenciales_invalidas", "Hace falta sesión");
    const body = await leerJson<{ cantidad: unknown; motivo: unknown; pin: unknown }>(c);
    if (typeof body.cantidad !== "number") throw new SolicitudError("cantidad_invalida", "Cantidad inválida");
    if (body.motivo !== "producto_danado" && body.motivo !== "consumo_interno") {
      throw new SolicitudError("motivo_invalido", "Selecciona un motivo válido para la pérdida");
    }
    if (typeof body.pin !== "string") throw new SolicitudError("pin_invalido", "Hace falta el PIN de administrador");
    return c.json(
      await registrarPerdidaInventario(db, {
        productoId: idDeRuta(c),
        cantidad: body.cantidad,
        motivo: body.motivo as MotivoPerdidaInventario,
        pin: body.pin,
      }),
      201,
    );
  });

  app.post("/api/productos", async (c) => {
    const body = await c.req.json<{
      nombre?: string;
      precio_centavos?: number;
      categoria_id?: number | null;
      tipo_consumo?: string;
      disponible_en_pos?: boolean;
      rastrear_inventario?: boolean;
      codigo?: string | null;
      color?: string | null;
      foto_data?: string | null;
      receta?: LineaRecetaInput[];
    }>();
    const creado = crearProducto(db, {
      nombre: body.nombre ?? "",
      precio_centavos: body.precio_centavos ?? 0,
      categoria_id: body.categoria_id ?? null,
      tipo_consumo: body.tipo_consumo ?? "no_almacenable",
      disponible_en_pos: body.disponible_en_pos !== false,
      rastrear_inventario: body.rastrear_inventario !== false,
      codigo: body.codigo,
      color: body.color,
      foto_data: body.foto_data,
      receta: Array.isArray(body.receta) ? body.receta : undefined,
    });
    return c.json(creado, 201);
  });

  app.put("/api/plano", async (c) => {
    const body = await c.req.json<{ pisos?: Parameters<typeof guardarPlano>[1]["pisos"]; quitarMesaIds?: number[] }>();
    return c.json(guardarPlano(db, { pisos: body.pisos ?? [], quitarMesaIds: body.quitarMesaIds }));
  });

  app.get("/api/config", (c) => c.json(configPublica(config)));

  app.post("/api/config", async (c) => {
    const body = await c.req.json<{
      tablet_cocina?: boolean;
      barra_ultimos_pedidos?: boolean;
      barra_atrasados?: boolean;
      nombre_local?: string;
      logo_data?: string | null;
      tipografia?: AppConfig["tipografia"];
      tamano_ui?: AppConfig["tamano_ui"];
      pin_habilitado?: boolean;
      pin_momento?: AppConfig["pin_momento"];
      confirmar_comanda?: boolean;
      auditoria_anulaciones?: boolean;
      justificacion_anulacion?: boolean;
      precuenta_obligatoria_antes_de_caja?: boolean;
      enviar_a_caja_requiere_avanzado?: boolean;
      impresora_comanda?: unknown;
      impresora_boleta?: unknown;
      plantilla_comanda?: AppConfig["plantilla_comanda"];
      plantilla_boleta?: AppConfig["plantilla_boleta"];
      servidor_red_habilitado?: boolean;
      nombre_servidor?: string;
    }>();
    if (typeof body.tablet_cocina === "boolean") config.tablet_cocina = body.tablet_cocina;
    if (typeof body.barra_ultimos_pedidos === "boolean") config.barra_ultimos_pedidos = body.barra_ultimos_pedidos;
    if (typeof body.barra_atrasados === "boolean") config.barra_atrasados = body.barra_atrasados;
    if (typeof body.nombre_local === "string") {
      const nombre = body.nombre_local.trim().slice(0, 40);
      if (!nombre) throw new PedidoError("nombre_vacio", "El restaurante necesita un nombre");
      config.nombre_local = nombre;
    }
    if (body.logo_data !== undefined) config.logo_data = logoValido(body.logo_data);
    if (body.tipografia === "sans" || body.tipografia === "serif" || body.tipografia === "redondeada") {
      config.tipografia = body.tipografia;
    }
    if (body.tamano_ui === "compacto" || body.tamano_ui === "normal" || body.tamano_ui === "grande") {
      config.tamano_ui = body.tamano_ui;
    }
    if (typeof body.pin_habilitado === "boolean") config.pin_habilitado = body.pin_habilitado;
    if (body.pin_momento === "crear_orden" || body.pin_momento === "enviar") config.pin_momento = body.pin_momento;
    if (typeof body.confirmar_comanda === "boolean") config.confirmar_comanda = body.confirmar_comanda;
    if (typeof body.auditoria_anulaciones === "boolean") config.auditoria_anulaciones = body.auditoria_anulaciones;
    if (typeof body.justificacion_anulacion === "boolean") config.justificacion_anulacion = body.justificacion_anulacion;
    if (typeof body.precuenta_obligatoria_antes_de_caja === "boolean") {
      config.precuenta_obligatoria_antes_de_caja = body.precuenta_obligatoria_antes_de_caja;
    }
    if (typeof body.enviar_a_caja_requiere_avanzado === "boolean") {
      config.enviar_a_caja_requiere_avanzado = body.enviar_a_caja_requiere_avanzado;
    }
    if (body.impresora_comanda !== undefined) config.impresora_comanda = impresoraValida(body.impresora_comanda, config.impresora_comanda);
    if (body.impresora_boleta !== undefined) config.impresora_boleta = impresoraValida(body.impresora_boleta, config.impresora_boleta);
    if (body.plantilla_comanda && typeof body.plantilla_comanda === "object") {
      config.plantilla_comanda = {
        titulo: String(body.plantilla_comanda.titulo ?? "").trim().slice(0, 60) || "COMANDA",
        encabezado: String(body.plantilla_comanda.encabezado ?? "").trim().slice(0, 300),
        pie: String(body.plantilla_comanda.pie ?? "").trim().slice(0, 300),
      };
    }
    if (body.plantilla_boleta && typeof body.plantilla_boleta === "object") {
      config.plantilla_boleta = {
        titulo: String(body.plantilla_boleta.titulo ?? "").trim().slice(0, 60) || "COMPROBANTE",
        encabezado: String(body.plantilla_boleta.encabezado ?? "").trim().slice(0, 300),
        pie: String(body.plantilla_boleta.pie ?? "").trim().slice(0, 300),
      };
    }
    if (typeof body.servidor_red_habilitado === "boolean") config.servidor_red_habilitado = body.servidor_red_habilitado;
    if (typeof body.nombre_servidor === "string") config.nombre_servidor = body.nombre_servidor.trim().slice(0, 60) || "Restaurante";
    Object.assign(config, normalizarConfig(config));
    if (dataDir) saveConfig(dataDir, config);
    return c.json(configPublica(config));
  });

  app.get("/api/red/estado", (c) => {
    const url = new URL(c.req.url);
    const puerto = Number(url.port || (url.protocol === "https:" ? 443 : 80));
    return c.json({
      habilitado: config.servidor_red_habilitado,
      nombre: config.nombre_servidor,
      puerto,
      urls: urlsDeRed(puerto, config.servidor_red_habilitado),
      salud: "operativo",
      requiereReinicio: false,
    });
  });

  app.post("/api/impresoras/diagnosticar", async (c) => {
    if (!sesionAbierta(db)) throw new PinError("credenciales_invalidas", "Hace falta sesión de administrador");
    const body = await leerJson<{ impresora: unknown }>(c);
    const destino = impresoraValida(body.impresora, config.impresora_comanda);
    return c.json(await diagnosticarImpresora(destino));
  });

  app.post("/api/impresoras/prueba", async (c) => {
    if (!sesionAbierta(db)) throw new PinError("credenciales_invalidas", "Hace falta sesión de administrador");
    const body = await leerJson<{ tipo: unknown }>(c);
    if (body.tipo !== "comanda" && body.tipo !== "boleta") {
      throw new SolicitudError("tipo_impresion_invalido", "Selecciona comanda o boleta");
    }
    const destino = body.tipo === "comanda" ? config.impresora_comanda : config.impresora_boleta;
    if (!destino.habilitada) throw new SolicitudError("impresora_deshabilitada", "Activa y guarda la impresora antes de probarla");
    const latenciaMs = await enviarAImpresoraRed(destino, textoPrueba(body.tipo, config));
    return c.json({ ok: true, latenciaMs, mensaje: "Página de prueba enviada" });
  });

  app.get("/api/impresion/trabajos", (c) => {
    const trabajos = db.prepare(
      `SELECT id, kind AS tipo, status AS estado, attempts AS intentos, last_error AS ultimoError, created_en AS creadoEn
       FROM print_jobs ORDER BY id DESC LIMIT 50`,
    ).all();
    return c.json({ trabajos });
  });

  app.post("/api/impresion/trabajos/:id/reintentar", async (c) => {
    const id = idDeRuta(c);
    const existe = db.prepare("SELECT id FROM print_jobs WHERE id = ?").get(id);
    if (!existe) throw new SolicitudError("impresion_inexistente", "El trabajo de impresión no existe");
    db.prepare("UPDATE print_jobs SET status = 'queued', last_error = NULL WHERE id = ?").run(id);
    await despacharJobs(db, printer);
    const trabajo = db.prepare(
      "SELECT id, kind AS tipo, status AS estado, attempts AS intentos, last_error AS ultimoError, created_en AS creadoEn FROM print_jobs WHERE id = ?",
    ).get(id);
    return c.json({ trabajo });
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

  app.get("/api/kds", (c) => c.json({ tarjetas: tarjetasKds(db) }));

  app.post("/api/kds/lineas/:id/etapa", async (c) => {
    const comandaLineaId = idDeRuta(c);
    const cuerpo = await leerJson<{ etapa: unknown }>(c);
    const etapa = textoRequerido(cuerpo.etapa, "etapa_invalida", "Hace falta la etapa");
    avanzarEtapa(db, comandaLineaId, etapa);
    return c.json({ ok: true, etapa });
  });

  app.get("/api/cocina/incidencias", (c) => {
    if (!sesionAbierta(db)) throw new PinError("credenciales_invalidas", "Hace falta sesión");
    return c.json({ incidencias: listarIncidenciasMesero(db) });
  });

  app.post("/api/cocina/incidencias", async (c) => {
    if (!sesionAbierta(db)) throw new PinError("credenciales_invalidas", "Hace falta sesión");
    const body = await leerJson<{
      comandaId: unknown;
      comandaLineaId: unknown;
      tipo: unknown;
      alcance: unknown;
      motivo: unknown;
      propuesta: unknown;
      productoReemplazoId: unknown;
    }>(c);
    if (typeof body.comandaId !== "number") throw new SolicitudError("comanda_invalida", "Comanda inválida");
    if (body.comandaLineaId != null && typeof body.comandaLineaId !== "number") {
      throw new SolicitudError("linea_invalida", "Producto inválido");
    }
    if (typeof body.tipo !== "string" || typeof body.alcance !== "string" || typeof body.motivo !== "string") {
      throw new SolicitudError("incidencia_invalida", "La solicitud de cocina está incompleta");
    }
    return c.json(
      crearIncidenciaCocina(db, {
        comandaId: body.comandaId,
        comandaLineaId: body.comandaLineaId,
        tipo: body.tipo as "rechazo" | "sugerencia",
        alcance: body.alcance as "linea" | "orden",
        motivo: body.motivo,
        propuesta: typeof body.propuesta === "string" ? body.propuesta : null,
        productoReemplazoId: typeof body.productoReemplazoId === "number" ? body.productoReemplazoId : null,
      }),
      201,
    );
  });

  app.post("/api/cocina/incidencias/:id/aceptar", async (c) => {
    if (!sesionAbierta(db)) throw new PinError("credenciales_invalidas", "Hace falta sesión");
    const id = idDeRuta(c);
    const body = await leerJson<{ pin: unknown }>(c);
    let correccion: unknown = null;
    try {
      const { incidencia, linea, productoReemplazoId } = prepararSustitucion(db, id);
      if (typeof body.pin !== "string") throw new SolicitudError("pin_invalido", "Hace falta el PIN del mesero");
      correccion = await corregirOrden(db, {
        ordenId: incidencia.ordenId,
        lineas: [
          { lineaClave: linea.lineaClave, productoId: linea.productoId, ordenLineaId: linea.ordenLineaId, cantidad: 0, nota: linea.nota },
          { lineaClave: `incidencia-${id}-reemplazo`, productoId: productoReemplazoId, ordenLineaId: null, cantidad: linea.cantidad, nota: linea.nota },
        ],
        motivo: `Sugerencia aceptada: ${incidencia.propuesta ?? incidencia.motivo}`,
        claveIdempotencia: `incidencia-${id}-aceptar`,
        pin: body.pin,
      }, printer, config);
    } catch (error) {
      if (!(error instanceof IncidenciaCocinaError) || error.codigo !== "sustitucion_no_estructurada") throw error;
    }
    return c.json({ incidencia: aceptarSugerencia(db, id), correccion });
  });

  app.post("/api/cocina/incidencias/:id/eliminar", async (c) => {
    if (!sesionAbierta(db)) throw new PinError("credenciales_invalidas", "Hace falta sesión");
    const id = idDeRuta(c);
    const body = await leerJson<{ pin: unknown }>(c);
    if (typeof body.pin !== "string") throw new SolicitudError("pin_invalido", "Hace falta el PIN del mesero");
    const { incidencia, lineas } = prepararEliminacion(db, id);
    const correccion = await corregirOrden(
      db,
      {
        ordenId: incidencia.ordenId,
        lineas: lineas.map((linea) => ({
          lineaClave: linea.lineaClave,
          productoId: linea.productoId,
          ordenLineaId: linea.ordenLineaId,
          cantidad: 0,
          nota: linea.nota,
        })),
        motivo: `Solicitud de cocina: ${incidencia.motivo}`,
        claveIdempotencia: `incidencia-${id}-eliminar`,
        pin: body.pin,
      },
      printer,
      config,
    );
    return c.json({ incidencia: marcarIncidenciaEliminada(db, id), correccion });
  });

  // Legacy: lectura del modelo de pedidos. La UI del modelo de cuentas usa
  // GET /api/cuentas; esta ruta queda solo para adaptadores hasta retirarla.
  app.get("/api/pedidos", (c) => {
    limpiarPedidosSinMesa(db);
    return c.json({ pedidos: listarPedidosEnCurso(db, config) });
  });

  app.post("/api/pedidos", deprecado("/api/ordenes"), async (c) => {
    const body = await c.req.json<{ cubiertos?: number; pin?: string }>().catch(() => ({ cubiertos: 1 } as { cubiertos?: number; pin?: string }));
    const mesero = await meseroAlCrear(db, config, body.pin);
    return c.json(abrirTab(db, { cubiertos: body.cubiertos || 1, preset: "salon", meseroId: mesero.id }));
  });

  app.post("/api/pedidos/:id/asignar-mesa", deprecado("/api/ordenes"), async (c) => {
    const body = await c.req.json<{ mesaId: number }>();
    asignarMesa(db, Number(c.req.param("id")), body.mesaId);
    return c.json({ ok: true });
  });

  app.post("/api/lineas/:id/quitar", deprecado("/api/ordenes/:id/correcciones"), async (c) => {
    const body = await c.req.json<{ pin?: string }>().catch(() => ({} as { pin?: string }));
    await exigirPin(db, body.pin ?? "", "anular");
    quitarLinea(db, Number(c.req.param("id")), config);
    await despacharJobs(db, printer);
    return c.json({ ok: true });
  });

  app.post("/api/lineas/:id/cantidad", deprecado("/api/ordenes/:id/correcciones"), async (c) => {
    const body = await c.req.json<{ cantidad: number; pin?: string }>();
    if (body.cantidad === 0) await exigirPin(db, body.pin ?? "", "anular");
    cambiarCantidad(db, Number(c.req.param("id")), body.cantidad, config);
    return c.json({ ok: true });
  });

  // Adaptador: traduce el id de línea de pedido al de comanda y delega en la
  // misma transición protegida que usa la pantalla nueva.
  app.post("/api/lineas/:id/en-proceso", deprecado("/api/kds/lineas/:id/etapa"), (c) => {
    const cl = db
      .prepare("SELECT id FROM comanda_lineas WHERE pedido_linea_id = ? ORDER BY id DESC LIMIT 1")
      .get(Number(c.req.param("id"))) as { id: number } | undefined;
    if (!cl) return c.json({ error: "no encontrado", codigo: "no_encontrado" }, 404);
    avanzarEtapa(db, cl.id, "en_proceso");
    return c.json({ ok: true });
  });

  // Legacy: lectura de un pedido del modelo anterior.
  app.get("/api/pedidos/:id", (c) => {
    const id = Number(c.req.param("id"));
    const pedido = db
      .prepare(
        `SELECT p.id, p.mesa_id, p.preset, p.cubiertos, p.estado, p.mesero_id, p.nota_privada, p.indicaciones, m.numero AS mesa_numero
         FROM pedidos p LEFT JOIN mesas m ON m.id = p.mesa_id
         WHERE p.id = ?`,
      )
      .get(id) as
      | {
          id: number;
          mesa_id: number | null;
          preset: string;
          cubiertos: number;
          estado: string;
          mesero_id: number | null;
          nota_privada: string | null;
          indicaciones: string | null;
          mesa_numero: number | null;
        }
      | undefined;
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

  app.post("/api/pedidos/:id/notas", deprecado("/api/ordenes/:id/correcciones"), async (c) => {
    const body = await c.req.json<{ nota_privada?: string | null; indicaciones?: string | null }>();
    guardarNotasPedido(db, Number(c.req.param("id")), body);
    return c.json({ ok: true });
  });

  app.post("/api/lineas/:id/nota", deprecado("/api/ordenes/:id/correcciones"), async (c) => {
    const body = await c.req.json<{ nota?: string | null }>();
    guardarNotaLinea(db, Number(c.req.param("id")), body.nota ?? null, config);
    return c.json({ ok: true });
  });

  app.post("/api/mesas/:id/abrir", deprecado("/api/ordenes"), async (c) => {
    const body = await c.req.json<{ cubiertos?: number; pin?: string }>();
    const mesero = await meseroAlCrear(db, config, body.pin);
    const result = abrirMesa(db, {
      mesaId: Number(c.req.param("id")),
      cubiertos: body.cubiertos || 4,
      preset: "salon",
      meseroId: mesero.id,
    });
    return c.json(result);
  });

  app.post("/api/pedidos/:id/lineas", deprecado("/api/ordenes"), async (c) => {
    const body = await c.req.json<{ productoId: number; cantidad: number; nota?: string }>();
    const result = agregarLinea(db, Number(c.req.param("id")), body);
    return c.json(result);
  });

  app.post("/api/pedidos/:id/enviar", deprecado("/api/ordenes"), async (c) => {
    const body = await c.req.json<{ pin?: string }>().catch(() => ({} as { pin?: string }));
    const s = sesionAbierta(db);
    const result = await enviarACocina(
      db,
      Number(c.req.param("id")),
      body.pin,
      printer,
      config,
      s?.administrador.id,
    );
    return c.json(result);
  });

  // Legacy: vista previa de comanda del modelo anterior.
  app.get("/api/pedidos/:id/comanda-preview", (c) => {
    const s = sesionAbierta(db);
    if (!s) throw new PinError("credenciales_invalidas", "Hace falta sesión");
    return c.json(vistaPreviaComanda(db, Number(c.req.param("id")), s.administrador.nombre));
  });

  app.post("/api/pedidos/:id/precuenta", deprecado("/api/cuentas/:id/precuenta"), async (c) => {
    const body = await c.req.json<{ pin?: string }>();
    const result = await emitirPrecuenta(db, Number(c.req.param("id")), body.pin, printer, config);
    return c.json(result);
  });

  app.post("/api/precuentas/:id/reimprimir", async (c) => {
    const result = await reimprimirPrecuenta(db, Number(c.req.param("id")), printer);
    return c.json(result);
  });

  app.post("/api/pedidos/:id/enviar-caja", deprecado("/api/cuentas/:id/enviar-caja"), async (c) => {
    const body = await c.req.json<{ pin?: string }>();
    const result = await enviarACaja(db, Number(c.req.param("id")), body.pin, config);
    return c.json(result);
  });

  return app;
}
