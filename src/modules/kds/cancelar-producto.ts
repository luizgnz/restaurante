import type Database from "better-sqlite3";
import type { AppConfig } from "../../config.ts";
import type { PrinterPort } from "../../print/types.ts";
import { corregirOrden, type ResultadoCorreccion } from "../ordenes/correcciones.ts";
import { versionVigenteOrden } from "../ordenes/ordenes.ts";
import { KdsError } from "./kds.ts";

type LineaObjetivo = {
  orden_id: number | null;
  orden_linea_id: number | null;
  linea_clave: string | null;
  etapa: string;
};

export type ActualizacionCocina = {
  id: number;
  ordenId: number;
  mesa: number;
  tipoServicio: "mesa" | "para_llevar";
  numeroServicio: number | null;
  clienteNombre: string | null;
  producto: string;
  cantidad: number;
  motivo: string;
  cocina: string;
  creadaEn: string;
};

export function listarActualizacionesCocina(db: Database.Database): ActualizacionCocina[] {
  return db.prepare(
    `SELECT cp.id, cp.orden_id AS ordenId, m.numero AS mesa,
            cu.tipo_servicio AS tipoServicio, cu.numero_servicio AS numeroServicio,
            cu.cliente_nombre AS clienteNombre, p.nombre AS producto,
            cp.cantidad, cp.motivo, e.nombre AS cocina, cp.creada_en AS creadaEn
     FROM cancelaciones_productos_cocina cp
     JOIN ordenes o ON o.id = cp.orden_id
     JOIN cuentas cu ON cu.id = o.cuenta_id
     JOIN mesas m ON m.id = cu.mesa_id
     JOIN productos p ON p.id = cp.producto_id
     JOIN empleados e ON e.id = cp.empleado_id
     JOIN jornadas_operativas jo ON jo.id = cu.jornada_id
     WHERE cp.reconocida_en IS NULL AND jo.estado = 'abierta'
     ORDER BY cp.creada_en DESC, cp.id DESC`,
  ).all() as ActualizacionCocina[];
}

export function reconocerActualizacionCocina(
  db: Database.Database,
  id: number,
  empleadoId: number,
): ActualizacionCocina {
  const actualizacion = listarActualizacionesCocina(db).find((item) => item.id === id);
  if (!actualizacion) throw new KdsError("linea_inexistente", "La actualización ya fue reconocida o no existe");
  db.prepare(
    `UPDATE cancelaciones_productos_cocina
     SET reconocida_en = ?, reconocida_por_empleado_id = ?
     WHERE id = ? AND reconocida_en IS NULL`,
  ).run(new Date().toISOString(), empleadoId, id);
  return actualizacion;
}

export async function cancelarProductoDesdeCocina(
  db: Database.Database,
  input: {
    comandaLineaId: number;
    empleadoId: number;
    motivo: string;
    printer: PrinterPort;
    config: AppConfig;
  },
): Promise<ResultadoCorreccion> {
  const motivo = input.motivo.trim();
  if (!motivo) throw new KdsError("motivo_requerido", "Selecciona el motivo de la cancelación");
  const objetivo = db
    .prepare(
      `SELECT c.orden_id, cl.orden_linea_id, ocl.linea_clave, cl.etapa
       FROM comanda_lineas cl
       JOIN comandas c ON c.id = cl.comanda_id
       LEFT JOIN orden_correccion_lineas ocl ON ocl.id = cl.orden_correccion_linea_id
       WHERE cl.id = ?`,
    )
    .get(input.comandaLineaId) as LineaObjetivo | undefined;
  if (!objetivo?.orden_id) throw new KdsError("linea_inexistente", "El producto no pertenece a una orden activa");
  if (!["en_proceso", "listo", "servido"].includes(objetivo.etapa)) {
    throw new KdsError("etapa_no_avanzable", "Cocina solo cancela productos que ya comenzaron");
  }
  const linea = versionVigenteOrden(db, objetivo.orden_id).find((actual) =>
    objetivo.orden_linea_id != null
      ? actual.ordenLineaId === objetivo.orden_linea_id
      : actual.lineaClave === objetivo.linea_clave,
  );
  if (!linea || linea.cantidad <= 0) throw new KdsError("linea_inexistente", "El producto ya no forma parte de la orden");

  const correccion = await corregirOrden(
    db,
    {
      ordenId: objetivo.orden_id,
      lineas: [{
        lineaClave: linea.lineaClave,
        productoId: linea.productoId,
        ordenLineaId: linea.ordenLineaId,
        cantidad: 0,
        nota: linea.nota,
      }],
      motivo,
      claveIdempotencia: `cocina-cancelar-${input.comandaLineaId}`,
      empleadoIdAutorizado: input.empleadoId,
      origen: "cocina",
    },
    input.printer,
    input.config,
  );

  db.transaction(() => {
    db.prepare(
      `INSERT OR IGNORE INTO cancelaciones_productos_cocina
        (orden_id, correccion_id, linea_clave, producto_id, cantidad, empleado_id, motivo, creada_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      objetivo.orden_id,
      correccion.correccionId,
      linea.lineaClave,
      linea.productoId,
      linea.cantidad,
      input.empleadoId,
      motivo,
      new Date().toISOString(),
    );
    db.prepare(
      `UPDATE cocina_incidencias SET estado = 'eliminada', respondida_en = ?
       WHERE orden_id = ? AND estado = 'pendiente'
         AND (comanda_linea_id IS NULL OR comanda_linea_id = ?)`,
    ).run(new Date().toISOString(), objetivo.orden_id, input.comandaLineaId);
  })();
  return correccion;
}
