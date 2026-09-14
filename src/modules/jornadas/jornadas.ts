import type Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { snapshotCuenta } from "../cuentas/totales.ts";
import { marcarOrdenEntregada } from "../cuentas/entregas.ts";
import { firmarReservadoDeCuenta } from "../inventario/asientos.ts";

export type JornadaOperativa = {
  id: number;
  fechaOperativa: string;
  estado: "abierta" | "cerrada";
  abiertaEn: string;
  abiertaPor: string | null;
  cerradaEn: string | null;
  cerradaPor: string | null;
  respaldoRuta: string | null;
  turnoPlantillaId: number | null;
  turnoNombre: string;
  cierreRegistradoEn: string | null;
};

export type TurnoPlantilla = {
  id: number;
  nombre: string;
  horaInicio: string | null;
  horaFin: string | null;
  esPredeterminada: boolean;
  activa: boolean;
};

export type ResumenJornada = {
  cuentasActivas: number;
  cuentasTotales: number;
  ordenes: number;
  tareasCocinaPendientes: number;
  incidenciasPendientes: number;
  ordenesListas: number;
  pedidosParaLlevarPendientes: number;
  cuentasVacias: number;
};

export class JornadaError extends Error {
  constructor(public codigo: string, message: string) {
    super(message);
    this.name = "JornadaError";
  }
}

type JornadaRow = {
  id: number;
  fecha_operativa: string;
  estado: "abierta" | "cerrada";
  abierta_en: string;
  abierta_por: string | null;
  cerrada_en: string | null;
  cerrada_por: string | null;
  respaldo_ruta: string | null;
  turno_plantilla_id: number | null;
  turno_nombre: string;
  cierre_registrado_en: string | null;
};

