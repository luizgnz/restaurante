import type Database from "better-sqlite3";
import type { AppConfig } from "../../config.ts";
import { selloCuenta, snapshotCuenta } from "../cuentas/totales.ts";
import { empleadoPorId, exigirPin, PinError, type Empleado } from "../empleados/empleados.ts";
import { sesionAbierta } from "../empleados/sesion.ts";
import { firmar, firmarReservadoDeCuenta } from "../inventario/asientos.ts";

export type CodigoCaja =
  | "precuenta_requerida"
  | "pedido_cerrado"
  | "lineas_sin_enviar"
  | "cuenta_inexistente"
  | "cuenta_cerrada"
  | "precuenta_desactualizada";

export class CajaError extends Error {
  codigo: CodigoCaja;
  constructor(codigo: CodigoCaja, message: string) {
    super(message);
    this.name = "CajaError";
    this.codigo = codigo;
  }
}

type PrecuentaLegacy = { id: number; snapshot_json: string };

/**
 * Quién hace el handoff: el PIN si vino, y si no el administrador de la sesión.
 *
 * `enviar_a_caja_requiere_avanzado` decide qué derecho pide el PIN. Encendida
 * (el default) hace falta avanzado. Apagada, la opción promete justo lo
 * contrario —"el mesero básico también cierra el servicio hacia caja"—, así que
 * la entrega queda al alcance del mismo derecho que ya emite la precuenta.
 * `minimo` no alcanza en ninguno de los dos casos.
 *
 * El camino sin PIN no cambia: una sesión solo la abre un administrador, y
 * relajar ahí no le agrega nada a la opción.
 *
 * Se exporta para que la capa HTTP autorice **antes** de contestar un error de
 * dominio, sin duplicar la regla: el handoff valida la cuenta antes que el PIN.
 */
export async function quienCobra(db: Database.Database, pin: string | undefined, cfg: AppConfig): Promise<Empleado> {
  if (pin) return exigirPin(db, pin, cfg.enviar_a_caja_requiere_avanzado ? "caja" : "precuenta");
  const s = sesionAbierta(db);
  if (!s) throw new PinError("credenciales_invalidas", "Hace falta sesión");
  const e = empleadoPorId(db, s.administrador.id);
  if (!e) throw new PinError("credenciales_invalidas", "Hace falta sesión");
  if (e.derecho !== "avanzado") throw new PinError("sin_derecho", "Sin derecho para esta acción");
  return e;
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

  const mesero = await quienCobra(db, pin, cfg);
  const vigente = db.prepare("SELECT id, snapshot_json FROM precuentas WHERE pedido_id = ? AND vigente = 1").get(
    pedidoId,
  ) as PrecuentaLegacy | undefined;
  if (cfg.precuenta_obligatoria_antes_de_caja && !vigente) {
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
    // Sin precuenta va NULL, no 0: `precuenta_id` apunta a `precuentas(id)` y el
    // 0 nunca fue un id, así que con `precuenta_obligatoria_antes_de_caja = false`
    // el handoff moría con un error crudo de FOREIGN KEY en vez de guardarse.
    const info = db
      .prepare(
        "INSERT INTO caja_handoffs (pedido_id, precuenta_id, mesero_id, snapshot_json, creado_en) VALUES (?, ?, ?, ?, ?)",
      )
      .run(pedidoId, vigente?.id ?? null, mesero.id, vigente?.snapshot_json ?? "{}", new Date().toISOString());
    return { handoffId: Number(info.lastInsertRowid) };
  })();
}

// ---------------------------------------------------------------------------
// Handoff por cuenta (modelo Cuenta → Órdenes).
// ---------------------------------------------------------------------------

type CuentaParaCaja = { id: number; estado: string };

function cuentaParaCaja(db: Database.Database, cuentaId: number): CuentaParaCaja {
  const cuenta = db.prepare("SELECT id, estado FROM cuentas WHERE id = ?").get(cuentaId) as
    | CuentaParaCaja
    | undefined;
  if (!cuenta) throw new CajaError("cuenta_inexistente", "Cuenta inexistente");
  if (cuenta.estado === "en_caja") throw new CajaError("cuenta_cerrada", "La cuenta ya está en caja");
  if (cuenta.estado === "cancelada") throw new CajaError("cuenta_cerrada", "La cuenta está cancelada");
  return cuenta;
}

