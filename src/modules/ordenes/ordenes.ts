import type Database from "better-sqlite3";

export type NuevaLineaOrden = {
  productoId: number;
  cantidad: number;
  nota?: string | null;
};

export type NuevaOrden = {
  mesaId: number;
  lineas: NuevaLineaOrden[];
  indicaciones?: string | null;
  claveIdempotencia: string;
  empleadoId: number;
};

export type LineaEfectiva = {
  lineaClave: string;
  ordenLineaId: number | null;
  productoId: number;
  nombre: string;
  cantidad: number;
  precioCentavos: number;
  nota: string | null;
};

type OrdenLineaRow = {
  id: number;
  producto_id: number;
  cantidad: number;
  precio_centavos: number;
  nota: string | null;
  nombre: string;
  linea_clave: string;
};

type CorreccionLineaRow = {
  producto_id: number;
  cantidad_nueva: number;
  nota_nueva: string | null;
  linea_clave: string;
  precio_centavos: number;
};

type ProductoRow = { nombre: string };

export function versionEfectivaOrden(db: Database.Database, ordenId: number): LineaEfectiva[] {
  const originales = db
    .prepare(
      `SELECT ol.id, ol.producto_id, ol.cantidad, ol.precio_centavos, ol.nota, ol.linea_clave, p.nombre
       FROM orden_lineas ol
       JOIN productos p ON p.id = ol.producto_id
       WHERE ol.orden_id = ?
       ORDER BY ol.id`,
    )
    .all(ordenId) as OrdenLineaRow[];

  const porClave = new Map<string, LineaEfectiva>();
  for (const row of originales) {
    porClave.set(row.linea_clave, {
      lineaClave: row.linea_clave,
      ordenLineaId: row.id,
      productoId: row.producto_id,
      nombre: row.nombre,
      cantidad: row.cantidad,
      precioCentavos: row.precio_centavos,
      nota: row.nota,
    });
  }

  const cambios = db
    .prepare(
      `SELECT ocl.producto_id, ocl.cantidad_nueva, ocl.nota_nueva, ocl.linea_clave, ocl.precio_centavos
       FROM orden_correcciones oc
       JOIN orden_correccion_lineas ocl ON ocl.correccion_id = oc.id
       WHERE oc.orden_id = ?
       ORDER BY oc.numero_version, ocl.id`,
    )
    .all(ordenId) as CorreccionLineaRow[];

  const productoStmt = db.prepare("SELECT nombre FROM productos WHERE id = ?");
  for (const cambio of cambios) {
    const existente = porClave.get(cambio.linea_clave);
    if (existente) {
      porClave.set(cambio.linea_clave, {
        ...existente,
        cantidad: cambio.cantidad_nueva,
        nota: cambio.nota_nueva,
      });
      continue;
    }
    const producto = productoStmt.get(cambio.producto_id) as ProductoRow | undefined;
    if (!producto) continue;
    porClave.set(cambio.linea_clave, {
      lineaClave: cambio.linea_clave,
      ordenLineaId: null,
      productoId: cambio.producto_id,
      nombre: producto.nombre,
      cantidad: cambio.cantidad_nueva,
      // Precio congelado al momento de la corrección: un cambio de carta
      // posterior no puede reescribir el total de la cuenta.
      precioCentavos: cambio.precio_centavos,
      nota: cambio.nota_nueva,
    });
  }

  return [...porClave.values()];
}

/**
 * Las indicaciones de la orden original nunca se sobrescriben: cada corrección
 * guarda las suyas y la última manda. Una cadena vacía significa "sin
 * indicaciones".
 */
export function indicacionesEfectivasOrden(db: Database.Database, ordenId: number): string | null {
  const ultima = db
    .prepare(
      `SELECT indicaciones FROM orden_correcciones
       WHERE orden_id = ? AND indicaciones IS NOT NULL
       ORDER BY numero_version DESC LIMIT 1`,
    )
    .get(ordenId) as { indicaciones: string } | undefined;
  const bruto = ultima
    ? ultima.indicaciones
    : (db.prepare("SELECT indicaciones FROM ordenes WHERE id = ?").get(ordenId) as
        | { indicaciones: string | null }
        | undefined)?.indicaciones ?? null;
  const texto = bruto?.trim() ?? "";
  return texto ? texto : null;
}
