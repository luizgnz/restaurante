import type Database from "better-sqlite3";
import type { AppConfig } from "../../config.ts";
import { snapshotCuenta, type SnapshotCuenta } from "../cuentas/totales.ts";
import { empleadoPorId, exigirPin, PinError, type Empleado } from "../empleados/empleados.ts";
import { sesionAbierta } from "../empleados/sesion.ts";
import { firmaReservaEn, firmar, firmarReservadoDeCuenta } from "../inventario/asientos.ts";
import { despacharJobs, encolarJob } from "../../print/queue.ts";
import type { PrinterPort, TicketLinea } from "../../print/types.ts";

const LEYENDA = "Esto no es boleta ni factura. El documento tributario lo emite caja.";

export type CodigoPrecuenta =
  | "cuenta_inexistente"
  | "cuenta_cerrada"
  | "cuenta_sin_consumo"
  | "precuenta_inexistente";

export class PrecuentaError extends Error {
  codigo: CodigoPrecuenta;
  constructor(codigo: CodigoPrecuenta, message: string) {
    super(message);
    this.name = "PrecuentaError";
    this.codigo = codigo;
  }
}

/**
 * Quién emite: el PIN si vino, y si no el administrador de la sesión abierta.
 * Es la misma regla que ya usaba el flujo legacy.
 *
 * Se exporta para que la capa HTTP pueda autorizar **antes** de contestar un
 * error de dominio, sin reimplementar la regla: emitir valida la cuenta antes que
 * el PIN, así que sin eso un cliente sin credenciales aprendería qué cuentas
 * existen por la forma del error.
 */
export async function quienEmite(db: Database.Database, pin: string | undefined): Promise<Empleado> {
  if (pin) return exigirPin(db, pin, "precuenta");
  const s = sesionAbierta(db);
  if (!s) throw new PinError("credenciales_invalidas", "Hace falta sesión");
  const e = empleadoPorId(db, s.administrador.id);
  if (!e) throw new PinError("credenciales_invalidas", "Hace falta sesión");
  return e;
}

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
  const mesero = await quienEmite(db, pin);
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

export type SnapshotPrecuentaCuenta = SnapshotCuenta & {
  mesero: string;
  leyenda: string;
};

type CuentaParaPrecuenta = { id: number; estado: string };

function cuentaParaPrecuenta(db: Database.Database, cuentaId: number): CuentaParaPrecuenta {
  const cuenta = db.prepare("SELECT id, estado FROM cuentas WHERE id = ?").get(cuentaId) as
    | CuentaParaPrecuenta
    | undefined;
  if (!cuenta) throw new PrecuentaError("cuenta_inexistente", "Cuenta inexistente");
  if (cuenta.estado === "en_caja" || cuenta.estado === "cancelada") {
    throw new PrecuentaError("cuenta_cerrada", "La cuenta ya está cerrada");
  }
  return cuenta;
}

/** Las líneas de todas las órdenes, aplanadas para el ticket. */
function lineasParaTicket(snapshot: SnapshotCuenta): TicketLinea[] {
  return snapshot.ordenes.flatMap((orden) =>
    orden.lineas.map((l) => ({
      nombre: l.nombre,
      cantidad: l.cantidad,
      precio_centavos: l.precioCentavos,
      nota: l.nota,
    })),
  );
}

/**
 * Emite la precuenta de una cuenta sobre la suma efectiva de todas sus órdenes.
 *
 * Reemitir es normal: cada orden o corrección posterior invalida la precuenta
 * vigente, así que la cuenta acumula varias y solo la última cuenta. La firma no
 * se duplica por eso: `firmarReservadoDeCuenta` firma únicamente lo que el libro
 * declara reservado, y la segunda emisión no encuentra nada de la primera ronda.
 *
 * El `firmar` legacy no se llama acá. Llamar a los dos descontaría el stock dos
 * veces y ninguna de las dos rutas se vería mal por separado.
 */
