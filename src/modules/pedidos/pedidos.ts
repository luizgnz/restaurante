import type Database from "better-sqlite3";
import type { AppConfig } from "../../config.ts";
import { exigirPin } from "../empleados/empleados.ts";
import { liberarReserva, reservarPorEnvio } from "../inventario/asientos.ts";
import { crearComanda } from "../kds/kds.ts";
import { haceCuanto } from "../tiempo.ts";
import { despacharJobs, encolarJob } from "../../print/queue.ts";
import type { PrinterPort } from "../../print/types.ts";

export function agregarLinea(
  db: Database.Database,
  pedidoId: number,
  input: { productoId: number; cantidad: number; nota?: string },
): { lineaId: number } {
  const producto = db.prepare("SELECT precio_centavos FROM productos WHERE id = ?").get(input.productoId) as
    | { precio_centavos: number }
    | undefined;
  if (!producto) throw new Error("producto_inexistente");
  const info = db
    .prepare(
      "INSERT INTO pedido_lineas (pedido_id, producto_id, cantidad, nota, estado, precio_centavos) VALUES (?, ?, ?, ?, 'nueva', ?)",
    )
    .run(pedidoId, input.productoId, input.cantidad, input.nota ?? null, producto.precio_centavos);
  return { lineaId: Number(info.lastInsertRowid) };
}

