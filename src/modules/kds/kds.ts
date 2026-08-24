import type Database from "better-sqlite3";
import { indicacionesEfectivasOrden } from "../ordenes/ordenes.ts";
import { incidenciasDeComanda, type IncidenciaCocina } from "./incidencias.ts";

export type TipoComanda = "legacy" | "orden" | "correccion" | "anulacion";

export class KdsError extends Error {
  codigo: "etapa_invalida" | "linea_inexistente" | "etapa_no_avanzable" | "incidencia_pendiente";
  constructor(
    codigo: "etapa_invalida" | "linea_inexistente" | "etapa_no_avanzable" | "incidencia_pendiente",
    message: string,
  ) {
    super(message);
    this.name = "KdsError";
    this.codigo = codigo;
  }
}

/**
 * Etapas que ya cerraron el ciclo de cocina. `listo` cuenta: el plato está
 * hecho y emplatado, así que pisarlo borraría la merma del registro.
 */
export const ETAPAS_TERMINALES = ["listo", "servido", "cancelado"] as const;

/**
 * Etapa informativa: el evento de una corrección que **no** genera trabajo
 * nuevo (una baja, una anulación, un cambio de nota). La pantalla la muestra
 * como aviso y no la cuenta como tarea, y nadie la reescribe: es historia.
 */
export const ETAPA_AVISO = "aviso";

/**
 * Trabajo que cocina todavía tiene por delante. Es el único punto de partida
 * válido para avanzar o cancelar: lo terminal y los avisos quedan como están.
 */
export const ETAPAS_TAREA = ["por_preparar", "en_proceso"] as const;

/**
 * Adonde puede llevar la pantalla una tarea. `por_preparar` no está: volver
 * atrás no es avanzar. `cancelado` tampoco: lo decide una corrección, no cocina.
 */
export const ETAPAS_DESTINO = ["en_proceso", "listo", "servido"] as const;

/**
 * Las únicas etapas que una cancelación puede pisar: tareas todavía pendientes.
 * Lo terminal y los avisos quedan como están.
 */
export const ETAPAS_CANCELABLES = ETAPAS_TAREA;

/** Una línea de comanda: por defecto cocina la tiene que preparar. */
export type LineaComanda = number | { id: number; etapa: string };

function tipoDeComanda(input: {
  pedidoId?: number | null;
  ordenId?: number | null;
  correccionId?: number | null;
  tipo?: TipoComanda | null;
}): TipoComanda {
  if (input.tipo) return input.tipo;
  if (input.correccionId != null) return "correccion";
  if (input.ordenId != null) return "orden";
  return "legacy";
}

export function crearComanda(
  db: Database.Database,
  input: {
    pedidoId?: number | null;
    envioN: number;
    meseroId: number;
    lineaIds: LineaComanda[];
    ordenId?: number | null;
    correccionId?: number | null;
    tipo?: TipoComanda | null;
  },
): number {
  const tipo = tipoDeComanda(input);
  const info = db
    .prepare(
      "INSERT INTO comandas (pedido_id, envio_n, mesero_id, creada_en, orden_id, correccion_id, tipo) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      input.pedidoId ?? null,
      input.envioN,
      input.meseroId,
      new Date().toISOString(),
      input.ordenId ?? null,
      input.correccionId ?? null,
      tipo,
    );
  const comandaId = Number(info.lastInsertRowid);
  const insertLinea = db.prepare(
    "INSERT INTO comanda_lineas (comanda_id, pedido_linea_id, orden_linea_id, orden_correccion_linea_id, etapa) VALUES (?, ?, ?, ?, ?)",
  );
  const porCorreccion = tipo === "correccion" || tipo === "anulacion";
  const porOrden = tipo === "orden";
  for (const linea of input.lineaIds) {
    const { id, etapa } = typeof linea === "number" ? { id: linea, etapa: "por_preparar" } : linea;
    insertLinea.run(
      comandaId,
      porOrden || porCorreccion ? null : id,
      porOrden ? id : null,
      porCorreccion ? id : null,
      etapa,
    );
  }
  return comandaId;
}