function fechaLocal(fecha = new Date()): string {
  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, "0");
  const day = String(fecha.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fechaGuardada(value: string): Date {
  const normalizada = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  return new Date(normalizada);
}

function deFila(row: JornadaRow): JornadaOperativa {
  return {
    id: row.id,
    fechaOperativa: row.fecha_operativa,
    estado: row.estado,
    abiertaEn: row.abierta_en,
    abiertaPor: row.abierta_por,
    cerradaEn: row.cerrada_en,
    cerradaPor: row.cerrada_por,
    respaldoRuta: row.respaldo_ruta,
    turnoPlantillaId: row.turno_plantilla_id,
    turnoNombre: row.turno_nombre,
    cierreRegistradoEn: row.cierre_registrado_en,
  };
}

const SELECT_JORNADA = `
  SELECT j.id, j.fecha_operativa, j.estado, j.abierta_en,
         ea.nombre AS abierta_por, j.cerrada_en,
         ec.nombre AS cerrada_por, j.respaldo_ruta, j.turno_plantilla_id,
         COALESCE(j.turno_nombre, 'Jornada general') AS turno_nombre, j.cierre_registrado_en
  FROM jornadas_operativas j
  LEFT JOIN empleados ea ON ea.id = j.abierta_por_empleado_id
  LEFT JOIN empleados ec ON ec.id = j.cerrada_por_empleado_id
`;

export function jornadaAbierta(db: Database.Database): JornadaOperativa | null {
  const row = db.prepare(`${SELECT_JORNADA} WHERE j.estado = 'abierta' LIMIT 1`).get() as JornadaRow | undefined;
  return row ? deFila(row) : null;
}

export function exigirJornadaAbierta(db: Database.Database): JornadaOperativa {
  const jornada = jornadaAbierta(db);
  if (!jornada) throw new JornadaError("jornada_cerrada", "Abre una jornada operativa antes de registrar órdenes");
  return jornada;
}

export function resumenJornada(db: Database.Database, jornadaId: number): ResumenJornada {
  const cuentas = db.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN estado IN ('abierta', 'precuenta_emitida') THEN 1 ELSE 0 END) AS activas
     FROM cuentas WHERE jornada_id = ?`,
  ).get(jornadaId) as { total: number; activas: number | null };
  const ordenes = db.prepare(
    `SELECT COUNT(*) AS total FROM ordenes o
     JOIN cuentas c ON c.id = o.cuenta_id WHERE c.jornada_id = ?`,
  ).get(jornadaId) as { total: number };
  const cocina = db.prepare(
    `SELECT COUNT(*) AS total FROM comanda_lineas cl
     JOIN comandas c ON c.id = cl.comanda_id
     WHERE c.jornada_id = ? AND cl.etapa IN ('por_preparar', 'en_proceso')`,
  ).get(jornadaId) as { total: number };
  const incidencias = db.prepare(
    `SELECT COUNT(*) AS total FROM cocina_incidencias i
     JOIN comandas c ON c.id = i.comanda_id
     WHERE c.jornada_id = ? AND i.estado = 'pendiente'`,
  ).get(jornadaId) as { total: number };
  const paraLlevar = db.prepare(
    `SELECT COUNT(*) AS total FROM cuentas
     WHERE jornada_id = ? AND estado IN ('abierta', 'precuenta_emitida') AND tipo_servicio = 'para_llevar'`,
  ).get(jornadaId) as { total: number };
  const listas = ordenesListasSinEntregar(db, jornadaId);
  const cuentasActivas = db.prepare(
    "SELECT id FROM cuentas WHERE jornada_id = ? AND estado IN ('abierta', 'precuenta_emitida')",
  ).all(jornadaId) as Array<{ id: number }>;
  const cuentasVacias = cuentasActivas.filter(({ id }) => {
    const snapshot = snapshotCuenta(db, id);
    return snapshot.ordenes.length === 0;
  }).length;
  return {
    cuentasActivas: cuentas.activas ?? 0,
    cuentasTotales: cuentas.total,
    ordenes: ordenes.total,
    tareasCocinaPendientes: cocina.total,
    incidenciasPendientes: incidencias.total,
    ordenesListas: listas.length,
    pedidosParaLlevarPendientes: paraLlevar.total,
    cuentasVacias,
  };
}

export function estadoJornada(db: Database.Database): {
  jornada: JornadaOperativa | null;
  resumen: ResumenJornada | null;
  ultimaCerrada: JornadaOperativa | null;
} {
  const jornada = jornadaAbierta(db);
  const ultima = db.prepare(`${SELECT_JORNADA} WHERE j.estado = 'cerrada' ORDER BY j.id DESC LIMIT 1`).get() as
    | JornadaRow
    | undefined;
  return {
    jornada,
    resumen: jornada ? resumenJornada(db, jornada.id) : null,
    ultimaCerrada: ultima ? deFila(ultima) : null,
  };
}

type TurnoRow = {
  id: number;
  nombre: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  es_predeterminada: number;
  activa: number;
};

function turnoDeFila(row: TurnoRow): TurnoPlantilla {
  return {
    id: row.id,
    nombre: row.nombre,
    horaInicio: row.hora_inicio,
    horaFin: row.hora_fin,
    esPredeterminada: row.es_predeterminada === 1,
    activa: row.activa === 1,
  };
}

export function listarTurnos(db: Database.Database, incluirInactivos = false): TurnoPlantilla[] {
  const where = incluirInactivos ? "" : "WHERE activa = 1";
  return (db.prepare(
    `SELECT id,nombre,hora_inicio,hora_fin,es_predeterminada,activa FROM turno_plantillas
     ${where} ORDER BY es_predeterminada DESC, lower(nombre), id`,
  ).all() as TurnoRow[]).map(turnoDeFila);
}

function horaValida(value: string | null): boolean {
  return value === null || value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function guardarTurno(db: Database.Database, input: TurnoPlantilla): TurnoPlantilla {
  const nombre = input.nombre.trim();
  if (!nombre || [...nombre].length > 40) throw new JornadaError("turno_invalido", "El turno necesita un nombre de hasta 40 caracteres");
  if (!horaValida(input.horaInicio) || !horaValida(input.horaFin)) throw new JornadaError("horario_invalido", "Los horarios deben usar el formato HH:MM");
  let id = input.id;
  try {
    db.transaction(() => {
      if (input.esPredeterminada) db.prepare("UPDATE turno_plantillas SET es_predeterminada=0").run();
      if (id === 0) {
        id = Number(db.prepare(
          `INSERT INTO turno_plantillas (nombre,hora_inicio,hora_fin,es_predeterminada,activa,creada_en)
           VALUES (?,?,?,?,1,?)`,
        ).run(nombre, input.horaInicio || null, input.horaFin || null, input.esPredeterminada ? 1 : 0, new Date().toISOString()).lastInsertRowid);
      } else {
        const result = db.prepare(
          "UPDATE turno_plantillas SET nombre=?,hora_inicio=?,hora_fin=?,es_predeterminada=?,activa=? WHERE id=?",
        ).run(nombre, input.horaInicio || null, input.horaFin || null, input.esPredeterminada ? 1 : 0, input.activa ? 1 : 0, id);
        if (result.changes !== 1) throw new JornadaError("turno_inexistente", "La plantilla de turno no existe");
      }
      const defaults = db.prepare("SELECT count(*) AS total FROM turno_plantillas WHERE activa=1 AND es_predeterminada=1").get() as { total: number };
      if (defaults.total === 0) db.prepare("UPDATE turno_plantillas SET es_predeterminada=1 WHERE id=(SELECT id FROM turno_plantillas WHERE activa=1 ORDER BY id LIMIT 1)").run();
    })();
  } catch (error) {
    if (error instanceof JornadaError) throw error;
    if (error instanceof Error && error.message.toLowerCase().includes("unique")) throw new JornadaError("turno_duplicado", "Ya existe un turno con ese nombre");
    throw error;
  }
  const row = db.prepare("SELECT id,nombre,hora_inicio,hora_fin,es_predeterminada,activa FROM turno_plantillas WHERE id=?").get(id) as TurnoRow | undefined;
  if (!row) throw new JornadaError("turno_inexistente", "La plantilla de turno no existe");
  return turnoDeFila(row);
}

function ordenesListasSinEntregar(db: Database.Database, jornadaId: number): number[] {
  return (db.prepare(
    `SELECT o.id FROM ordenes o JOIN cuentas cu ON cu.id=o.cuenta_id
     WHERE cu.jornada_id=? AND cu.tipo_servicio='mesa' AND cu.estado IN ('abierta','precuenta_emitida')
       AND NOT EXISTS (SELECT 1 FROM entregas_ordenes e WHERE e.orden_id=o.id)
       AND EXISTS (SELECT 1 FROM comanda_lineas cl JOIN comandas c ON c.id=cl.comanda_id WHERE c.orden_id=o.id AND cl.etapa='listo')
       AND NOT EXISTS (SELECT 1 FROM comanda_lineas cl JOIN comandas c ON c.id=cl.comanda_id WHERE c.orden_id=o.id AND cl.etapa NOT IN ('listo','servido','aviso','cancelado'))`,
  ).all(jornadaId) as Array<{ id: number }>).map(({ id }) => id);
}

export function marcarListasEntregadas(db: Database.Database, jornadaId: number, empleadoId: number | null): number {
  const ids = ordenesListasSinEntregar(db, jornadaId);
  for (const id of ids) marcarOrdenEntregada(db, id, empleadoId, "manual");
  return ids.length;
}

function registrarEvento(
  db: Database.Database,
  jornadaId: number | null,
  tipo: "apertura" | "cierre" | "reinicio_demo",
  empleadoId: number | null,
  detalle: unknown,
  creadoEn = new Date().toISOString(),
): void {
  db.prepare(
    `INSERT INTO jornada_eventos (jornada_id, tipo, empleado_id, detalle_json, creado_en)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(jornadaId, tipo, empleadoId, JSON.stringify(detalle), creadoEn);
}

