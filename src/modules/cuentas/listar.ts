import type Database from "better-sqlite3";
import type { LineaEfectiva } from "../ordenes/ordenes.ts";
import { haceCuanto } from "../tiempo.ts";
import { obtenerCuenta, type EstadoCuenta } from "./cuentas.ts";
import { totalEfectivoCuenta } from "./totales.ts";

/** Estado de la orden visto desde cocina: lo que muestra la tabla de Órdenes. */
export type EtapaOrden = "enviado" | "en_preparacion" | "listo" | "entregado";

/**
 * La orden no hereda el estado de la cuenta (eso es de la mesa): se deriva de
 * las etapas de sus líneas en cocina. Sin líneas cocinables cuenta como
 * recién enviada.
 */
function etapaDeOrden(db: Database.Database, ordenId: number): EtapaOrden {
  const filas = db
    .prepare(
      `SELECT cl.etapa
       FROM comanda_lineas cl
       JOIN comandas c ON c.id = cl.comanda_id
       WHERE c.orden_id = ? AND cl.etapa NOT IN ('aviso', 'cancelado')`,
    )
    .all(ordenId) as Array<{ etapa: string }>;
  if (filas.length === 0) return "enviado";
  if (filas.every((fila) => fila.etapa === "servido")) return "entregado";
  if (filas.every((fila) => fila.etapa === "listo" || fila.etapa === "servido")) return "listo";
  if (filas.some((fila) => fila.etapa === "en_proceso")) return "en_preparacion";
  return "enviado";
}

export type CuentaEnCurso = {
  id: number;
  mesaId: number;
  mesa: number;
  mesero: string;
  estado: EstadoCuenta;
  abiertaEn: string;
  hace: string;
  totalCentavos: number;
  ordenes: {
    id: number;
    numero: number;
    creadaEn: string;
    etapa: EtapaOrden;
    lineas: LineaEfectiva[];
  }[];
};

type CuentaActivaRow = { id: number; abierta_en: string; mesero: string | null };

/** Las cuentas que todavía aceptan consumo, para la pantalla Órdenes. */
export function listarCuentasActivas(db: Database.Database, ahoraMs = Date.now()): CuentaEnCurso[] {
  const rows = db
    .prepare(
      `SELECT c.id, c.abierta_en, e.nombre AS mesero
       FROM cuentas c
       LEFT JOIN empleados e ON e.id = c.abierta_por_empleado_id
       WHERE c.estado IN ('abierta', 'precuenta_emitida')
       ORDER BY c.id`,
    )
    .all() as CuentaActivaRow[];
  return rows.map((row) => {
    const detalle = obtenerCuenta(db, row.id);
    return {
      id: detalle.id,
      mesaId: detalle.mesa.id,
      mesa: detalle.mesa.numero,
      mesero: row.mesero ?? "—",
      estado: detalle.estado,
      abiertaEn: row.abierta_en,
      hace: haceCuanto(row.abierta_en, ahoraMs),
      totalCentavos: totalEfectivoCuenta(db, detalle.id),
      ordenes: detalle.ordenes.map((orden) => ({
        id: orden.id,
        numero: orden.numero,
        creadaEn: orden.creadaEn,
        etapa: etapaDeOrden(db, orden.id),
        lineas: orden.lineas,
      })),
    };
  });
}
