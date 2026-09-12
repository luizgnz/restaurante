import type Database from "better-sqlite3";
import type { AppConfig } from "../../config.ts";
import { despacharJobs, encolarJob } from "../../print/queue.ts";
import type { PrinterPort, TicketDiferencia } from "../../print/types.ts";
import { exigirPermisoEmpleado, exigirPin } from "../empleados/empleados.ts";
import { ordenIniciadaEnCocina } from "../cuentas/etapas.ts";
import {
  ajustarConsumoDeCorreccion,
  controlarStock,
  lineasSinTrazabilidad,
  type CambioOrdenConsumo,
} from "../inventario/asientos.ts";
import { cancelarLineasDeOrden, crearComanda, ETAPA_AVISO, lineaPreparada, type LineaComanda } from "../kds/kds.ts";
import { indicacionesVigentesOrden, versionVigenteOrden, type LineaVigente } from "./ordenes.ts";

export { indicacionesVigentesOrden };

export class CorreccionError extends Error {
  codigo: string;
  constructor(codigo: string, message: string) {
    super(message);
    this.name = "CorreccionError";
    this.codigo = codigo;
  }
}

/**
 * La identidad de la línea es siempre `lineaClave`: sirve igual para líneas
 * originales, para líneas agregadas por una corrección anterior y para dos
 * líneas del mismo producto. `ordenLineaId` es informativo; si viene, debe
 * coincidir con la línea que resuelve `lineaClave`.
 */
export type CambioOrdenInput = {
  lineaClave: string;
  productoId: number;
  ordenLineaId?: number | null;
  cantidad: number;
  nota?: string | null;
  nombre?: string;
};

export type DiferenciaCocina = {
  lineaClave: string;
  ordenLineaId: number | null;
  productoId: number;
  nombre: string;
  delta: number;
  cantidadAnterior: number;
  cantidadNueva: number;
  notaAnterior: string | null;
  notaNueva: string | null;
};

export type EntradaCorreccion = {
  ordenId: number;
  lineas: CambioOrdenInput[];
  indicaciones?: string | null;
  motivo?: string | null;
  /** Clave del cliente: repetirla devuelve la misma corrección (diseño §10). */
  claveIdempotencia: string;
  pin?: string;
  /** Identidad ya autenticada. Solo Cocina usa esta vía para cancelar un producto iniciado. */
  empleadoIdAutorizado?: number;
  origen?: "mesero" | "cocina" | "incidencia";
};

export type ResultadoCorreccion = {
  ordenId: number;
  correccionId: number;
  comandaId: number;
  repetida: boolean;
  /** Avisos de stock bajo por las líneas nuevas de esta corrección. */
  avisos: string[];
};

type OrdenRow = {
  id: number;
  numero: number;
  estado: string;
  cuenta_id: number;
  cuenta_estado: string;
  mesa_numero: number;
  tipo_servicio: "mesa" | "para_llevar";
};

type ProductoRow = { nombre: string; precio_centavos: number };

type DiferenciaPersistible = DiferenciaCocina & { precioCentavos: number };

function textoOpcional(valor: string | null | undefined): string | null {
  const t = valor?.trim() ?? "";
  return t ? t : null;
}

/**
 * La clave se normaliza una sola vez y todo el resto —validación, diff,
 * persistencia— ve el mismo valor. Con dos normalizaciones distintas, `"uuid "`
 * pasaba la validación como línea existente y el diff la trataba como línea
 * nueva: una línea de más, cobrada y reservada, con éxito reportado.
 */
function normalizarCambios(lineas: CambioOrdenInput[]): CambioOrdenInput[] {
  return lineas.map((l) => ({ ...l, lineaClave: l.lineaClave?.trim() ?? "" }));
}

