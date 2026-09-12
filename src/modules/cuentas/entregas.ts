import type Database from "better-sqlite3";
import type { AppConfig } from "../../config.ts";

export class EntregaError extends Error {
  codigo: string;
  constructor(codigo: string, message: string) {
    super(message);
    this.name = "EntregaError";
    this.codigo = codigo;
  }
}

type OrigenEntrega = "manual" | "automatica" | "retiro";

function datosOrden(db: Database.Database, ordenId: number) {
  const orden = db.prepare(
    `SELECT o.id, o.cuenta_id, cu.tipo_servicio, cu.estado AS cuenta_estado
     FROM ordenes o JOIN cuentas cu ON cu.id = o.cuenta_id WHERE o.id = ?`,
  ).get(ordenId) as { id: number; cuenta_id: number; tipo_servicio: "mesa" | "para_llevar"; cuenta_estado: string } | undefined;
  if (!orden) throw new EntregaError("orden_inexistente", "La orden no existe");
  return orden;
}

export function marcarOrdenEntregada(
  db: Database.Database,
  ordenId: number,
  empleadoId: number | null,
  origen: OrigenEntrega,
): { ordenId: number; origen: OrigenEntrega; repetida: boolean } {
  return db.transaction(() => {
    const orden = datosOrden(db, ordenId);
    const previa = db.prepare("SELECT origen FROM entregas_ordenes WHERE orden_id = ?").get(ordenId) as { origen: OrigenEntrega } | undefined;
    if (previa) return { ordenId, origen: previa.origen, repetida: true };
    const lineas = db.prepare(
      `SELECT cl.id, cl.etapa FROM comanda_lineas cl
       JOIN comandas c ON c.id = cl.comanda_id
       WHERE c.orden_id = ? AND cl.etapa NOT IN ('aviso', 'cancelado')`,
    ).all(ordenId) as Array<{ id: number; etapa: string }>;
    if (lineas.length === 0) throw new EntregaError("orden_sin_productos", "La orden no tiene productos para entregar");
    if (lineas.some((linea) => linea.etapa !== "listo" && linea.etapa !== "servido")) {
      throw new EntregaError("orden_no_lista", "La orden todavía no está lista para entregar");
    }
    const ahora = new Date().toISOString();
    db.prepare(
      `UPDATE comanda_lineas SET etapa = 'servido', etapa_actualizada_en = ?
       WHERE id IN (
         SELECT cl.id FROM comanda_lineas cl JOIN comandas c ON c.id = cl.comanda_id
         WHERE c.orden_id = ? AND cl.etapa = 'listo'
       )`,
    ).run(ahora, ordenId);
    db.prepare(
      "INSERT INTO entregas_ordenes (orden_id, origen, empleado_id, creada_en) VALUES (?, ?, ?, ?)",
    ).run(ordenId, origen, empleadoId, ahora);
    if (orden.tipo_servicio === "para_llevar" && origen === "retiro") {
      db.prepare("UPDATE cuentas SET estado = 'en_caja' WHERE id = ?").run(orden.cuenta_id);
    }
    return { ordenId, origen, repetida: false };
  })();
}

/** Aplica el respaldo automático solo a mesas; un pedido para llevar exige retiro explícito. */
export function aplicarEntregasAutomaticas(db: Database.Database, config: AppConfig): number {
  if (!config.entrega_automatica_si_no_confirma) return 0;
  const limite = new Date(Date.now() - config.entrega_automatica_minutos * 60_000).toISOString();
  const candidatas = db.prepare(
    `SELECT o.id
     FROM ordenes o
     JOIN cuentas cu ON cu.id = o.cuenta_id AND cu.tipo_servicio = 'mesa'
     WHERE cu.estado IN ('abierta', 'precuenta_emitida')
       AND NOT EXISTS (SELECT 1 FROM entregas_ordenes e WHERE e.orden_id = o.id)
       AND NOT EXISTS (
         SELECT 1 FROM cocina_incidencias i WHERE i.orden_id = o.id AND i.estado = 'pendiente'
       )
       AND EXISTS (
         SELECT 1 FROM comanda_lineas cl JOIN comandas c ON c.id = cl.comanda_id
         WHERE c.orden_id = o.id AND cl.etapa = 'listo'
       )
       AND NOT EXISTS (
         SELECT 1 FROM comanda_lineas cl JOIN comandas c ON c.id = cl.comanda_id
         WHERE c.orden_id = o.id AND cl.etapa NOT IN ('listo', 'servido', 'aviso', 'cancelado')
       )
       AND COALESCE((
         SELECT MAX(cl.etapa_actualizada_en) FROM comanda_lineas cl JOIN comandas c ON c.id = cl.comanda_id
         WHERE c.orden_id = o.id AND cl.etapa = 'listo'
       ), '9999-12-31') <= ?`,
  ).all(limite) as Array<{ id: number }>;
  let aplicadas = 0;
  for (const orden of candidatas) {
    marcarOrdenEntregada(db, orden.id, null, "automatica");
    aplicadas += 1;
  }
  return aplicadas;
}
