import type Database from "better-sqlite3";

export type EstadoMesa = "libre" | "ocupada" | "en_cocina" | "precuenta" | "en_caja";

export class SalonError extends Error {
  codigo: string;
  constructor(codigo: string, message: string) {
    super(message);
    this.name = "SalonError";
    this.codigo = codigo;
  }
}

type PedidoRow = { id: number; estado: string };

function pedidoAbierto(db: Database.Database, mesaId: number): PedidoRow | undefined {
  return db
    .prepare(
      "SELECT id, estado FROM pedidos WHERE mesa_id = ? AND estado NOT IN ('en_caja', 'cancelado') ORDER BY id DESC LIMIT 1",
    )
    .get(mesaId) as PedidoRow | undefined;
}

export function pedidoIdAbierto(db: Database.Database, mesaId: number): number | null {
  return pedidoAbierto(db, mesaId)?.id ?? null;
}

export function estadoMesa(db: Database.Database, mesaId: number): EstadoMesa {
  const pedido = pedidoAbierto(db, mesaId);
  if (!pedido) return "libre";
  if (pedido.estado === "precuenta_emitida") return "precuenta";
  if (pedido.estado === "enviado" || pedido.estado === "parcialmente_enviado") return "en_cocina";
  return "ocupada";
}

export function abrirMesa(
  db: Database.Database,
  input: { mesaId: number; cubiertos: number; preset: string; meseroId: number },
): { pedidoId: number } {
  if (input.cubiertos <= 0) throw new SalonError("cubiertos_requeridos", "Hay que indicar cubiertos");
  if (pedidoAbierto(db, input.mesaId)) throw new SalonError("mesa_ocupada", "mesa_ocupada");
  const info = db
    .prepare(
      "INSERT INTO pedidos (mesa_id, preset, cubiertos, estado, mesero_id, abierto_en) VALUES (?, ?, ?, 'borrador', ?, ?)",
    )
    .run(input.mesaId, input.preset, input.cubiertos, input.meseroId, new Date().toISOString());
  return { pedidoId: Number(info.lastInsertRowid) };
}

export function abrirTab(
  db: Database.Database,
  input: { cubiertos: number; preset: string; meseroId: number },
): { pedidoId: number } {
  const info = db
    .prepare(
      "INSERT INTO pedidos (mesa_id, preset, cubiertos, estado, mesero_id, abierto_en) VALUES (NULL, ?, ?, 'borrador', ?, ?)",
    )
    .run(input.preset, input.cubiertos, input.meseroId, new Date().toISOString());
  return { pedidoId: Number(info.lastInsertRowid) };
}

export function asignarMesa(db: Database.Database, pedidoId: number, mesaId: number): void {
  const pedido = db.prepare("SELECT id, estado FROM pedidos WHERE id = ?").get(pedidoId) as PedidoRow | undefined;
  if (!pedido) throw new SalonError("pedido_inexistente", "Pedido inexistente");
  if (pedido.estado === "en_caja" || pedido.estado === "cancelado") {
    throw new SalonError("pedido_cerrado", "Pedido cerrado");
  }
  if (pedidoAbierto(db, mesaId)) throw new SalonError("mesa_ocupada", "mesa_ocupada");
  db.prepare("UPDATE pedidos SET mesa_id = ? WHERE id = ?").run(mesaId, pedidoId);
}

export function liberarMesa(db: Database.Database, mesaId: number): void {
  const pedido = pedidoAbierto(db, mesaId);
  if (!pedido) return;
  const lineas = db.prepare("SELECT count(*) AS c FROM pedido_lineas WHERE pedido_id = ?").get(pedido.id) as { c: number };
  if (lineas.c > 0) throw new SalonError("pedido_con_lineas", "No se libera una mesa con consumo");
  db.prepare("UPDATE pedidos SET estado = 'cancelado' WHERE id = ?").run(pedido.id);
}
