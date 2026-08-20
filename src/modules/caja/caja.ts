import type Database from "better-sqlite3";
import type { AppConfig } from "../../config.ts";
import { empleadoPorId, exigirPin, PinError } from "../empleados/empleados.ts";
import { sesionAbierta } from "../empleados/sesion.ts";
import { firmar } from "../inventario/asientos.ts";

export class CajaError extends Error {
  codigo: "precuenta_requerida" | "pedido_cerrado" | "lineas_sin_enviar";
  constructor(codigo: "precuenta_requerida" | "pedido_cerrado" | "lineas_sin_enviar", message: string) {
    super(message);
    this.name = "CajaError";
    this.codigo = codigo;
  }
}

export async function enviarACaja(
  db: Database.Database,
  pedidoId: number,
  pin: string | undefined,
  cfg: AppConfig,
): Promise<{ handoffId: number }> {
  const pedido = db.prepare("SELECT estado FROM pedidos WHERE id = ?").get(pedidoId) as { estado: string } | undefined;
  if (!pedido) throw new CajaError("pedido_cerrado", "Pedido inexistente");
  if (pedido.estado === "en_caja") throw new CajaError("pedido_cerrado", "Pedido ya enviado a caja");

  const mesero = pin
    ? await exigirPin(db, pin, "caja")
    : (() => {
        const s = sesionAbierta(db);
        if (!s) throw new PinError("credenciales_invalidas", "Hace falta sesión");
        const e = empleadoPorId(db, s.administrador.id);
        if (!e) throw new PinError("credenciales_invalidas", "Hace falta sesión");
        if (e.derecho !== "avanzado") throw new PinError("sin_derecho", "Sin derecho para esta acción");
        return e;
      })();
  const vigentes = db.prepare("SELECT id, snapshot_json FROM precuentas WHERE pedido_id = ? AND vigente = 1").get(
    pedidoId,
  ) as { id: number; snapshot_json: string } | undefined;
  if (cfg.precuenta_obligatoria_antes_de_caja && !vigentes) {
    throw new CajaError("precuenta_requerida", "Hace falta una precuenta vigente");
  }
  const nuevas = db.prepare("SELECT count(*) AS c FROM pedido_lineas WHERE pedido_id = ? AND estado = 'nueva'").get(
    pedidoId,
  ) as { c: number };
  if (nuevas.c > 0) throw new CajaError("lineas_sin_enviar", "Hay líneas sin enviar a cocina");

  const lineas = db
    .prepare("SELECT producto_id AS productoId, cantidad FROM pedido_lineas WHERE pedido_id = ?")
    .all(pedidoId) as { productoId: number; cantidad: number }[];

  return db.transaction(() => {
    firmar(db, lineas, "caja", cfg.politica_inventario);
    db.prepare("UPDATE pedidos SET estado = 'en_caja' WHERE id = ?").run(pedidoId);
    const info = db
      .prepare(
        "INSERT INTO caja_handoffs (pedido_id, precuenta_id, mesero_id, snapshot_json, creado_en) VALUES (?, ?, ?, ?, ?)",
      )
      .run(pedidoId, vigentes?.id ?? 0, mesero.id, vigentes?.snapshot_json ?? "{}", new Date().toISOString());
    return { handoffId: Number(info.lastInsertRowid) };
  })();
}