type PrecuentaDeCuenta = { id: number; snapshot_json: string };

/**
 * La última precuenta de la cuenta, si está al día. Lanza si existe y quedó
 * atrás; devuelve `undefined` solo cuando nunca se emitió ninguna.
 *
 * Mira la última **sin filtrar por `vigente`** a propósito. Filtrar por la
 * bandera dejaba el caso real fuera de alcance: el camino normal la apaga al
 * enviar una orden o corregir, así que caja veía "no hay precuenta" y pedía una
 * primera (`precuenta_requerida`) cuando el problema era otro, y con la
 * precuenta opcional pasaba de largo y cobraba en silencio un total distinto del
 * que el cliente había visto. `precuenta_desactualizada` solo se alcanzaba
 * reviviendo la bandera a mano.
 *
 * Lo que decide es el sello, que se recalcula desde las órdenes y no se puede
 * maquillar con un UPDATE; la bandera es una consecuencia, no la prueba.
 */
function precuentaCobrable(db: Database.Database, cuentaId: number): PrecuentaDeCuenta | undefined {
  const ultima = db
    .prepare("SELECT id, snapshot_json FROM precuentas WHERE cuenta_id = ? ORDER BY numero DESC LIMIT 1")
    .get(cuentaId) as PrecuentaDeCuenta | undefined;
  if (!ultima) return undefined;
  const sello = (JSON.parse(ultima.snapshot_json) as { sello?: string }).sello;
  if (sello !== selloCuenta(db, cuentaId)) {
    throw new CajaError(
      "precuenta_desactualizada",
      "La última precuenta no refleja la última orden o corrección; hay que reemitirla",
    );
  }
  return ultima;
}

/**
 * Cierra la cuenta y la entrega a caja.
 *
 * Firma **siempre** cualquier reserva que el libro deje pendiente, sin preguntar
 * por la política: si la política cambió entre el envío y el cobro, esas unidades
 * ya están apartadas y nadie más las va a firmar. `firmarReservadoDeCuenta` no
 * descuenta dos veces —solo toca lo que sigue reservado—, así que hacerlo
 * incondicional es seguro incluso cuando la precuenta ya firmó.
 *
 * El `firmar` legacy no se llama acá: las dos rutas juntas descontarían el stock
 * dos veces.
 */
export async function enviarCuentaACaja(
  db: Database.Database,
  cuentaId: number,
  pin: string | undefined,
  cfg: AppConfig,
): Promise<{ handoffId: number }> {
  cuentaParaCaja(db, cuentaId);
  const mesero = await quienCobra(db, pin, cfg);

  return db.transaction(() => {
    // Se relee dentro de la transacción: entre el `await` del PIN y el commit
    // otra sesión pudo cerrar la cuenta o agregar una orden.
    cuentaParaCaja(db, cuentaId);
    // Una precuenta que quedó atrás frena siempre, la exija la configuración o
    // no: el cliente ya vio ese documento y cobrar otro total en silencio es
    // peor que pedir que se reemita. La opción solo decide si hace falta una
    // primera precuenta.
    const precuenta = precuentaCobrable(db, cuentaId);
    if (!precuenta && cfg.precuenta_obligatoria_antes_de_caja) {
      throw new CajaError("precuenta_requerida", "Hace falta emitir una precuenta antes del handoff");
    }
    // Sin precuenta el handoff se lleva la cuenta como está en este momento; no
    // hay documento previo que copiar y "{}" no le sirve a caja.
    const snapshot = precuenta?.snapshot_json ?? JSON.stringify(snapshotCuenta(db, cuentaId));

    firmarReservadoDeCuenta(db, cuentaId);

    const ahora = new Date().toISOString();
    db.prepare("UPDATE cuentas SET estado = 'en_caja', cerrada_en = ? WHERE id = ?").run(ahora, cuentaId);
    const handoffId = Number(
      db
        .prepare(
          "INSERT INTO caja_handoffs (pedido_id, cuenta_id, precuenta_id, mesero_id, snapshot_json, creado_en) VALUES (NULL, ?, ?, ?, ?, ?)",
        )
        .run(cuentaId, precuenta?.id ?? null, mesero.id, snapshot, ahora).lastInsertRowid,
    );
    return { handoffId };
  })();
}