export async function enviarACocina(
  db: Database.Database,
  pedidoId: number,
  pin: string,
  printer: PrinterPort,
  cfg: AppConfig,
): Promise<{ comandaId: number; jobId: number }> {
  const mesero = await exigirPin(db, pin, "enviar");
  const lineas = db
    .prepare(
      `SELECT pl.id, pl.producto_id, pl.cantidad, p.nombre
       FROM pedido_lineas pl JOIN productos p ON p.id = pl.producto_id
       WHERE pl.pedido_id = ? AND pl.estado = 'nueva'`,
    )
    .all(pedidoId) as { id: number; producto_id: number; cantidad: number; nombre: string }[];
  if (lineas.length === 0) throw new Error("sin_lineas_nuevas");

  const pedido = db.prepare("SELECT mesa_id FROM pedidos WHERE id = ?").get(pedidoId) as { mesa_id: number | null };
  const mesa = pedido.mesa_id
    ? (db.prepare("SELECT numero FROM mesas WHERE id = ?").get(pedido.mesa_id) as { numero: number })
    : null;
  const envioN = (
    db.prepare("SELECT count(*) AS c FROM comandas WHERE pedido_id = ?").get(pedidoId) as { c: number }
  ).c + 1;

  const result = db.transaction(() => {
    db.prepare("UPDATE pedidos SET mesero_id = ? WHERE id = ?").run(mesero.id, pedidoId);
    const ids = lineas.map((l) => l.id);
    db.prepare(`UPDATE pedido_lineas SET estado = 'enviada' WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
    const pendientes = db.prepare("SELECT count(*) AS c FROM pedido_lineas WHERE pedido_id = ? AND estado = 'nueva'").get(
      pedidoId,
    ) as { c: number };
    db.prepare("UPDATE pedidos SET estado = ? WHERE id = ?").run(
      pendientes.c > 0 ? "parcialmente_enviado" : "enviado",
      pedidoId,
    );
    const comandaId = crearComanda(db, { pedidoId, envioN, meseroId: mesero.id, lineaIds: ids });
    reservarPorEnvio(
      db,
      lineas.map((l) => ({ productoId: l.producto_id, cantidad: l.cantidad })),
      cfg.politica_inventario,
    );
    const jobId = encolarJob(db, "comanda", {
      mesaNumero: mesa?.numero ?? null,
      mesero: mesero.nombre,
      lineas: lineas.map((l) => ({ nombre: l.nombre, cantidad: l.cantidad })),
    });
    return { comandaId, jobId };
  })();

  await despacharJobs(db, printer);
  return result;
}

export class PedidoError extends Error {
  codigo: string;
  constructor(codigo: string, message: string) {
    super(message);
    this.name = "PedidoError";
    this.codigo = codigo;
  }
}

export function etapaDeLinea(db: Database.Database, lineaId: number): string | null {
  const row = db.prepare("SELECT etapa FROM comanda_lineas WHERE pedido_linea_id = ? ORDER BY id DESC LIMIT 1").get(
    lineaId,
  ) as { etapa: string } | undefined;
  return row?.etapa ?? null;
}

export function sePuedeEditarLinea(
  db: Database.Database,
  lineaId: number,
  cfg: AppConfig,
): boolean {
  const linea = db.prepare("SELECT estado FROM pedido_lineas WHERE id = ?").get(lineaId) as { estado: string } | undefined;
  if (!linea) return false;
  if (linea.estado === "nueva") return true;
  if (linea.estado !== "enviada") return false;
  if (!cfg.tablet_cocina) return false;
  const etapa = etapaDeLinea(db, lineaId);
  return etapa === "por_preparar";
}

export function cambiarCantidad(
  db: Database.Database,
  lineaId: number,
  cantidad: number,
  cfg: AppConfig,
): void {
  if (cantidad < 0) throw new PedidoError("cantidad_invalida", "Cantidad inválida");
  if (cantidad === 0) {
    quitarLinea(db, lineaId, cfg);
    return;
  }
  const linea = db.prepare("SELECT id, producto_id, cantidad, estado FROM pedido_lineas WHERE id = ?").get(lineaId) as
    | { id: number; producto_id: number; cantidad: number; estado: string }
    | undefined;
  if (!linea) throw new PedidoError("linea_inexistente", "Línea inexistente");
  if (!sePuedeEditarLinea(db, lineaId, cfg)) {
    if (linea.estado === "enviada" && !cfg.tablet_cocina) {
      throw new PedidoError("ya_impreso", "Con ticket en papel no se puede cambiar ni anular lo enviado");
    }
    throw new PedidoError("en_proceso", "Cocina ya lo tomó; no se puede cambiar");
  }
  const delta = cantidad - linea.cantidad;
  if (delta === 0) return;
  db.prepare("UPDATE pedido_lineas SET cantidad = ? WHERE id = ?").run(cantidad, lineaId);
  if (linea.estado !== "enviada") return;
  if (delta > 0) reservarPorEnvio(db, [{ productoId: linea.producto_id, cantidad: delta }], cfg.politica_inventario);
  else liberarReserva(db, [{ productoId: linea.producto_id, cantidad: -delta }]);
}

export function quitarLinea(db: Database.Database, lineaId: number, cfg: AppConfig): void {
  const linea = db.prepare("SELECT id, pedido_id, producto_id, cantidad, estado FROM pedido_lineas WHERE id = ?").get(
    lineaId,
  ) as { id: number; pedido_id: number; producto_id: number; cantidad: number; estado: string } | undefined;
  if (!linea) throw new PedidoError("linea_inexistente", "Línea inexistente");
  if (linea.estado === "nueva") {
    db.prepare("UPDATE pedido_lineas SET estado = 'anulada_antes_de_enviar' WHERE id = ?").run(lineaId);
    return;
  }
  if (linea.estado !== "enviada") throw new PedidoError("no_editable", "Esa línea ya no se puede anular");
  if (!cfg.tablet_cocina) {
    throw new PedidoError("ya_impreso", "Con ticket en papel no se puede cambiar ni anular lo enviado");
  }
  const etapa = etapaDeLinea(db, lineaId);
  if (etapa === "en_proceso" || etapa === "listo" || etapa === "servido") {
    throw new PedidoError("en_proceso", "Cocina ya lo tomó; no se puede cambiar");
  }
  const producto = db.prepare("SELECT nombre FROM productos WHERE id = ?").get(linea.producto_id) as { nombre: string };
  const pedido = db
    .prepare(
      `SELECT e.nombre AS mesero, m.numero AS mesa
       FROM pedidos p
       LEFT JOIN empleados e ON e.id = p.mesero_id
       LEFT JOIN mesas m ON m.id = p.mesa_id
       WHERE p.id = ?`,
    )
    .get(linea.pedido_id) as { mesero: string | null; mesa: number | null };
  db.transaction(() => {
    db.prepare("UPDATE pedido_lineas SET estado = 'anulada_en_cocina' WHERE id = ?").run(lineaId);
    db.prepare("UPDATE comanda_lineas SET etapa = 'cancelado' WHERE pedido_linea_id = ?").run(lineaId);
    liberarReserva(db, [{ productoId: linea.producto_id, cantidad: linea.cantidad }]);
    encolarJob(db, "anulacion", {
      mesaNumero: pedido.mesa,
      mesero: pedido.mesero ?? "—",
      lineas: [{ nombre: producto.nombre, cantidad: linea.cantidad }],
    });
  })();
}

export type PedidoEnCurso = {
  id: number;
  mesa: number | null;
  mesero: string;
  hace: string;
  abierto_en: string;
  lineas: { id: number; nombre: string; cantidad: number; estado: string; sePuedeEditar: boolean }[];
};

export function listarPedidosEnCurso(db: Database.Database, cfg: AppConfig, ahoraMs = Date.now()): PedidoEnCurso[] {
  const pedidos = db
    .prepare(
      `SELECT p.id, p.abierto_en, e.nombre AS mesero, m.numero AS mesa
       FROM pedidos p
       LEFT JOIN empleados e ON e.id = p.mesero_id
       LEFT JOIN mesas m ON m.id = p.mesa_id
       WHERE p.estado NOT IN ('en_caja', 'cancelado')
       ORDER BY p.id DESC`,
    )
    .all() as { id: number; abierto_en: string; mesero: string | null; mesa: number | null }[];
  return pedidos.map((p) => {
    const lineas = db
      .prepare(
        `SELECT pl.id, pl.cantidad, pl.estado, pr.nombre
         FROM pedido_lineas pl JOIN productos pr ON pr.id = pl.producto_id
         WHERE pl.pedido_id = ? AND pl.estado NOT LIKE 'anulada%'`,
      )
      .all(p.id) as { id: number; cantidad: number; estado: string; nombre: string }[];
    return {
      id: p.id,
      mesa: p.mesa,
      mesero: p.mesero ?? "—",
      abierto_en: p.abierto_en,
      hace: haceCuanto(p.abierto_en, ahoraMs),
      lineas: lineas.map((l) => ({
        id: l.id,
        nombre: l.nombre,
        cantidad: l.cantidad,
        estado: l.estado,
        sePuedeEditar: sePuedeEditarLinea(db, l.id, cfg),
      })),
    };
  });
}