/**
 * Mueve una tarea de cocina a la etapa siguiente.
 *
 * Solo se avanza desde una tarea. Un `aviso` es historia —el registro de que
 * una corrección bajó, anuló o renombró algo— y lo terminal (`listo`,
 * `servido`, `cancelado`) es el dato que dice si hubo merma o si se le cobra al
 * cliente: pisarlos con un toque en la pantalla borraría esa información sin
 * dejar rastro.
 */
export function avanzarEtapa(db: Database.Database, comandaLineaId: number, etapa: string): void {
  if (!(ETAPAS_DESTINO as readonly string[]).includes(etapa)) {
    throw new KdsError("etapa_invalida", `Etapa desconocida: ${etapa}`);
  }
  const linea = db.prepare("SELECT etapa, comanda_id FROM comanda_lineas WHERE id = ?").get(comandaLineaId) as
    | { etapa: string; comanda_id: number }
    | undefined;
  if (!linea) throw new KdsError("linea_inexistente", "Línea de comanda inexistente");
  if (!(ETAPAS_TAREA as readonly string[]).includes(linea.etapa)) {
    throw new KdsError("etapa_no_avanzable", `Una línea en ${linea.etapa} ya no avanza`);
  }
  const incidencia = db
    .prepare(
      `SELECT id FROM cocina_incidencias
       WHERE comanda_id = ? AND estado = 'pendiente'
         AND (comanda_linea_id IS NULL OR comanda_linea_id = ?)
       LIMIT 1`,
    )
    .get(linea.comanda_id, comandaLineaId);
  if (incidencia) {
    throw new KdsError("incidencia_pendiente", "El mesero debe responder la solicitud antes de preparar");
  }
  db.prepare("UPDATE comanda_lineas SET etapa = ? WHERE id = ?").run(etapa, comandaLineaId);
}

/**
 * Cancela en cocina las tareas que quedaron sin efecto, sin borrar historia: lo
 * terminal (`listo`, `servido`, `cancelado`) y los avisos no se tocan, porque
 * son el dato que dice si hubo merma o si se le cobra al cliente.
 */
export function cancelarLineasDeOrden(
  db: Database.Database,
  input: { ordenLineaIds?: number[]; correccionLineaIds?: number[] },
): void {
  const cancelables = ETAPAS_CANCELABLES.map(() => "?").join(", ");
  const porOrden = db.prepare(
    `UPDATE comanda_lineas SET etapa = 'cancelado' WHERE orden_linea_id = ? AND etapa IN (${cancelables})`,
  );
  for (const id of input.ordenLineaIds ?? []) porOrden.run(id, ...ETAPAS_CANCELABLES);
  const porCorreccion = db.prepare(
    `UPDATE comanda_lineas SET etapa = 'cancelado' WHERE orden_correccion_linea_id = ? AND etapa IN (${cancelables})`,
  );
  for (const id of input.correccionLineaIds ?? []) porCorreccion.run(id, ...ETAPAS_CANCELABLES);
}

// ---------------------------------------------------------------------------
// Pantalla de cocina: un evento por tarjeta, los dos modelos en la misma lista.
// ---------------------------------------------------------------------------

export type LineaTarjetaKds = {
  /** Id de `comanda_lineas`: es lo que la pantalla manda para avanzar la etapa. */
  id: number;
  etapa: string;
  esAviso: boolean;
  nombre: string;
  /** Lo que cocina tiene que tener listo después de este evento. */
  cantidad: number;
  /** Solo en correcciones; en un envío no hay «antes». */
  cantidadAnterior: number | null;
  delta: number | null;
  nota: string | null;
  notaAnterior: string | null;
  /** Selecciones de contorno de la línea (vacío en legacy y correcciones). */
  contornos: string[];
};

