import type Database from "better-sqlite3";
import { versionEfectivaOrden } from "../ordenes/ordenes.ts";
import { obtenerCuenta } from "./cuentas.ts";

export function totalEfectivoCuenta(db: Database.Database, cuentaId: number): number {
  const ordenes = db.prepare("SELECT id FROM ordenes WHERE cuenta_id = ?").all(cuentaId) as { id: number }[];
  let total = 0;
  for (const orden of ordenes) {
    for (const linea of versionEfectivaOrden(db, orden.id)) {
      if (linea.cantidad > 0) total += linea.cantidad * linea.precioCentavos;
    }
  }
  return total;
}

export type LineaSnapshot = {
  productoId: number;
  nombre: string;
  cantidad: number;
  precioCentavos: number;
  /**
   * La nota vigente. Va en el snapshot porque una orden puede llevar dos líneas
   * del mismo producto y el nombre no las distingue: sin la nota, la precuenta
   * muestra dos renglones idénticos con precios que el cliente no puede atribuir.
   */
  nota: string | null;
};

export type OrdenSnapshot = {
  numero: number;
  /** Las indicaciones vigentes, no las del envío. */
  indicaciones: string | null;
  lineas: LineaSnapshot[];
};

export type SnapshotCuenta = {
  cuentaId: number;
  mesaNumero: number;
  ordenes: OrdenSnapshot[];
  totalCentavos: number;
  /** Qué órdenes y correcciones existían cuando se armó (ver `selloCuenta`). */
  sello: string;
};

/**
 * Marca de hasta dónde llegaba la cuenta. Una precuenta guarda el sello del
 * momento en que se emitió y caja lo compara con el actual: cualquier orden o
 * corrección posterior lo cambia.
 *
 * Es a propósito independiente de `precuentas.vigente`. Esa bandera la apagan
 * `enviarOrden` y `corregirOrden`, así que sirve mientras nadie la reviva; el
 * sello se recalcula desde las órdenes y no se puede maquillar con un UPDATE.
 * Cobrar una precuenta que no refleja la última orden es cobrar de menos.
 */
export function selloCuenta(db: Database.Database, cuentaId: number): string {
  const ordenes = db
    .prepare("SELECT count(*) AS n, COALESCE(max(id), 0) AS ultimo FROM ordenes WHERE cuenta_id = ?")
    .get(cuentaId) as { n: number; ultimo: number };
  const correcciones = db
    .prepare(
      `SELECT count(*) AS n, COALESCE(max(oc.id), 0) AS ultimo
       FROM orden_correcciones oc
       JOIN ordenes o ON o.id = oc.orden_id
       WHERE o.cuenta_id = ?`,
    )
    .get(cuentaId) as { n: number; ultimo: number };
  return `o:${ordenes.n}:${ordenes.ultimo}/c:${correcciones.n}:${correcciones.ultimo}`;
}

/**
 * La cuenta como la ve el cliente: cada orden con su versión efectiva y sus
 * indicaciones vigentes.
 *
 * Las líneas en cero quedan en la historia de la cuenta pero no en la
 * precuenta, y una orden que quedó entera en cero no aparece: cobrar o imprimir
 * lo anulado es exactamente lo que la corrección deshizo.
 */
export function snapshotCuenta(db: Database.Database, cuentaId: number): SnapshotCuenta {
  const cuenta = obtenerCuenta(db, cuentaId);
  const ordenes: OrdenSnapshot[] = [];
  let totalCentavos = 0;
  for (const orden of cuenta.ordenes) {
    const lineas: LineaSnapshot[] = [];
    for (const linea of orden.lineas) {
      if (linea.cantidad <= 0) continue;
      lineas.push({
        productoId: linea.productoId,
        nombre: linea.nombre,
        cantidad: linea.cantidad,
        precioCentavos: linea.precioCentavos,
        nota: linea.nota,
      });
      totalCentavos += linea.cantidad * linea.precioCentavos;
    }
    if (lineas.length === 0) continue;
    ordenes.push({ numero: orden.numero, indicaciones: orden.indicaciones, lineas });
  }
  return {
    cuentaId: cuenta.id,
    mesaNumero: cuenta.mesa.numero,
    ordenes,
    totalCentavos,
    sello: selloCuenta(db, cuentaId),
  };
}
