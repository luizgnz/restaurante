import type Database from "better-sqlite3";
import type { AppConfig } from "../../config.ts";
import { encolarJob, despacharJobs } from "../../print/queue.ts";
import type { PrinterPort } from "../../print/types.ts";
import { validarSelecciones } from "../contornos/contornos.ts";
import { cuentaActivaPorMesa } from "../cuentas/cuentas.ts";
import { empleadoPorId } from "../empleados/empleados.ts";
import { controlarStock, registrarConsumoDeOrden, type LineaOrdenConsumo } from "../inventario/asientos.ts";
import { exigirJornadaAbierta } from "../jornadas/jornadas.ts";
import { crearComanda } from "../kds/kds.ts";
import type { NuevaOrden } from "./ordenes.ts";

export class OrdenError extends Error {
  codigo: string;
  constructor(codigo: string, message: string) {
    super(message);
    this.name = "OrdenError";
    this.codigo = codigo;
  }
}

export type ResultadoEnvio = {
  cuentaId: number;
  ordenId: number;
  comandaId: number;
  repetida: boolean;
  /** Avisos de stock bajo: la orden entra, pero no hay respaldo para todo. */
  avisos: string[];
  /** Quien autorizó el envío: el PIN que lo firmó, no la sesión abierta. */
  mesero: string;
};

type OrdenExistente = { id: number; cuenta_id: number };
type ProductoPrecio = { nombre: string; precio_centavos: number };
type MesaNumero = { numero: number };

function resultadoIdempotente(db: Database.Database, orden: OrdenExistente): ResultadoEnvio {
  const comanda = db
    .prepare(
      `SELECT c.id, e.nombre AS mesero FROM comandas c
       JOIN empleados e ON e.id = c.mesero_id
       WHERE c.orden_id = ? AND c.tipo = 'orden'`,
    )
    .get(orden.id) as { id: number; mesero: string } | undefined;
  if (!comanda) throw new OrdenError("comanda_inexistente", "La orden idempotente no tiene comanda");
  return {
    cuentaId: orden.cuenta_id,
    ordenId: orden.id,
    comandaId: comanda.id,
    repetida: true,
    avisos: [],
    mesero: comanda.mesero,
  };
}