export function calcularDiferencias(actuales: LineaVigente[], nuevas: CambioOrdenInput[]): DiferenciaCocina[] {
  const porClave = new Map(actuales.map((l) => [l.lineaClave, l]));
  const diferencias: DiferenciaCocina[] = [];
  for (const nueva of normalizarCambios(nuevas)) {
    const actual = porClave.get(nueva.lineaClave);
    const cantidadAnterior = actual?.cantidad ?? 0;
    const notaAnterior = textoOpcional(actual?.nota);
    const notaNueva = textoOpcional(nueva.nota);
    const delta = nueva.cantidad - cantidadAnterior;
    if (delta === 0 && notaAnterior === notaNueva) continue;
    diferencias.push({
      lineaClave: nueva.lineaClave,
      ordenLineaId: actual?.ordenLineaId ?? null,
      productoId: actual?.productoId ?? nueva.productoId,
      nombre: actual?.nombre ?? nueva.nombre ?? "",
      delta,
      cantidadAnterior,
      cantidadNueva: nueva.cantidad,
      notaAnterior,
      notaNueva,
    });
  }
  return diferencias;
}

/**
 * Relee la orden y su cuenta. Se llama **dentro** de la transacción: entre el
 * `await` del PIN y el commit otra sesión puede haber anulado la orden o
 * mandado la cuenta a caja, y una orden anulada no se resucita.
 */
function ordenParaCorregir(db: Database.Database, ordenId: number): OrdenRow {
  const orden = db
    .prepare(
      `SELECT o.id, o.numero, o.estado, o.cuenta_id, c.estado AS cuenta_estado,
              c.tipo_servicio, m.numero AS mesa_numero
       FROM ordenes o
       JOIN cuentas c ON c.id = o.cuenta_id
       JOIN mesas m ON m.id = c.mesa_id
       WHERE o.id = ?`,
    )
    .get(ordenId) as OrdenRow | undefined;
  if (!orden) throw new CorreccionError("orden_inexistente", "Orden inexistente");
  if (orden.estado === "anulada") throw new CorreccionError("orden_anulada", "La orden ya está anulada");
  if (orden.cuenta_estado === "en_caja" || orden.cuenta_estado === "cancelada") {
    throw new CorreccionError("cuenta_cerrada", "La cuenta ya no acepta cambios");
  }
  return orden;
}

function validarCambios(
  db: Database.Database,
  ordenId: number,
  actuales: LineaVigente[],
  lineas: CambioOrdenInput[],
): void {
  const porClave = new Map(actuales.map((l) => [l.lineaClave, l]));
  const claveDeOtraOrden = db.prepare(
    `SELECT 1 AS existe FROM orden_lineas WHERE linea_clave = ? AND orden_id != ?
     UNION ALL
     SELECT 1 AS existe FROM orden_correccion_lineas ocl
     JOIN orden_correcciones oc ON oc.id = ocl.correccion_id
     WHERE ocl.linea_clave = ? AND oc.orden_id != ?
     LIMIT 1`,
  );
  const vistas = new Set<string>();
  for (const linea of lineas) {
    const clave = linea.lineaClave;
    if (!clave) throw new CorreccionError("linea_sin_clave", "Cada línea necesita su lineaClave");
    if (vistas.has(clave)) throw new CorreccionError("linea_duplicada", `lineaClave repetida: ${clave}`);
    vistas.add(clave);
    if (!Number.isFinite(linea.cantidad) || linea.cantidad < 0) {
      throw new CorreccionError("cantidad_invalida", "Cantidad inválida");
    }
    const actual = porClave.get(clave);
    if (!actual) {
      if (linea.ordenLineaId != null) {
        throw new CorreccionError("linea_desalineada", "ordenLineaId no corresponde a una línea de la orden");
      }
      if (linea.cantidad === 0) {
        throw new CorreccionError("linea_agregada_en_cero", "Una línea nueva no puede agregarse en cero");
      }
      if (claveDeOtraOrden.get(clave, ordenId, clave, ordenId)) {
        throw new CorreccionError("linea_de_otra_orden", "Esa lineaClave pertenece a otra orden");
      }
      continue;
    }
    if (linea.ordenLineaId != null && linea.ordenLineaId !== actual.ordenLineaId) {
      throw new CorreccionError("linea_desalineada", "ordenLineaId no corresponde a esa lineaClave");
    }
    if (linea.productoId !== actual.productoId) {
      throw new CorreccionError("producto_desalineado", "El producto no corresponde a esa lineaClave");
    }
  }
}