export type TarjetaKds = {
  /** Id de la comanda: la tarjeta es el evento, no la cuenta. */
  id: number;
  tipo: TipoComanda;
  /** `Mesa #7 · Orden #2 · Corrección #1` (diseño §9). */
  referencia: string;
  mesa: number | null;
  mesero: string;
  envioN: number;
  creadaEn: string;
  ordenId: number | null;
  ordenNumero: number | null;
  correccionId: number | null;
  numeroVersion: number | null;
  esAnulacion: boolean;
  /** Las vigentes de la orden; en una corrección, las que ella dejó. */
  indicaciones: string | null;
  indicacionesCambiadas: boolean;
  lineas: LineaTarjetaKds[];
  incidencias: IncidenciaCocina[];
};

type ComandaRow = {
  id: number;
  tipo: TipoComanda;
  envio_n: number;
  creada_en: string;
  pedido_id: number | null;
  orden_id: number | null;
  correccion_id: number | null;
  mesero: string;
  mesa: number | null;
  orden_numero: number | null;
  numero_version: number | null;
  es_anulacion: number | null;
  correccion_indicaciones: string | null;
  pedido_indicaciones: string | null;
};

type LineaLegacyRow = { id: number; etapa: string; nombre: string; cantidad: number; nota: string | null };

type LineaOrdenKdsRow = LineaLegacyRow & { orden_linea_id: number };

type ContornoLineaRow = { slot_nombre: string; variante_nombre: string; es_extra: number };

type LineaCorreccionRow = {
  id: number;
  etapa: string;
  nombre: string;
  cantidad_nueva: number;
  cantidad_anterior: number;
  nota_nueva: string | null;
  nota_anterior: string | null;
};

function referenciaDe(row: ComandaRow): string {
  const mesa = row.mesa == null ? "Sin mesa" : `Mesa #${row.mesa}`;
  // Una comanda legacy no tiene orden: su `envio_n` es el número que cocina
  // llamó «orden», y es el mismo que usa la migración para reconstruirlas.
  const orden = `Orden #${row.orden_numero ?? row.envio_n}`;
  if (row.correccion_id == null) return `${mesa} · ${orden}`;
  const evento = row.es_anulacion === 1 ? "Anulación" : "Corrección";
  return `${mesa} · ${orden} · ${evento} #${row.numero_version}`;
}

function lineaSimple(row: LineaLegacyRow): LineaTarjetaKds {
  return {
    id: row.id,
    etapa: row.etapa,
    esAviso: row.etapa === ETAPA_AVISO,
    nombre: row.nombre,
    cantidad: row.cantidad,
    cantidadAnterior: null,
    delta: null,
    nota: row.nota,
    notaAnterior: null,
    contornos: [],
  };
}

function textoContorno(row: ContornoLineaRow): string {
  return row.es_extra ? `EXTRA: ${row.variante_nombre}` : `${row.slot_nombre}: ${row.variante_nombre}`;
}

/**
 * Un evento por tarjeta: comandas legacy, órdenes nuevas y correcciones —avisos
 * incluidos— en la misma pantalla y en la misma forma. Cocina no tiene por qué
 * saber de qué modelo viene lo que está mirando.
 *
 * Las cantidades y notas salen del evento; las indicaciones, de la versión
 * vigente de la orden (diseño §9). La corrección muestra además su delta: es la
 * diferencia lo que cocina tiene que atender, no el total.
 */
