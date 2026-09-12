import type Database from "better-sqlite3";

export type EtapaOrden = "enviado" | "en_preparacion" | "listo" | "entregado";

/**
 * Resume la etapa de cocina de una orden para gobernar sus acciones.
 * Una mezcla de líneas pendientes y ya trabajadas se considera en preparación:
 * desde el primer movimiento de cocina la orden deja de ser editable.
 */
export function etapaDeOrden(db: Database.Database, ordenId: number): EtapaOrden {
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
  if (filas.some((fila) => fila.etapa === "en_proceso" || fila.etapa === "listo" || fila.etapa === "servido")) {
    return "en_preparacion";
  }
  return "enviado";
}

export function ordenIniciadaEnCocina(db: Database.Database, ordenId: number): boolean {
  return etapaDeOrden(db, ordenId) !== "enviado";
}
