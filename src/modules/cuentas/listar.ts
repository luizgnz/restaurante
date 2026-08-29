import type Database from "better-sqlite3";
import type { LineaEfectiva } from "../ordenes/ordenes.ts";
import { haceCuanto } from "../tiempo.ts";
import { obtenerCuenta, type EstadoCuenta } from "./cuentas.ts";
import { totalEfectivoCuenta } from "./totales.ts";

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
    lineas: LineaEfectiva[];
  }[];
};

type CuentaActivaRow = { id: number; abierta_en: string; mesero: string | null };

/** Las cuentas que todavía aceptan consumo, para la pantalla Órdenes y las barras del plano. */
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
        lineas: orden.lineas,
      })),
    };
  });
}
