import type Database from "better-sqlite3";
import { versionEfectivaOrden, type LineaEfectiva } from "../ordenes/ordenes.ts";

export type TipoIncidenciaCocina = "rechazo" | "sugerencia";
export type AlcanceIncidenciaCocina = "linea" | "orden";
export type EstadoIncidenciaCocina = "pendiente" | "aceptada" | "eliminada";

export class IncidenciaCocinaError extends Error {
  codigo: string;
  constructor(codigo: string, message: string) {
    super(message);
    this.name = "IncidenciaCocinaError";
    this.codigo = codigo;
  }
}

export type IncidenciaCocina = {
  id: number;
  comandaId: number;
  ordenId: number;
  comandaLineaId: number | null;
  tipo: TipoIncidenciaCocina;
  alcance: AlcanceIncidenciaCocina;
  motivo: string;
  propuesta: string | null;
  estado: EstadoIncidenciaCocina;
  creadaEn: string;
  respondidaEn: string | null;
  mesa: number;
  ordenNumero: number;
  producto: string | null;
};

type IncidenciaRow = {
  id: number;
  comanda_id: number;
  orden_id: number;
  comanda_linea_id: number | null;
  tipo: TipoIncidenciaCocina;
  alcance: AlcanceIncidenciaCocina;
  motivo: string;
  propuesta: string | null;
  estado: EstadoIncidenciaCocina;
  creada_en: string;
  respondida_en: string | null;
  mesa: number;
  orden_numero: number;
  producto: string | null;
};

const SELECT_INCIDENCIA = `
  SELECT i.id, i.comanda_id, i.orden_id, i.comanda_linea_id, i.tipo, i.alcance,
         i.motivo, i.propuesta, i.estado, i.creada_en, i.respondida_en,
         m.numero AS mesa, o.numero AS orden_numero, p.nombre AS producto
  FROM cocina_incidencias i
  JOIN ordenes o ON o.id = i.orden_id
  JOIN cuentas cu ON cu.id = o.cuenta_id
  JOIN mesas m ON m.id = cu.mesa_id
  LEFT JOIN comanda_lineas cl ON cl.id = i.comanda_linea_id
  LEFT JOIN orden_lineas ol ON ol.id = cl.orden_linea_id
  LEFT JOIN productos p ON p.id = ol.producto_id
`;

function deFila(row: IncidenciaRow): IncidenciaCocina {
  return {
    id: row.id,
    comandaId: row.comanda_id,
    ordenId: row.orden_id,
    comandaLineaId: row.comanda_linea_id,
    tipo: row.tipo,
    alcance: row.alcance,
    motivo: row.motivo,
    propuesta: row.propuesta,
    estado: row.estado,
    creadaEn: row.creada_en,
    respondidaEn: row.respondida_en,
    mesa: row.mesa,
    ordenNumero: row.orden_numero,
    producto: row.producto,
  };
}

function incidenciaPorId(db: Database.Database, id: number): IncidenciaCocina {
  const row = db.prepare(`${SELECT_INCIDENCIA} WHERE i.id = ?`).get(id) as IncidenciaRow | undefined;
  if (!row) throw new IncidenciaCocinaError("incidencia_inexistente", "La solicitud de cocina no existe");
  return deFila(row);
}

function texto(valor: string | null | undefined, nombre: string): string {
  const limpio = valor?.trim() ?? "";
  if (!limpio) throw new IncidenciaCocinaError(`${nombre}_requerido`, `Hace falta ${nombre}`);
  if (limpio.length > 500) throw new IncidenciaCocinaError("texto_largo", "El texto supera 500 caracteres");
  return limpio;
}

