/**
 * Único mapa de estados de la app: estado → etiqueta en español → tono de
 * badge. Toda pantalla que muestre un estado de cuenta, mesa, orden o etapa
 * de cocina debe pasar por aquí — nunca texto crudo de la base de datos ni
 * mapas locales por pantalla.
 */
export type TonoBadge = "default" | "secondary" | "outline" | "success" | "warning" | "danger";

const CUENTA: Record<string, { etiqueta: string; tono: TonoBadge }> = {
  abierta: { etiqueta: "En pedido", tono: "success" },
  precuenta_emitida: { etiqueta: "Precuenta emitida", tono: "warning" },
  en_caja: { etiqueta: "En caja", tono: "default" },
  cancelada: { etiqueta: "Cancelada", tono: "danger" },
};

const MESA: Record<string, { etiqueta: string; tono: TonoBadge }> = {
  libre: { etiqueta: "Libre", tono: "success" },
  ocupada: { etiqueta: "Ocupada", tono: "default" },
  en_cocina: { etiqueta: "En pedido", tono: "default" },
  precuenta: { etiqueta: "Precuenta", tono: "warning" },
  en_caja: { etiqueta: "En caja", tono: "default" },
};

const ORDEN: Record<string, { etiqueta: string; tono: TonoBadge }> = {
  enviada: { etiqueta: "Enviada", tono: "default" },
  corregida: { etiqueta: "Corregida", tono: "warning" },
  anulada: { etiqueta: "Anulada", tono: "danger" },
};

/** Etapa agregada de una orden completa (tabla de Órdenes). */
const ETAPA_ORDEN: Record<string, { etiqueta: string; tono: TonoBadge }> = {
  enviado: { etiqueta: "Enviado", tono: "secondary" },
  en_preparacion: { etiqueta: "En preparación", tono: "warning" },
  listo: { etiqueta: "Listo", tono: "success" },
  entregado: { etiqueta: "Entregado", tono: "outline" },
};

const ETAPA: Record<string, { etiqueta: string; tono: TonoBadge }> = {
  por_preparar: { etiqueta: "Enviado a cocina", tono: "secondary" },
  en_proceso: { etiqueta: "En preparación", tono: "warning" },
  listo: { etiqueta: "Listo para entregar", tono: "success" },
  servido: { etiqueta: "Entregado", tono: "success" },
  cancelado: { etiqueta: "Cancelado", tono: "danger" },
  aviso: { etiqueta: "Aviso", tono: "danger" },
};

function del(mapa: Record<string, { etiqueta: string; tono: TonoBadge }>, estado: string) {
  return mapa[estado] ?? { etiqueta: estado, tono: "default" as TonoBadge };
}

export function etiquetaCuenta(estado: string): string {
  return del(CUENTA, estado).etiqueta;
}
export function tonoCuenta(estado: string): TonoBadge {
  return del(CUENTA, estado).tono;
}
export function etiquetaMesa(estado: string): string {
  return del(MESA, estado).etiqueta;
}
export function tonoMesa(estado: string): TonoBadge {
  return del(MESA, estado).tono;
}
export function etiquetaOrden(estado: string): string {
  return del(ORDEN, estado).etiqueta;
}
export function tonoOrden(estado: string): TonoBadge {
  return del(ORDEN, estado).tono;
}
export function etiquetaEtapaOrden(etapa: string): string {
  return del(ETAPA_ORDEN, etapa).etiqueta;
}
export function tonoEtapaOrden(etapa: string): TonoBadge {
  return del(ETAPA_ORDEN, etapa).tono;
}
export function etiquetaEtapa(etapa: string): string {
  return del(ETAPA, etapa).etiqueta;
}
export function tonoEtapa(etapa: string): TonoBadge {
  return del(ETAPA, etapa).tono;
}