export async function emitirPrecuentaCuenta(
  db: Database.Database,
  cuentaId: number,
  pin: string | undefined,
  printer: PrinterPort,
  cfg: AppConfig,
): Promise<{ precuentaId: number; numero: number; totalCentavos: number }> {
  cuentaParaPrecuenta(db, cuentaId);
  const mesero = await quienEmite(db, pin);

  const result = db.transaction(() => {
    // Se relee dentro de la transacción: entre el `await` del PIN y el commit
    // otra sesión pudo mandar la cuenta a caja.
    cuentaParaPrecuenta(db, cuentaId);
    const base = snapshotCuenta(db, cuentaId);
    if (base.ordenes.length === 0) {
      throw new PrecuentaError("cuenta_sin_consumo", "La cuenta no tiene consumo que cobrar");
    }
    const snapshot: SnapshotPrecuentaCuenta = { ...base, mesero: mesero.nombre, leyenda: LEYENDA };

    db.prepare("UPDATE precuentas SET vigente = 0 WHERE cuenta_id = ?").run(cuentaId);
    const prev = db.prepare("SELECT max(numero) AS n FROM precuentas WHERE cuenta_id = ?").get(cuentaId) as {
      n: number | null;
    };
    const numero = (prev.n ?? 0) + 1;
    const precuentaId = Number(
      db
        .prepare(
          "INSERT INTO precuentas (pedido_id, cuenta_id, numero, vigente, mesero_id, snapshot_json, emitida_en) VALUES (NULL, ?, ?, 1, ?, ?, ?)",
        )
        .run(cuentaId, numero, mesero.id, JSON.stringify(snapshot), new Date().toISOString()).lastInsertRowid,
    );
    db.prepare("UPDATE cuentas SET estado = 'precuenta_emitida' WHERE id = ?").run(cuentaId);

    // El momento lo decide la política; lo que se firma sale del libro.
    if (firmaReservaEn(cfg.politica_inventario, "precuenta")) {
      firmarReservadoDeCuenta(db, cuentaId);
    }

    // Sin `cubiertos`: la cuenta no los guarda y el ticket omite la línea.
    encolarJob(db, "precuenta", {
      mesaNumero: snapshot.mesaNumero,
      mesero: snapshot.mesero,
      lineas: lineasParaTicket(snapshot),
      totalCentavos: snapshot.totalCentavos,
    });
    return { precuentaId, numero, totalCentavos: snapshot.totalCentavos };
  })();

  await despacharJobs(db, printer);
  return result;
}

type SnapshotLegacy = {
  mesaNumero: number | null;
  mesero: string;
  cubiertos: number;
  lineas: { nombre: string; cantidad: number; precio_centavos: number }[];
  totalCentavos: number;
};

function esSnapshotDeCuenta(snap: SnapshotLegacy | SnapshotPrecuentaCuenta): snap is SnapshotPrecuentaCuenta {
  return Array.isArray((snap as SnapshotPrecuentaCuenta).ordenes);
}

export async function reimprimirPrecuenta(
  db: Database.Database,
  precuentaId: number,
  printer: PrinterPort,
): Promise<{ numero: number }> {
  const row = db.prepare("SELECT numero, snapshot_json FROM precuentas WHERE id = ?").get(precuentaId) as
    | { numero: number; snapshot_json: string }
    | undefined;
  // Con un `Error` pelado la ruta de reimpresión contestaba 500 por un id que el
  // cliente escribió mal.
  if (!row) throw new PrecuentaError("precuenta_inexistente", "Precuenta inexistente");
  const snap = JSON.parse(row.snapshot_json) as SnapshotLegacy | SnapshotPrecuentaCuenta;
  // Se reimprime el snapshot tal como se guardó; una cuenta agrupa por orden y
  // un pedido legacy no, así que el ticket se arma según la forma que tenga.
  encolarJob(db, "precuenta", {
    mesaNumero: snap.mesaNumero,
    mesero: snap.mesero,
    cubiertos: esSnapshotDeCuenta(snap) ? undefined : snap.cubiertos,
    lineas: esSnapshotDeCuenta(snap) ? lineasParaTicket(snap) : snap.lineas,
    totalCentavos: snap.totalCentavos,
    reimpresion: true,
  });
  await despacharJobs(db, printer);
  return { numero: row.numero };
}
