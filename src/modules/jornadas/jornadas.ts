import type Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

export type JornadaOperativa = {
  id: number;
  fechaOperativa: string;
  estado: "abierta" | "cerrada";
  abiertaEn: string;
  abiertaPor: string | null;
  cerradaEn: string | null;
  cerradaPor: string | null;
  respaldoRuta: string | null;
};

export type ResumenJornada = {
  cuentasActivas: number;
  cuentasTotales: number;
  ordenes: number;
  tareasCocinaPendientes: number;
  incidenciasPendientes: number;
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
};

function fechaLocal(fecha = new Date()): string {
  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, "0");
  const day = String(fecha.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  };
}

const SELECT_JORNADA = `
  SELECT j.id, j.fecha_operativa, j.estado, j.abierta_en,
         ea.nombre AS abierta_por, j.cerrada_en,
         ec.nombre AS cerrada_por, j.respaldo_ruta
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
  return {
    cuentasActivas: cuentas.activas ?? 0,
    cuentasTotales: cuentas.total,
    ordenes: ordenes.total,
    tareasCocinaPendientes: cocina.total,
    incidenciasPendientes: incidencias.total,
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

export function abrirJornada(db: Database.Database, empleadoId: number | null): JornadaOperativa {
  if (jornadaAbierta(db)) throw new JornadaError("jornada_ya_abierta", "Ya existe una jornada operativa abierta");
  const ahora = new Date().toISOString();
  const id = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO jornadas_operativas (fecha_operativa, estado, abierta_en, abierta_por_empleado_id)
       VALUES (?, 'abierta', ?, ?)`,
    ).run(fechaLocal(), ahora, empleadoId);
    const jornadaId = Number(info.lastInsertRowid);
    registrarEvento(db, jornadaId, "apertura", empleadoId, { origen: "administracion" }, ahora);
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

export function auditarReinicioDemo(
  db: Database.Database,
  jornadaId: number,
  empleadoId: number | null,
  detalle: unknown,
): void {
  registrarEvento(db, jornadaId, "reinicio_demo", empleadoId, detalle);
}