export function tarjetasKds(db: Database.Database): TarjetaKds[] {
  const comandas = db
    .prepare(
      `SELECT c.id, c.tipo, c.envio_n, c.creada_en, c.pedido_id, c.orden_id, c.correccion_id,
              e.nombre AS mesero,
              COALESCE(mp.numero, mc.numero) AS mesa,
              o.numero AS orden_numero,
              oc.numero_version, oc.es_anulacion, oc.indicaciones AS correccion_indicaciones,
              p.indicaciones AS pedido_indicaciones
       FROM comandas c
       JOIN empleados e ON e.id = c.mesero_id
       LEFT JOIN pedidos p ON p.id = c.pedido_id
       LEFT JOIN mesas mp ON mp.id = p.mesa_id
       LEFT JOIN ordenes o ON o.id = c.orden_id
       LEFT JOIN cuentas cu ON cu.id = o.cuenta_id
       LEFT JOIN mesas mc ON mc.id = cu.mesa_id
       LEFT JOIN orden_correcciones oc ON oc.id = c.correccion_id
       ORDER BY c.id DESC`,
    )
    .all() as ComandaRow[];

  const lineasLegacy = db.prepare(
    `SELECT cl.id, cl.etapa, pr.nombre, pl.cantidad, pl.nota
     FROM comanda_lineas cl
     JOIN pedido_lineas pl ON pl.id = cl.pedido_linea_id
     JOIN productos pr ON pr.id = pl.producto_id
     WHERE cl.comanda_id = ?
     ORDER BY cl.id`,
  );
  const lineasOrden = db.prepare(
    `SELECT cl.id, cl.etapa, pr.nombre, ol.cantidad, ol.nota, ol.id AS orden_linea_id
     FROM comanda_lineas cl
     JOIN orden_lineas ol ON ol.id = cl.orden_linea_id
     JOIN productos pr ON pr.id = ol.producto_id
     WHERE cl.comanda_id = ?
     ORDER BY cl.id`,
  );
  const contornosDeLinea = db.prepare(
    "SELECT slot_nombre, variante_nombre, es_extra FROM orden_linea_contornos WHERE orden_linea_id = ? ORDER BY id",
  );
  const lineasCorreccion = db.prepare(
    `SELECT cl.id, cl.etapa, pr.nombre, ocl.cantidad_nueva, ocl.cantidad_anterior, ocl.nota_nueva, ocl.nota_anterior
     FROM comanda_lineas cl
     JOIN orden_correccion_lineas ocl ON ocl.id = cl.orden_correccion_linea_id
     JOIN productos pr ON pr.id = ocl.producto_id
     WHERE cl.comanda_id = ?
     ORDER BY cl.id`,
  );

  return comandas.map((row) => {
    const esCorreccion = row.correccion_id != null;
    const lineas: LineaTarjetaKds[] = esCorreccion
      ? (lineasCorreccion.all(row.id) as LineaCorreccionRow[]).map((l) => ({
          id: l.id,
          etapa: l.etapa,
          esAviso: l.etapa === ETAPA_AVISO,
          nombre: l.nombre,
          cantidad: l.cantidad_nueva,
          cantidadAnterior: l.cantidad_anterior,
          delta: l.cantidad_nueva - l.cantidad_anterior,
          nota: l.nota_nueva,
          notaAnterior: l.nota_anterior,
          contornos: [],
        }))
      : row.orden_id != null
        ? (lineasOrden.all(row.id) as LineaOrdenKdsRow[]).map((l) => ({
            ...lineaSimple(l),
            contornos: (contornosDeLinea.all(l.orden_linea_id) as ContornoLineaRow[]).map(textoContorno),
          }))
        : (lineasLegacy.all(row.id) as LineaLegacyRow[]).map(lineaSimple);

    const indicaciones = esCorreccion
      ? row.correccion_indicaciones || null
      : row.orden_id != null
        ? indicacionesEfectivasOrden(db, row.orden_id)
        : row.pedido_indicaciones;

    return {
      id: row.id,
      tipo: row.tipo,
      referencia: referenciaDe(row),
      mesa: row.mesa,
      mesero: row.mesero,
      envioN: row.envio_n,
      creadaEn: row.creada_en,
      ordenId: row.orden_id,
      ordenNumero: row.orden_numero,
      correccionId: row.correccion_id,
      numeroVersion: row.numero_version,
      esAnulacion: row.es_anulacion === 1,
      indicaciones,
      indicacionesCambiadas: esCorreccion && row.correccion_indicaciones !== null,
      lineas,
      incidencias: incidenciasDeComanda(db, row.id),
    };
  });
}