export function abrirJornada(db: Database.Database, empleadoId: number | null, turnoPlantillaId = 0): JornadaOperativa {
  if (jornadaAbierta(db)) throw new JornadaError("jornada_ya_abierta", "Ya existe una jornada operativa abierta");
  const ahora = new Date().toISOString();
  const turno = (turnoPlantillaId
    ? db.prepare("SELECT * FROM turno_plantillas WHERE id = ? AND activa = 1").get(turnoPlantillaId)
    : db.prepare("SELECT * FROM turno_plantillas WHERE activa = 1 ORDER BY es_predeterminada DESC, id LIMIT 1").get()) as
    | { id: number; nombre: string }
    | undefined;
  if (!turno) throw new JornadaError("turno_inexistente", "La plantilla de turno no existe o está desactivada");
  const id = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO jornadas_operativas
       (fecha_operativa, estado, abierta_en, abierta_por_empleado_id, turno_plantilla_id, turno_nombre)
       VALUES (?, 'abierta', ?, ?, ?, ?)`,
    ).run(fechaLocal(), ahora, empleadoId, turno.id, turno.nombre);
    const jornadaId = Number(info.lastInsertRowid);
    registrarEvento(db, jornadaId, "apertura", empleadoId, { origen: "administracion", turno: turno.nombre }, ahora);
    return jornadaId;
  })();
  const row = db.prepare(`${SELECT_JORNADA} WHERE j.id = ?`).get(id) as JornadaRow;
  return deFila(row);
}

function rutaBase(db: Database.Database): string {
  const row = db.prepare("PRAGMA database_list").all() as Array<{ name: string; file: string }>;
  const archivo = row.find((item) => item.name === "main")?.file;
  if (!archivo) throw new JornadaError("respaldo_no_disponible", "La base no tiene una ruta disponible para respaldar");
  return path.dirname(path.dirname(archivo));
}

export async function crearRespaldoJornada(
  db: Database.Database,
  jornada: JornadaOperativa,
  dataDir?: string,
): Promise<string> {
  const directorio = path.join(dataDir ?? rutaBase(db), "backups");
  mkdirSync(directorio, { recursive: true });
  const sello = new Date().toISOString().replace(/[:.]/g, "-");
  const destino = path.join(directorio, `jornada-${jornada.fechaOperativa}-${jornada.id}-${sello}.sqlite`);
  await db.backup(destino);
  return destino;
}

export async function cerrarJornada(
  db: Database.Database,
  empleadoId: number | null,
  dataDir?: string,
): Promise<{ jornada: JornadaOperativa; resumen: ResumenJornada; respaldoRuta: string }> {
  const jornada = exigirJornadaAbierta(db);
  const resumen = resumenJornada(db, jornada.id);
  if (resumen.cuentasActivas > 0) {
    throw new JornadaError("jornada_con_cuentas", `Quedan ${resumen.cuentasActivas} cuentas activas`);
  }
  if (resumen.tareasCocinaPendientes > 0) {
    throw new JornadaError("jornada_con_cocina", `Quedan ${resumen.tareasCocinaPendientes} tareas de cocina pendientes`);
  }
  if (resumen.incidenciasPendientes > 0) {
    throw new JornadaError("jornada_con_incidencias", `Quedan ${resumen.incidenciasPendientes} solicitudes de cocina pendientes`);
  }
  const respaldoRuta = await crearRespaldoJornada(db, jornada, dataDir);
  const ahora = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `UPDATE jornadas_operativas
       SET estado = 'cerrada', cerrada_en = ?, cerrada_por_empleado_id = ?, respaldo_ruta = ?, resumen_json = ?
       WHERE id = ? AND estado = 'abierta'`,
    ).run(ahora, empleadoId, respaldoRuta, JSON.stringify(resumen), jornada.id);
    registrarEvento(db, jornada.id, "cierre", empleadoId, { resumen, respaldoRuta }, ahora);
  })();
  const row = db.prepare(`${SELECT_JORNADA} WHERE j.id = ?`).get(jornada.id) as JornadaRow;
  return { jornada: deFila(row), resumen, respaldoRuta };
}

export type ResultadoCierreMasivo = {
  jornada: JornadaOperativa;
  resumen: ResumenJornada;
  respaldoRuta: string;
  cierreMasivo: {
    cuentasCerradasIds: number[];
    cuentasVaciasAnuladasIds: number[];
    totalCentavos: number;
  };
};

export async function cerrarJornadaMasivo(
  db: Database.Database,
  empleadoId: number,
  dataDir?: string,
  cierreEfectivo?: Date,
): Promise<ResultadoCierreMasivo> {
  const jornada = exigirJornadaAbierta(db);
  const resumen = resumenJornada(db, jornada.id);
  if (resumen.tareasCocinaPendientes > 0) throw new JornadaError("jornada_con_cocina", `Quedan ${resumen.tareasCocinaPendientes} tareas de cocina pendientes`);
  if (resumen.incidenciasPendientes > 0) throw new JornadaError("jornada_con_incidencias", `Quedan ${resumen.incidenciasPendientes} solicitudes de cocina pendientes`);
  if (resumen.ordenesListas > 0) throw new JornadaError("jornada_con_listos", `Quedan ${resumen.ordenesListas} órdenes listas sin confirmar`);
  if (resumen.pedidosParaLlevarPendientes > 0) throw new JornadaError("jornada_con_retiros", `Quedan ${resumen.pedidosParaLlevarPendientes} pedidos para llevar sin retirar`);

  const registrado = new Date();
  const efectivo = cierreEfectivo ?? registrado;
  if (efectivo > registrado || efectivo < fechaGuardada(jornada.abiertaEn) || Number.isNaN(efectivo.valueOf())) {
    throw new JornadaError("hora_cierre_invalida", "La hora corregida debe estar entre la apertura y el momento actual");
  }
  const respaldoRuta = await crearRespaldoJornada(db, jornada, dataDir);
  const cuentas = db.prepare(
    "SELECT id,mesa_id FROM cuentas WHERE jornada_id=? AND estado IN ('abierta','precuenta_emitida') ORDER BY id",
  ).all(jornada.id) as Array<{ id: number; mesa_id: number }>;
  const snapshots = cuentas.map((cuenta) => ({ cuenta, snapshot: snapshotCuenta(db, cuenta.id) }));
  const cierreMasivo = {
    cuentasCerradasIds: [] as number[],
    cuentasVaciasAnuladasIds: [] as number[],
    totalCentavos: 0,
  };
  db.transaction(() => {
    for (const { cuenta, snapshot } of snapshots) {
      if (snapshot.ordenes.length === 0) {
        db.prepare("UPDATE precuentas SET vigente=0 WHERE cuenta_id=?").run(cuenta.id);
        db.prepare("UPDATE cuentas SET estado='cancelada',cerrada_en=? WHERE id=?").run(efectivo.toISOString(), cuenta.id);
        const mesa = db.prepare("SELECT numero FROM mesas WHERE id=?").get(cuenta.mesa_id) as { numero: number };
        db.prepare(
          `INSERT INTO cancelaciones_cuentas
           (cuenta_id,mesa_id,mesa_numero,empleado_id,motivo,total_centavos,ordenes,lineas_preparadas,lineas_liberadas,creada_en)
           VALUES (?,?,?,?,'Cuenta vacía al cerrar turno',0,0,0,0,?)`,
        ).run(cuenta.id, cuenta.mesa_id, mesa.numero, empleadoId, efectivo.toISOString());
        cierreMasivo.cuentasVaciasAnuladasIds.push(cuenta.id);
        continue;
      }
      firmarReservadoDeCuenta(db, cuenta.id);
      db.prepare("UPDATE cuentas SET estado='en_caja',cerrada_en=? WHERE id=?").run(efectivo.toISOString(), cuenta.id);
      db.prepare(
        `INSERT INTO caja_handoffs (pedido_id,cuenta_id,precuenta_id,mesero_id,snapshot_json,creado_en)
         VALUES (NULL,?,NULL,?,?,?)`,
      ).run(cuenta.id, empleadoId, JSON.stringify(snapshot), efectivo.toISOString());
      cierreMasivo.cuentasCerradasIds.push(cuenta.id);
      cierreMasivo.totalCentavos += snapshot.totalCentavos;
    }
    const detalle = { resumen, cierreMasivo, respaldoRuta, cierreEfectivo: efectivo.toISOString(), registradoEn: registrado.toISOString() };
    db.prepare(
      `UPDATE jornadas_operativas SET estado='cerrada',cerrada_en=?,cierre_registrado_en=?,cerrada_por_empleado_id=?,respaldo_ruta=?,resumen_json=?
       WHERE id=? AND estado='abierta'`,
    ).run(efectivo.toISOString(), registrado.toISOString(), empleadoId, respaldoRuta, JSON.stringify(detalle), jornada.id);
    registrarEvento(db, jornada.id, "cierre", empleadoId, detalle, registrado.toISOString());
  })();
  const row = db.prepare(`${SELECT_JORNADA} WHERE j.id=?`).get(jornada.id) as JornadaRow;
  return { jornada: deFila(row), resumen, respaldoRuta, cierreMasivo };
}

export function auditarReinicioDemo(
  db: Database.Database,
  jornadaId: number,
  empleadoId: number | null,
  detalle: unknown,
): void {
  registrarEvento(db, jornadaId, "reinicio_demo", empleadoId, detalle);
}