function lineasPreviasDeClave(
  db: Database.Database,
  ordenId: number,
  lineaClave: string,
  correccionId: number,
): number[] {
  const filas = db
    .prepare(
      `SELECT ocl.id FROM orden_correccion_lineas ocl
       JOIN orden_correcciones oc ON oc.id = ocl.correccion_id
       WHERE oc.orden_id = ? AND ocl.linea_clave = ? AND ocl.correccion_id != ?`,
    )
    .all(ordenId, lineaClave, correccionId) as { id: number }[];
  return filas.map((f) => f.id);
}

function resumenAnulacion(diferencias: DiferenciaCocina[], ordenEnCero: boolean): string {
  const anuladas = diferencias
    .filter((d) => d.cantidadNueva === 0 && d.cantidadAnterior > 0)
    .map((d) => `${d.cantidadAnterior} ${d.nombre}`);
  const encabezado = ordenEnCero ? "Orden anulada" : "Productos anulados";
  return `${encabezado}: ${anuladas.join(", ")}`;
}

function resultadoIdempotente(
  db: Database.Database,
  ordenId: number,
  correccionId: number,
): ResultadoCorreccion {
  const comanda = db.prepare("SELECT id FROM comandas WHERE correccion_id = ?").get(correccionId) as
    | { id: number }
    | undefined;
  if (!comanda) {
    throw new CorreccionError("comanda_inexistente", "La corrección idempotente no tiene comanda");
  }
  return { ordenId, correccionId, comandaId: comanda.id, repetida: true, avisos: [] };
}