export type LineaEventoCorreccion = {
  comandaLineaId: number;
  correccionLineaId: number;
  etapa: string;
  lineaClave: string;
  productoId: number;
  nombre: string;
  cantidadAnterior: number;
  cantidadNueva: number;
  delta: number;
  notaAnterior: string | null;
  notaNueva: string | null;
};

export type EventoCorreccion = {
  comandaId: number;
  correccionId: number;
  numeroVersion: number;
  creadaEn: string;
  esAnulacion: boolean;
  /** Solo si esta corrección cambió las indicaciones; `null` es "las borró". */
  indicaciones: string | null;
  cambiaIndicaciones: boolean;
  lineas: LineaEventoCorreccion[];
};

/**
 * Lo que la pantalla de cocina necesita de una corrección: el evento con sus
 * cantidades anterior y nueva, las notas y la etapa de cada línea. La comanda
 * de corrección existe siempre —incluso si solo cambian las indicaciones— y es
 * la notificación; las cantidades vigentes salen de la versión efectiva, no de
 * sumar etapas.
 */
export function eventosDeCorreccion(db: Database.Database, ordenId: number): EventoCorreccion[] {
  const comandas = db
    .prepare(
      `SELECT c.id AS comanda_id, oc.id AS correccion_id, oc.numero_version, oc.creada_en,
              oc.es_anulacion, oc.indicaciones
       FROM comandas c
       JOIN orden_correcciones oc ON oc.id = c.correccion_id
       WHERE c.orden_id = ? AND c.correccion_id IS NOT NULL
       ORDER BY oc.numero_version, c.id`,
    )
    .all(ordenId) as {
    comanda_id: number;
    correccion_id: number;
    numero_version: number;
    creada_en: string;
    es_anulacion: number;
    indicaciones: string | null;
  }[];

  const lineasStmt = db.prepare(
    `SELECT cl.id AS comanda_linea_id, cl.etapa, ocl.id AS correccion_linea_id, ocl.linea_clave,
            ocl.producto_id, p.nombre, ocl.cantidad_anterior, ocl.cantidad_nueva,
            ocl.nota_anterior, ocl.nota_nueva
     FROM comanda_lineas cl
     JOIN orden_correccion_lineas ocl ON ocl.id = cl.orden_correccion_linea_id
     JOIN productos p ON p.id = ocl.producto_id
     WHERE cl.comanda_id = ?
     ORDER BY cl.id`,
  );

  return comandas.map((c) => ({
    comandaId: c.comanda_id,
    correccionId: c.correccion_id,
    numeroVersion: c.numero_version,
    creadaEn: c.creada_en,
    esAnulacion: c.es_anulacion === 1,
    indicaciones: c.indicaciones ? c.indicaciones : null,
    cambiaIndicaciones: c.indicaciones !== null,
    lineas: (
      lineasStmt.all(c.comanda_id) as {
        comanda_linea_id: number;
        etapa: string;
        correccion_linea_id: number;
        linea_clave: string;
        producto_id: number;
        nombre: string;
        cantidad_anterior: number;
        cantidad_nueva: number;
        nota_anterior: string | null;
        nota_nueva: string | null;
      }[]
    ).map((l) => ({
      comandaLineaId: l.comanda_linea_id,
      correccionLineaId: l.correccion_linea_id,
      etapa: l.etapa,
      lineaClave: l.linea_clave,
      productoId: l.producto_id,
      nombre: l.nombre,
      cantidadAnterior: l.cantidad_anterior,
      cantidadNueva: l.cantidad_nueva,
      delta: l.cantidad_nueva - l.cantidad_anterior,
      notaAnterior: l.nota_anterior,
      notaNueva: l.nota_nueva,
    })),
  }));
}
