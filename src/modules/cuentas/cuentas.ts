import type Database from "better-sqlite3";
import { indicacionesVigentesOrden, versionVigenteOrden, type LineaVigente } from "../ordenes/ordenes.ts";

export type EstadoCuenta = "abierta" | "precuenta_emitida" | "en_caja" | "cancelada";
export type EstadoOrden = "enviada" | "corregida" | "anulada";

export class CuentaError extends Error {
  codigo: "cuenta_inexistente";
  constructor(codigo: "cuenta_inexistente", message: string) {
    super(message);
    this.name = "CuentaError";
    this.codigo = codigo;
  }
}

export type CuentaDetalle = {
  id: number;
  mesa: { id: number; numero: number };
  estado: EstadoCuenta;
  notaPrivada: string | null;
  ordenes: Array<{
    id: number;
    numero: number;
    estado: EstadoOrden;
    /** Indicaciones vigentes: las de la última corrección que las cambió. */
    indicaciones: string | null;
    /** Las que se enviaron a cocina la primera vez; nunca se sobrescriben. */
    indicacionesOriginales: string | null;
    creadaEn: string;
    empleado: string;
    lineas: LineaVigente[];
  }>;
};

type CuentaActivaRow = { id: number; estado: EstadoCuenta };

type CuentaRow = {
  id: number;
  estado: EstadoCuenta;
  nota_privada: string | null;
  mesa_id: number;
  mesa_numero: number;
};

type OrdenRow = {
  id: number;
  numero: number;
  estado: EstadoOrden;
  indicaciones: string | null;
  creada_en: string;
  empleado: string;
};

export function cuentaActivaPorMesa(
  db: Database.Database,
  mesaId: number,
): { id: number; estado: EstadoCuenta } | null {
  // NULL solo puede venir de una base/fixture anterior a 023. Se considera
  // activa para no intentar insertar otra fila que chocaría con el índice
  // único; la migración real enlaza todas las cuentas abiertas a la jornada.
  const row = db
    .prepare(
      `SELECT c.id, c.estado FROM cuentas c
       LEFT JOIN jornadas_operativas j ON j.id = c.jornada_id
       WHERE c.mesa_id = ? AND c.estado IN ('abierta', 'precuenta_emitida')
         AND (j.estado = 'abierta' OR c.jornada_id IS NULL)`,
    )
    .get(mesaId) as CuentaActivaRow | undefined;
  return row ?? null;
}

export function obtenerCuenta(db: Database.Database, cuentaId: number): CuentaDetalle {
  const cuenta = db
    .prepare(
      `SELECT c.id, c.estado, c.nota_privada, m.id AS mesa_id, m.numero AS mesa_numero
       FROM cuentas c
       JOIN mesas m ON m.id = c.mesa_id
       WHERE c.id = ?`,
    )
    .get(cuentaId) as CuentaRow | undefined;
  if (!cuenta) throw new CuentaError("cuenta_inexistente", "Cuenta inexistente");

  const ordenes = db
    .prepare(
      `SELECT o.id, o.numero, o.estado, o.indicaciones, o.creada_en, e.nombre AS empleado
       FROM ordenes o
       JOIN empleados e ON e.id = o.creada_por_empleado_id
       WHERE o.cuenta_id = ?
       ORDER BY o.numero`,
    )
    .all(cuentaId) as OrdenRow[];

  return {
    id: cuenta.id,
    mesa: { id: cuenta.mesa_id, numero: cuenta.mesa_numero },
    estado: cuenta.estado,
    notaPrivada: cuenta.nota_privada,
    ordenes: ordenes.map((orden) => ({
      id: orden.id,
      numero: orden.numero,
      estado: orden.estado,
      indicaciones: indicacionesVigentesOrden(db, orden.id),
      indicacionesOriginales: orden.indicaciones,
      creadaEn: orden.creada_en,
      empleado: orden.empleado,
      lineas: versionVigenteOrden(db, orden.id),
    })),
  };
}

export function actualizarNotaPrivadaCuenta(
  db: Database.Database,
  cuentaId: number,
  notaPrivada: string | null,
): string | null {
  const info = db.prepare("UPDATE cuentas SET nota_privada = ? WHERE id = ?").run(notaPrivada, cuentaId);
  if (info.changes === 0) throw new CuentaError("cuenta_inexistente", "Cuenta inexistente");
  return notaPrivada;
}