export async function corregirOrden(
  db: Database.Database,
  input: EntradaCorreccion,
  printer: PrinterPort,
  cfg: AppConfig,
): Promise<ResultadoCorreccion> {
  const clave = input.claveIdempotencia?.trim() ?? "";
  if (!clave) {
    throw new CorreccionError("clave_idempotencia_requerida", "Hace falta una clave de idempotencia");
  }
  const origen = input.origen ?? "mesero";
  const empleado = input.empleadoIdAutorizado != null
    ? exigirPermisoEmpleado(db, input.empleadoIdAutorizado, "cancelar_producto_cocina")
    : await exigirPin(db, input.pin ?? "", "anular");
  const lineas = normalizarCambios(input.lineas);

  const result = db.transaction((): ResultadoCorreccion => {
    // Acotada a la orden: la misma clave en otra orden es otra corrección, no un
    // reintento, y devolver la ajena sería un éxito falso.
    const yaHecha = db
      .prepare("SELECT id FROM orden_correcciones WHERE orden_id = ? AND clave_idempotencia = ?")
      .get(input.ordenId, clave) as { id: number } | undefined;
    if (yaHecha) return resultadoIdempotente(db, input.ordenId, yaHecha.id);

    const orden = ordenParaCorregir(db, input.ordenId);
    const actuales = versionVigenteOrden(db, input.ordenId);
    validarCambios(db, input.ordenId, actuales, lineas);

    const productoStmt = db.prepare("SELECT nombre, precio_centavos FROM productos WHERE id = ?");
    const diferencias: DiferenciaPersistible[] = calcularDiferencias(actuales, lineas).map((d) => {
      const producto = productoStmt.get(d.productoId) as ProductoRow | undefined;
      if (!producto) throw new CorreccionError("producto_inexistente", "Producto inexistente");
      const original = actuales.find((l) => l.lineaClave === d.lineaClave);
      return {
        ...d,
        nombre: producto.nombre,
        // Las líneas originales conservan el precio con el que se enviaron; las
        // agregadas congelan el de catálogo de este momento.
        precioCentavos: original?.precioCentavos ?? producto.precio_centavos,
      };
    });

    const indicacionesPedidas = input.indicaciones === undefined ? undefined : textoOpcional(input.indicaciones);
    const cambiaIndicaciones =
      indicacionesPedidas !== undefined && indicacionesPedidas !== indicacionesVigentesOrden(db, input.ordenId);
    if (diferencias.length === 0 && !cambiaIndicaciones) {
      throw new CorreccionError("correccion_sin_cambios", "La corrección no cambia cantidades, notas ni indicaciones");
    }

    const anulaLineas = diferencias.some((d) => d.cantidadNueva === 0 && d.cantidadAnterior > 0);
    const finales = new Map(actuales.map((l) => [l.lineaClave, l.cantidad]));
    for (const d of diferencias) finales.set(d.lineaClave, d.cantidadNueva);
    const ordenEnCero = finales.size > 0 && [...finales.values()].every((c) => c === 0);

    if (origen === "mesero" && ordenEnCero && orden.tipo_servicio === "para_llevar") {
      exigirPermisoEmpleado(db, empleado.id, "cancelar_cuenta");
    }

    const motivo = textoOpcional(input.motivo);
    const iniciadaEnCocina = ordenIniciadaEnCocina(db, input.ordenId);

    if (origen === "cocina") {
      const cambioNoPermitido = diferencias.some(
        (d) => d.delta >= 0 || d.cantidadNueva !== 0 || d.notaAnterior !== d.notaNueva,
      );
      if (cambioNoPermitido || cambiaIndicaciones) {
        throw new CorreccionError(
          "cambio_cocina_invalido",
          "Cocina solo puede cancelar por completo un producto que ya empezó",
        );
      }
    }

    // Guarda de etapa (lo que cocina ya empezó no se toca a escondidas): bajar
    // una línea en preparación está bloqueado; Cocina puede anularla por
    // completo con un motivo y la receta vuelve al stock.
    for (const d of diferencias) {
      if (d.delta >= 0) continue;
      const preparada = lineaPreparada(db, d.lineaClave, d.ordenLineaId);
      if (origen === "cocina" && !preparada) {
        throw new CorreccionError(
          "producto_no_iniciado",
          `${d.nombre} todavía no empezó: debe cancelarlo el mesero`,
        );
      }
      if (!preparada) continue;
      if (d.cantidadNueva > 0) {
        throw new CorreccionError(
          "linea_preparada",
          `${d.nombre} ya está en preparación o servida: cocina debe responder antes de cambiarla`,
        );
      }
      if (!motivo) {
        throw new CorreccionError(
          "justificacion_requerida",
          `Para cancelar ${d.nombre} hay que elegir un motivo`,
        );
      }
    }
    if (cfg.auditoria_anulaciones && cfg.justificacion_anulacion && anulaLineas && !motivo) {
      throw new CorreccionError("justificacion_requerida", "Hay que seleccionar por qué se anula");
    }
    if (ordenEnCero && !motivo) {
      throw new CorreccionError("justificacion_requerida", "Para anular la orden hay que registrar el motivo");
    }
    if (origen === "mesero" && iniciadaEnCocina) {
      throw new CorreccionError(
        "orden_en_preparacion",
        "Cocina ya inició esta orden: solo Cocina puede cancelar sus productos",
      );
    }

    // `esNueva` distingue la línea que nace en esta corrección (la única que
    // puede expandir la receta vigente) de la que ya existía y tiene que moverse
    // con las proporciones del libro.
    const consumo: CambioOrdenConsumo[] = diferencias
      .filter((d) => d.delta !== 0)
      .map((d) => ({
        lineaClave: d.lineaClave,
        productoId: d.productoId,
        delta: d.delta,
        esNueva: d.cantidadAnterior === 0,
      }));
    const sinLibro = lineasSinTrazabilidad(db, input.ordenId, consumo);
    if (sinLibro.length > 0) {
      // Antes de escribir nada: mover stock a ciegas dejaría la reserva previa
      // colgada, sin ruta que la libere ni que la firme.
      throw new CorreccionError(
        "inventario_sin_trazabilidad",
        `Sin libro de inventario para: ${sinLibro.map((c) => c.lineaClave).join(", ")}`,
      );
    }

    const previa = db
      .prepare("SELECT max(numero_version) AS n FROM orden_correcciones WHERE orden_id = ?")
      .get(input.ordenId) as { n: number | null };
    const numeroVersion = (previa.n ?? 0) + 1;
    const ahora = new Date().toISOString();
    const correccionId = Number(
      db
        .prepare(
          `INSERT INTO orden_correcciones
            (orden_id, numero_version, motivo, indicaciones, es_anulacion, creada_por_empleado_id, creada_en, clave_idempotencia)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.ordenId,
          numeroVersion,
          motivo,
          cambiaIndicaciones ? (indicacionesPedidas ?? "") : null,
          anulaLineas ? 1 : 0,
          empleado.id,
          ahora,
          clave,
        ).lastInsertRowid,
    );

    const insertLinea = db.prepare(
      `INSERT INTO orden_correccion_lineas
        (correccion_id, orden_linea_id, producto_id, cantidad_anterior, cantidad_nueva, nota_anterior, nota_nueva, linea_clave, precio_centavos)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const lineasComanda: LineaComanda[] = [];
    const ordenLineaIds: number[] = [];
    const correccionLineaIds: number[] = [];
    for (const d of diferencias) {
      const lineaId = Number(
        insertLinea.run(
          correccionId,
          d.ordenLineaId,
          d.productoId,
          d.cantidadAnterior,
          d.cantidadNueva,
          d.notaAnterior,
          d.notaNueva,
          d.lineaClave,
          d.precioCentavos,
        ).lastInsertRowid,
      );
      // Solo un delta positivo es trabajo nuevo para cocina. Bajar, anular o
      // cambiar una nota es un aviso: se ve en pantalla, no cuenta como tarea y
      // nadie lo reescribe.
      lineasComanda.push({ id: lineaId, etapa: d.delta > 0 ? "por_preparar" : ETAPA_AVISO });
      if (d.cantidadNueva === 0 && d.cantidadAnterior > 0) {
        if (d.ordenLineaId != null) ordenLineaIds.push(d.ordenLineaId);
        correccionLineaIds.push(...lineasPreviasDeClave(db, input.ordenId, d.lineaClave, correccionId));
      }
    }

    db.prepare("UPDATE ordenes SET estado = ? WHERE id = ?").run(
      ordenEnCero ? "anulada" : "corregida",
      input.ordenId,
    );

    // Antes de mover un gramo: las líneas nuevas de esta corrección también
    // comprometen bodega, con la misma política que un envío.
    const avisos = controlarStock(
      db,
      { ...cfg, bloqueo_sin_stock: "bloquear" },
      consumo.filter((c) => c.delta > 0).map((c) => ({ productoId: c.productoId, cantidad: c.delta })),
    );

    // Decisión operativa aprobada: cancelar revierte la receta completa incluso
    // si Cocina ya había iniciado o terminado el producto.
    ajustarConsumoDeCorreccion(db, input.ordenId, consumo, cfg.politica_inventario);

    db.prepare("UPDATE precuentas SET vigente = 0 WHERE cuenta_id = ?").run(orden.cuenta_id);
    if (orden.cuenta_estado === "precuenta_emitida") {
      db.prepare("UPDATE cuentas SET estado = 'abierta' WHERE id = ?").run(orden.cuenta_id);
    }

    const comandaId = crearComanda(db, {
      envioN: numeroVersion,
      meseroId: empleado.id,
      lineaIds: lineasComanda,
      ordenId: input.ordenId,
      correccionId,
      tipo: ordenEnCero ? "anulacion" : "correccion",
    });
    cancelarLineasDeOrden(db, { ordenLineaIds, correccionLineaIds, incluirTerminadas: origen === "cocina" });

    if (cfg.auditoria_anulaciones && anulaLineas) {
      db.prepare(
        `INSERT INTO auditoria_anulaciones
          (cuenta_id, orden_id, correccion_id, mesa_numero, orden_numero, empleado_id, resumen, justificacion, creada_en)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        orden.cuenta_id,
        input.ordenId,
        correccionId,
        orden.mesa_numero,
        orden.numero,
        empleado.id,
        resumenAnulacion(diferencias, ordenEnCero),
        motivo,
        ahora,
      );
    }

    const ticketLineas: TicketDiferencia[] = diferencias.map((d) => ({
      nombre: d.nombre,
      delta: d.delta,
      cantidadAnterior: d.cantidadAnterior,
      cantidadNueva: d.cantidadNueva,
      notaAnterior: d.notaAnterior,
      notaNueva: d.notaNueva,
    }));
    encolarJob(db, "correccion", {
      mesaNumero: orden.mesa_numero,
      ordenNumero: orden.numero,
      mesero: empleado.nombre,
      esAnulacion: ordenEnCero,
      indicaciones: indicacionesVigentesOrden(db, input.ordenId),
      indicacionesCambiadas: cambiaIndicaciones,
      lineas: ticketLineas,
    });
    return { ordenId: input.ordenId, correccionId, comandaId, repetida: false, avisos };
  })();

  await despacharJobs(db, printer);
  return result;
}
