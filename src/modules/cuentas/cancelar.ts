import type Database from "better-sqlite3";
import {
  devolverConsumoDeLineas,
  firmarReservasDeLineas,
  registrarMermaDeAnulacion,
  type MermaAnulacion,
} from "../inventario/asientos.ts";
import { exigirPin } from "../empleados/empleados.ts";
import { cancelarLineasDeOrden, lineaPreparada } from "../kds/kds.ts";
import { versionVigenteOrden, type LineaVigente } from "../ordenes/ordenes.ts";
import { totalVigenteCuenta } from "./totales.ts";

export class CancelarCuentaError extends Error {
  codigo: "cuenta_inexistente" | "cuenta_cerrada" | "justificacion_requerida";
  constructor(codigo: "cuenta_inexistente" | "cuenta_cerrada" | "justificacion_requerida", message: string) {
    super(message);
    this.name = "CancelarCuentaError";
    this.codigo = codigo;
  }
}

export type ResultadoCancelacion = {
  cuentaId: number;
  mesaId: number;
  mesaNumero: number;
  ordenes: number;
  lineasPreparadas: number;
  lineasLiberadas: number;
  totalCentavos: number;
};

/**
 * Cancela una cuenta activa y libera la mesa.
 *
 * Es la salida que tenía el negocio bloqueada: clientes que se van sin pedir,
 * pedidos anulados completos, errores de apertura. El estado pasa a
 * `cancelada` —que el salón ya no cuenta como ocupada— y el inventario se
 * reparte según lo que cocina realmente hizo y la política del negocio
 * (`devolverInsumosPreparados`, default `true`):
 *
 * - líneas **sin empezar**: sus reservas (y firmados, si los hubiera) vuelven al
 *   stock; nunca hubo consumo real;
 * - líneas **preparadas** (`en_proceso`/`listo`/`servido`): por defecto sus
 *   insumos también vuelven, porque el restaurante los reutiliza; con la
 *   política de merma quedan consumidos y se documenta la salida en el kardex
 *   con motivo `anulacion_preparacion`.
 *
 * El motivo es obligatorio y queda en `cancelaciones_cuentas` con el monto que
 * tenía la cuenta: es la pista que explica por qué una mesa cerró sin cobro.
 */
export async function cancelarCuenta(
  db: Database.Database,
  input: { cuentaId: number; pin: string; motivo: string | null; devolverInsumosPreparados: boolean },
): Promise<ResultadoCancelacion> {
  const motivo = input.motivo?.trim() ?? "";
  if (!motivo) {
    throw new CancelarCuentaError("justificacion_requerida", "Para cancelar la cuenta hay que registrar el motivo");
  }
  const empleado = await exigirPin(db, input.pin, "cancelar_cuenta");

  const resultado = db.transaction((): ResultadoCancelacion => {
    const cuenta = db
      .prepare("SELECT id, mesa_id, estado FROM cuentas WHERE id = ?")
      .get(input.cuentaId) as { id: number; mesa_id: number; estado: string } | undefined;
    if (!cuenta) throw new CancelarCuentaError("cuenta_inexistente", "Cuenta inexistente");
    if (cuenta.estado !== "abierta" && cuenta.estado !== "precuenta_emitida") {
      throw new CancelarCuentaError("cuenta_cerrada", "La cuenta ya no se puede cancelar");
    }

    const ordenes = db.prepare("SELECT id, numero FROM ordenes WHERE cuenta_id = ? ORDER BY id").all(cuenta.id) as {
      id: number;
      numero: number;
    }[];
    const totalCentavos = totalVigenteCuenta(db, cuenta.id);

    let lineasPreparadas = 0;
    let lineasLiberadas = 0;
    const ordenLineaIds: number[] = [];
    const correccionLineaIds: number[] = [];
    for (const orden of ordenes) {
      const vigentes = versionVigenteOrden(db, orden.id) as LineaVigente[];
      const mermaDeOrden: MermaAnulacion[] = [];
      const clavesDevueltas: string[] = [];
      for (const linea of vigentes) {
        if (linea.cantidad <= 0) continue;
        const preparada = lineaPreparada(db, linea.lineaClave, linea.ordenLineaId);
        if (preparada) lineasPreparadas += linea.cantidad;
        if (preparada && !input.devolverInsumosPreparados) {
          mermaDeOrden.push({
            lineaClave: linea.lineaClave,
            productoId: linea.productoId,
            unidades: linea.cantidad,
          });
        } else {
          clavesDevueltas.push(linea.lineaClave);
          lineasLiberadas += linea.cantidad;
        }
      }
      if (mermaDeOrden.length > 0) {
        firmarReservasDeLineas(
          db,
          orden.id,
          mermaDeOrden.map((m) => m.lineaClave),
        );
        registrarMermaDeAnulacion(db, orden.id, mermaDeOrden, empleado.id);
      }
      devolverConsumoDeLineas(db, orden.id, clavesDevueltas);
      // Las tareas pendientes de cocina quedan canceladas; lo terminal es historia.
      const ids = db
        .prepare("SELECT id FROM orden_lineas WHERE orden_id = ?")
        .all(orden.id) as { id: number }[];
      ordenLineaIds.push(...ids.map((f) => f.id));
      const correccionIds = db
        .prepare(
          `SELECT ocl.id FROM orden_correccion_lineas ocl
           JOIN orden_correcciones oc ON oc.id = ocl.correccion_id
           WHERE oc.orden_id = ?`,
        )
        .all(orden.id) as { id: number }[];
      correccionLineaIds.push(...correccionIds.map((f) => f.id));
    }

    cancelarLineasDeOrden(db, { ordenLineaIds, correccionLineaIds });
    db.prepare("UPDATE precuentas SET vigente = 0 WHERE cuenta_id = ?").run(cuenta.id);
    db.prepare("UPDATE cuentas SET estado = 'cancelada' WHERE id = ?").run(cuenta.id);

    const mesa = db.prepare("SELECT numero FROM mesas WHERE id = ?").get(cuenta.mesa_id) as { numero: number };
    db
      .prepare(
        `INSERT INTO cancelaciones_cuentas
          (cuenta_id, mesa_id, mesa_numero, empleado_id, motivo, total_centavos, ordenes, lineas_preparadas, lineas_liberadas, creada_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        cuenta.id,
        cuenta.mesa_id,
        mesa.numero,
        empleado.id,
        motivo,
        totalCentavos,
        ordenes.length,
        lineasPreparadas,
        lineasLiberadas,
        new Date().toISOString(),
      );

    return {
      cuentaId: cuenta.id,
      mesaId: cuenta.mesa_id,
      mesaNumero: mesa.numero,
      ordenes: ordenes.length,
      lineasPreparadas,
      lineasLiberadas,
      totalCentavos,
    };
  })();

  return resultado;
}