export function crearIncidenciaCocina(
  db: Database.Database,
  input: {
    comandaId: number;
    comandaLineaId?: number | null;
    tipo: TipoIncidenciaCocina;
    alcance: AlcanceIncidenciaCocina;
    motivo: string;
    propuesta?: string | null;
  },
): IncidenciaCocina {
  if (input.tipo !== "rechazo" && input.tipo !== "sugerencia") {
    throw new IncidenciaCocinaError("tipo_invalido", "Tipo de solicitud inválido");
  }
  if (input.alcance !== "linea" && input.alcance !== "orden") {
    throw new IncidenciaCocinaError("alcance_invalido", "Alcance inválido");
  }
  const motivo = texto(input.motivo, "motivo");
  const propuesta = input.tipo === "sugerencia" ? texto(input.propuesta, "propuesta") : null;

  return db.transaction(() => {
    const comanda = db
      .prepare("SELECT id, orden_id, tipo FROM comandas WHERE id = ?")
      .get(input.comandaId) as { id: number; orden_id: number | null; tipo: string } | undefined;
    if (!comanda?.orden_id || comanda.tipo !== "orden") {
      throw new IncidenciaCocinaError("comanda_no_gestionable", "Esta comanda no admite solicitudes nuevas");
    }

    let comandaLineaId: number | null = null;
    if (input.alcance === "linea") {
      if (!input.comandaLineaId) throw new IncidenciaCocinaError("linea_requerida", "Selecciona un producto");
      const linea = db
        .prepare("SELECT id, etapa, orden_linea_id FROM comanda_lineas WHERE id = ? AND comanda_id = ?")
        .get(input.comandaLineaId, input.comandaId) as
        | { id: number; etapa: string; orden_linea_id: number | null }
        | undefined;
      if (!linea?.orden_linea_id) throw new IncidenciaCocinaError("linea_inexistente", "El producto no pertenece a la orden");
      if (linea.etapa !== "por_preparar") {
        throw new IncidenciaCocinaError("producto_ya_iniciado", "El producto ya comenzó su preparación");
      }
      comandaLineaId = linea.id;
    } else {
      const lineas = db
        .prepare("SELECT etapa FROM comanda_lineas WHERE comanda_id = ? AND orden_linea_id IS NOT NULL")
        .all(input.comandaId) as Array<{ etapa: string }>;
      if (lineas.length === 0) throw new IncidenciaCocinaError("orden_sin_productos", "La orden no tiene productos");
      if (lineas.some((linea) => linea.etapa !== "por_preparar" && linea.etapa !== "cancelado")) {
        throw new IncidenciaCocinaError("orden_ya_iniciada", "La orden ya comenzó su preparación");
      }
    }

    const pendiente = db
      .prepare(
        `SELECT id FROM cocina_incidencias
         WHERE orden_id = ? AND estado = 'pendiente'
           AND (comanda_linea_id IS NULL OR ? IS NULL OR comanda_linea_id = ?)
         LIMIT 1`,
      )
      .get(comanda.orden_id, comandaLineaId, comandaLineaId) as { id: number } | undefined;
    if (pendiente) {
      throw new IncidenciaCocinaError("incidencia_pendiente", "Ya hay una solicitud pendiente para este pedido");
    }

    const id = Number(
      db
        .prepare(
          `INSERT INTO cocina_incidencias
            (comanda_id, orden_id, comanda_linea_id, tipo, alcance, motivo, propuesta, estado, creada_en)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
        )
        .run(
          input.comandaId,
          comanda.orden_id,
          comandaLineaId,
          input.tipo,
          input.alcance,
          motivo,
          propuesta,
          new Date().toISOString(),
        ).lastInsertRowid,
    );
    return incidenciaPorId(db, id);
  })();
}

export function listarIncidenciasMesero(db: Database.Database): IncidenciaCocina[] {
  return (db
    .prepare(`${SELECT_INCIDENCIA} WHERE i.estado = 'pendiente' ORDER BY i.id DESC`)
    .all() as IncidenciaRow[]).map(deFila);
}

export function incidenciasDeComanda(db: Database.Database, comandaId: number): IncidenciaCocina[] {
  return (db
    .prepare(
      `${SELECT_INCIDENCIA}
       WHERE i.comanda_id = ? AND i.estado IN ('pendiente', 'aceptada')
       ORDER BY i.id`,
    )
    .all(comandaId) as IncidenciaRow[]).map(deFila);
}

export function aceptarSugerencia(db: Database.Database, id: number): IncidenciaCocina {
  const incidencia = incidenciaPorId(db, id);
  if (incidencia.tipo !== "sugerencia") {
    throw new IncidenciaCocinaError("incidencia_no_aceptable", "Un rechazo de cocina no puede aceptarse");
  }
  if (incidencia.estado !== "pendiente") {
    throw new IncidenciaCocinaError("incidencia_resuelta", "La sugerencia ya fue respondida");
  }
  db.prepare("UPDATE cocina_incidencias SET estado = 'aceptada', respondida_en = ? WHERE id = ?").run(
    new Date().toISOString(),
    id,
  );
  return incidenciaPorId(db, id);
}

export function prepararEliminacion(
  db: Database.Database,
  id: number,
): { incidencia: IncidenciaCocina; lineas: LineaEfectiva[] } {
  const incidencia = incidenciaPorId(db, id);
  if (incidencia.estado !== "pendiente") {
    throw new IncidenciaCocinaError("incidencia_resuelta", "La solicitud ya fue respondida");
  }
  const actuales = versionEfectivaOrden(db, incidencia.ordenId);
  if (incidencia.alcance === "orden") return { incidencia, lineas: actuales };

  const objetivo = db
    .prepare("SELECT orden_linea_id FROM comanda_lineas WHERE id = ?")
    .get(incidencia.comandaLineaId) as { orden_linea_id: number | null } | undefined;
  const linea = actuales.find((actual) => actual.ordenLineaId === objetivo?.orden_linea_id);
  if (!linea) throw new IncidenciaCocinaError("linea_inexistente", "El producto ya no forma parte de la orden");
  return { incidencia, lineas: [linea] };
}

export function marcarIncidenciaEliminada(db: Database.Database, id: number): IncidenciaCocina {
  db.prepare("UPDATE cocina_incidencias SET estado = 'eliminada', respondida_en = ? WHERE id = ?").run(
    new Date().toISOString(),
    id,
  );
  return incidenciaPorId(db, id);
}