export async function enviarOrden(
  db: Database.Database,
  input: NuevaOrden,
  printer: PrinterPort,
  cfg: AppConfig,
): Promise<ResultadoEnvio> {
  const result = db.transaction((): ResultadoEnvio => {
    const jornada = exigirJornadaAbierta(db);
    const existente = db
      .prepare("SELECT id, cuenta_id FROM ordenes WHERE clave_idempotencia = ?")
      .get(input.claveIdempotencia) as OrdenExistente | undefined;
    if (existente) return resultadoIdempotente(db, existente);

    const empleado = empleadoPorId(db, input.empleadoId);
    if (!empleado) throw new OrdenError("empleado_inexistente", "Empleado inexistente");
    if (input.lineas.length === 0) {
      throw new OrdenError("orden_sin_productos", "La orden no tiene productos");
    }
    for (const linea of input.lineas) {
      if (!(linea.cantidad > 0)) throw new OrdenError("cantidad_invalida", "Cantidad inválida");
    }

    let cuenta = cuentaActivaPorMesa(db, input.mesaId);
    const ahora = new Date().toISOString();
    if (!cuenta) {
      const mesa = db.prepare("SELECT id FROM mesas WHERE id = ?").get(input.mesaId) as { id: number } | undefined;
      if (!mesa) throw new OrdenError("mesa_inexistente", "Mesa inexistente");
      const info = db
        .prepare(
          "INSERT INTO cuentas (mesa_id, estado, abierta_por_empleado_id, abierta_en, jornada_id) VALUES (?, 'abierta', ?, ?, ?)",
        )
        .run(input.mesaId, empleado.id, ahora, jornada.id);
      cuenta = { id: Number(info.lastInsertRowid), estado: "abierta" };
    }

    const maxNumero = db.prepare("SELECT max(numero) AS n FROM ordenes WHERE cuenta_id = ?").get(cuenta.id) as {
      n: number | null;
    };
    const numero = (maxNumero.n ?? 0) + 1;
    const ordenId = Number(
      db
        .prepare(
          "INSERT INTO ordenes (cuenta_id, numero, estado, indicaciones, creada_por_empleado_id, creada_en, clave_idempotencia) VALUES (?, ?, 'enviada', ?, ?, ?, ?)",
        )
        .run(cuenta.id, numero, input.indicaciones ?? null, empleado.id, ahora, input.claveIdempotencia).lastInsertRowid,
    );

    const productoStmt = db.prepare("SELECT nombre, precio_centavos FROM productos WHERE id = ?");
    const insertLinea = db.prepare(
      "INSERT INTO orden_lineas (orden_id, producto_id, cantidad, precio_centavos, nota, linea_clave) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const insertContorno = db.prepare(
      `INSERT INTO orden_linea_contornos
        (orden_linea_id, slot_posicion, slot_nombre, variante_nombre, precio_centavos, es_extra, orden_extra)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const lineaIds: number[] = [];
    const ticketLineas: { nombre: string; cantidad: number; nota: string | null; contornos?: string[] }[] = [];
    const consumo: LineaOrdenConsumo[] = [];
    for (const linea of input.lineas) {
      const producto = productoStmt.get(linea.productoId) as ProductoPrecio | undefined;
      if (!producto) throw new OrdenError("producto_inexistente", "Producto inexistente");
      const selecciones = validarSelecciones(db, linea.productoId, linea.contornos ?? []);
      const adicionalCentavos = selecciones.reduce((suma, seleccion) => suma + seleccion.precioCentavos, 0);
      const lineaClave = crypto.randomUUID();
      const lineaId = Number(
        insertLinea.run(
          ordenId,
          linea.productoId,
          linea.cantidad,
          producto.precio_centavos + adicionalCentavos,
          linea.nota ?? null,
          lineaClave,
        ).lastInsertRowid,
      );
      const contornosTexto: string[] = [];
      for (const seleccion of selecciones) {
        insertContorno.run(
          lineaId,
          seleccion.slotPosicion,
          seleccion.slotNombre,
          seleccion.varianteNombre,
          seleccion.precioCentavos,
          seleccion.esExtra ? 1 : 0,
          seleccion.ordenExtra,
        );
        contornosTexto.push(
          seleccion.esExtra ? `EXTRA: ${seleccion.varianteNombre}` : `${seleccion.slotNombre}: ${seleccion.varianteNombre}`,
        );
      }
      lineaIds.push(lineaId);
      ticketLineas.push({
        nombre: producto.nombre,
        cantidad: linea.cantidad,
        nota: linea.nota ?? null,
        ...(contornosTexto.length > 0 ? { contornos: contornosTexto } : {}),
      });
      consumo.push({ lineaClave, productoId: linea.productoId, cantidad: linea.cantidad });
    }

    db.prepare("UPDATE precuentas SET vigente = 0 WHERE cuenta_id = ?").run(cuenta.id);
    if (cuenta.estado === "precuenta_emitida") {
      db.prepare("UPDATE cuentas SET estado = 'abierta' WHERE id = ?").run(cuenta.id);
    }

    // Antes de mover un gramo: la política `bloqueo_sin_stock` decide si esta
    // orden puede comprometer lo que hay en bodega.
    const avisos = controlarStock(db, cfg, consumo);

    registrarConsumoDeOrden(db, ordenId, consumo, cfg.politica_inventario);

    const mesa = db.prepare("SELECT numero FROM mesas WHERE id = ?").get(input.mesaId) as MesaNumero;
    const comandaId = crearComanda(db, {
      envioN: numero,
      meseroId: empleado.id,
      lineaIds,
      ordenId,
      tipo: "orden",
    });
    encolarJob(db, "comanda", {
      mesaNumero: mesa.numero,
      ordenNumero: numero,
      mesero: empleado.nombre,
      indicaciones: input.indicaciones ?? null,
      lineas: ticketLineas,
    });
    return { cuentaId: cuenta.id, ordenId, comandaId, repetida: false, avisos, mesero: empleado.nombre };
  })();

  await despacharJobs(db, printer);
  return result;
}
