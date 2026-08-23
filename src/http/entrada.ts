import type Database from "better-sqlite3";
import type { Context } from "hono";
import type { AppConfig } from "../config.ts";
import { exigirPin, PinError } from "../modules/empleados/empleados.ts";
import { sesionAbierta } from "../modules/empleados/sesion.ts";
import type { CambioOrdenInput } from "../modules/ordenes/correcciones.ts";
import type { NuevaLineaOrden } from "../modules/ordenes/ordenes.ts";
import type { PrinterPort } from "../print/types.ts";

/**
 * Todo lo que un módulo de rutas necesita. Se recibe por parámetro: nadie
 * importa estado global, así que dos apps sobre dos bases no se pisan.
 */
export type RutasDeps = {
  db: Database.Database;
  config: AppConfig;
  printer: PrinterPort;
};

/** El cuerpo o la ruta venían mal: nunca llega al dominio. */
export class SolicitudError extends Error {
  codigo: string;
  constructor(codigo: string, message: string) {
    super(message);
    this.name = "SolicitudError";
    this.codigo = codigo;
  }
}

const TEXTO_MAX = 500;

/**
 * Un cuerpo ausente es un objeto vacío —hay rutas donde todo es opcional—, pero
 * un cuerpo presente y roto es un 400: dejarlo pasar como `undefined` termina en
 * un error de SQLite y un 500 por un typo del cliente.
 */
export async function leerJson<T extends object>(c: Context): Promise<Partial<T>> {
  const texto = await c.req.text();
  if (texto.trim() === "") return {};
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch {
    throw new SolicitudError("json_invalido", "El cuerpo no es JSON válido");
  }
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
    throw new SolicitudError("json_invalido", "El cuerpo tiene que ser un objeto JSON");
  }
  return valor as Partial<T>;
}

export function idDeRuta(c: Context, nombre = "id"): number {
  return enteroPositivo(c.req.param(nombre), "id_invalido", "El id de la ruta no es válido");
}

export function enteroPositivo(valor: unknown, codigo: string, mensaje: string): number {
  const numero = typeof valor === "string" ? Number(valor) : valor;
  if (typeof numero !== "number" || !Number.isInteger(numero) || numero <= 0) {
    throw new SolicitudError(codigo, mensaje);
  }
  return numero;
}

/**
 * `undefined` es «no lo mandaron» y `null` es «lo borraron»: la diferencia
 * importa porque una corrección que no menciona las indicaciones no es lo mismo
 * que una que las deja en blanco.
 */
export function textoOpcional(valor: unknown): string | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  if (typeof valor !== "string") throw new SolicitudError("texto_invalido", "Ese campo tiene que ser texto");
  if (valor.length > TEXTO_MAX) {
    throw new SolicitudError("texto_largo", `Ese texto supera ${TEXTO_MAX} caracteres`);
  }
  const limpio = valor.trim();
  return limpio ? limpio : null;
}

export function textoRequerido(valor: unknown, codigo: string, mensaje: string): string {
  if (typeof valor !== "string" || valor.trim() === "") throw new SolicitudError(codigo, mensaje);
  if (valor.length > TEXTO_MAX) throw new SolicitudError("texto_largo", `Ese texto supera ${TEXTO_MAX} caracteres`);
  return valor.trim();
}

export function claveIdempotencia(valor: unknown): string {
  return textoRequerido(valor, "clave_idempotencia_requerida", "Hace falta una clave de idempotencia");
}

export function pinOpcional(valor: unknown): string | undefined {
  if (valor === undefined || valor === null) return undefined;
  if (typeof valor !== "string") throw new SolicitudError("pin_invalido", "El PIN tiene que ser texto");
  return valor;
}

function objetos(valor: unknown): Record<string, unknown>[] {
  if (!Array.isArray(valor)) throw new SolicitudError("lineas_invalidas", "`lineas` tiene que ser una lista");
  for (const linea of valor) {
    if (typeof linea !== "object" || linea === null || Array.isArray(linea)) {
      throw new SolicitudError("lineas_invalidas", "Cada línea tiene que ser un objeto");
    }
  }
  return valor as Record<string, unknown>[];
}

