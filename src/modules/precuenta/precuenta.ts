import type Database from "better-sqlite3";
import type { AppConfig } from "../../config.ts";
import { empleadoPorId, exigirPin, PinError } from "../empleados/empleados.ts";
import { sesionAbierta } from "../empleados/sesion.ts";
import { firmar } from "../inventario/asientos.ts";
import { despacharJobs, encolarJob } from "../../print/queue.ts";
import type { PrinterPort } from "../../print/types.ts";

const LEYENDA = "Esto no es boleta ni factura. El documento tributario lo emite caja.";

function lineasDePedido(db: Database.Database, pedidoId: number) {
  return db
    .prepare(
      `SELECT pl.producto_id AS productoId, pl.cantidad, pl.precio_centavos, p.nombre
       FROM pedido_lineas pl JOIN productos p ON p.id = pl.producto_id
       WHERE pl.pedido_id = ? AND pl.estado != 'anulada_antes_de_enviar'`,
    )
    .all(pedidoId) as { productoId: number; cantidad: number; precio_centavos: number; nombre: string }[];
}

export async function emitirPrecuenta(
  db: Database.Database,
  pedidoId: number,
  pin: string | undefined,
  printer: PrinterPort,
  cfg: AppConfig,
): Promise<{ precuentaId: number; numero: number; totalCentavos: number }> {
  const mesero = pin
    ? await exigirPin(db, pin, "precuenta")
    : (() => {
        const s = sesionAbierta(db);
        if (!s) throw new PinError("credenciales_invalidas", "Hace falta sesión");
        const e = empleadoPorId(db, s.administrador.id);
        if (!e) throw new PinError("credenciales_invalidas", "Hace falta sesión");
        return e;
      })();
  const pedido = db.prepare("SELECT mesa_id, cubiertos FROM pedidos WHERE id = ?").get(pedidoId) as {
    mesa_id: number | null;
    cubiertos: number;
  };
  const mesa = pedido.mesa_id
    ? (db.prepare("SELECT numero FROM mesas WHERE id = ?").get(pedido.mesa_id) as { numero: number })
    : null;
  const lineas = lineasDePedido(db, pedidoId);
  const totalCentavos = lineas.reduce((acc, l) => acc + l.precio_centavos * l.cantidad, 0);
  const snapshot = {
    mesaNumero: mesa?.numero ?? null,
    cubiertos: pedido.cubiertos,
    mesero: mesero.nombre,
    lineas: lineas.map((l) => ({
      nombre: l.nombre,
      cantidad: l.cantidad,
      precio_centavos: l.precio_centavos,
    })),
    totalCentavos,
    leyenda: LEYENDA,
  };

  const result = db.transaction(() => {
    db.prepare("UPDATE precuentas SET vigente = 0 WHERE pedido_id = ?").run(pedidoId);
    const prev = db.prepare("SELECT max(numero) AS n FROM precuentas WHERE pedido_id = ?").get(pedidoId) as {
      n: number | null;
    };
    const numero = (prev.n ?? 0) + 1;
    const info = db
      .prepare(
        "INSERT INTO precuentas (pedido_id, numero, vigente, mesero_id, snapshot_json, emitida_en) VALUES (?, ?, 1, ?, ?, ?)",
      )
      .run(pedidoId, numero, mesero.id, JSON.stringify(snapshot), new Date().toISOString());
    db.prepare("UPDATE pedidos SET estado = 'precuenta_emitida', mesero_id = ? WHERE id = ?").run(mesero.id, pedidoId);
    firmar(
      db,
      lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })),
      "precuenta",
      cfg.politica_inventario,
    );
    const precuentaId = Number(info.lastInsertRowid);
    encolarJob(db, "precuenta", {
      mesaNumero: snapshot.mesaNumero,
      mesero: snapshot.mesero,
      cubiertos: snapshot.cubiertos,
      lineas: snapshot.lineas,
      totalCentavos: snapshot.totalCentavos,
    });
    return { precuentaId, numero, totalCentavos };
  })();

  await despacharJobs(db, printer);
  return result;
}

export async function reimprimirPrecuenta(
  db: Database.Database,
  precuentaId: number,
  printer: PrinterPort,
): Promise<{ numero: number }> {
  const row = db.prepare("SELECT numero, snapshot_json FROM precuentas WHERE id = ?").get(precuentaId) as
    | { numero: number; snapshot_json: string }
    | undefined;
  if (!row) throw new Error("precuenta_inexistente");
  const snap = JSON.parse(row.snapshot_json) as {
    mesaNumero: number | null;
    mesero: string;
    cubiertos: number;
    lineas: { nombre: string; cantidad: number; precio_centavos: number }[];
    totalCentavos: number;
  };
  encolarJob(db, "precuenta", {
    mesaNumero: snap.mesaNumero,
    mesero: snap.mesero,
    cubiertos: snap.cubiertos,
    lineas: snap.lineas,
    totalCentavos: snap.totalCentavos,
    reimpresion: true,
  });
  await despacharJobs(db, printer);
  return { numero: row.numero };
}