function cantidad(valor: unknown, minimo: number): number {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < minimo) {
    throw new SolicitudError("cantidad_invalida", "Cantidad inválida");
  }
  return valor;
}

/** Líneas de una orden nueva: cantidad siempre positiva, nunca cero. */
export function lineasNuevas(valor: unknown): NuevaLineaOrden[] {
  return objetos(valor ?? []).map((linea) => ({
    productoId: enteroPositivo(linea.productoId, "producto_invalido", "Producto inválido"),
    cantidad: cantidadPositiva(linea.cantidad),
    nota: textoOpcional(linea.nota) ?? null,
    ...(linea.contornos === undefined ? {} : { contornos: contornosNuevos(linea.contornos) }),
  }));
}

function contornosNuevos(valor: unknown): Array<{ slotPosicion: number; varianteId: number }> {
  return objetos(valor ?? []).map((seleccion) => ({
    slotPosicion: enteroPositivo(seleccion.slotPosicion, "slot_invalido", "Slot inválido"),
    varianteId: enteroPositivo(seleccion.varianteId, "variante_invalida", "Variante inválida"),
  }));
}

function cantidadPositiva(valor: unknown): number {
  const numero = cantidad(valor, 0);
  if (numero === 0) throw new SolicitudError("cantidad_invalida", "Cantidad inválida");
  return numero;
}

/**
 * Cambios de una corrección. Acá el cero sí vale: es anular la línea. La
 * identidad es `lineaClave`; `ordenLineaId` es informativo y el servicio lo
 * contrasta.
 */
export function cambiosDeLinea(valor: unknown): CambioOrdenInput[] {
  return objetos(valor ?? []).map((linea) => ({
    lineaClave: textoRequerido(linea.lineaClave, "linea_sin_clave", "Cada línea necesita su lineaClave"),
    productoId: enteroPositivo(linea.productoId, "producto_invalido", "Producto inválido"),
    ordenLineaId:
      linea.ordenLineaId === undefined || linea.ordenLineaId === null
        ? null
        : enteroPositivo(linea.ordenLineaId, "linea_invalida", "ordenLineaId inválido"),
    cantidad: cantidad(linea.cantidad, 0),
    nota: textoOpcional(linea.nota) ?? null,
  }));
}

/**
 * Quién firma una orden. En este modelo crear y enviar son el mismo acto —la
 * orden solo existe una vez enviada—, así que el PIN se pide una sola vez y da
 * igual en qué momento lo haya puesto la configuración.
 */
export async function meseroDeOrden(
  db: Database.Database,
  cfg: AppConfig,
  pin: string | undefined,
): Promise<{ id: number }> {
  if (cfg.pin_habilitado) {
    return exigirPin(db, pin ?? "", cfg.pin_momento === "crear_orden" ? "crear_pedido" : "enviar");
  }
  if (pin) return exigirPin(db, pin, "enviar");
  const s = sesionAbierta(db);
  if (!s) throw new PinError("credenciales_invalidas", "Hace falta sesión");
  return { id: s.administrador.id };
}

/**
 * Corre `accion` y, si falla con algo que no es un problema de credenciales,
 * comprueba la autorización antes de dejar salir el error.
 *
 * Precuenta y caja validan la cuenta antes que el PIN, así que sin esta guarda
 * un cliente sin credenciales podría recorrer ids y aprender cuáles existen y en
 * qué estado están por la diferencia entre un 404, un 409 y un 201. Con ella,
 * quien no está autorizado siempre recibe 403 y no aprende nada; en el camino
 * feliz no se paga ningún hash extra.
 */
export async function protegido<T>(autorizar: () => Promise<unknown>, accion: () => Promise<T>): Promise<T> {
  try {
    return await accion();
  } catch (err) {
    if (err instanceof PinError) throw err;
    await autorizar();
    throw err;
  }
}
