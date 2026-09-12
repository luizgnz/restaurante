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

function nombreCliente(valor: string | null | undefined): string | null {
  const limpio = valor?.trim() ?? "";
  if (limpio.length > 80) throw new OrdenError("cliente_nombre_largo", "El nombre del cliente supera 80 caracteres");
  return limpio || null;
}

function crearMesaInternaParaLlevar(db: Database.Database, numeroServicio: number): number {
  let piso = db
    .prepare("SELECT id FROM pisos WHERE nombre = '__sistema_para_llevar__' AND activo = 0 ORDER BY id LIMIT 1")
    .get() as { id: number } | undefined;
  if (!piso) {
    const info = db
      .prepare("INSERT INTO pisos (nombre, activo) VALUES ('__sistema_para_llevar__', 0)")
      .run();
    piso = { id: Number(info.lastInsertRowid) };
  }
  return Number(
    db
      .prepare(
        `INSERT INTO mesas
          (piso_id, numero, asientos, activa, pos_x, pos_y, forma, ancho, alto)
         VALUES (?, ?, 1, 0, 0, 0, 'square', 88, 88)`,
      )
      .run(piso.id, -numeroServicio).lastInsertRowid,
  );
}

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

    const tipoServicio = input.tipoServicio ?? "mesa";
    if (tipoServicio !== "mesa" && tipoServicio !== "para_llevar") {
      throw new OrdenError("tipo_servicio_invalido", "Tipo de servicio inválido");
    }
    if (tipoServicio === "mesa" && (!Number.isInteger(input.mesaId) || Number(input.mesaId) <= 0)) {
      throw new OrdenError("mesa_inexistente", "Hace falta una mesa válida");
    }

    let cuenta = tipoServicio === "mesa" ? cuentaActivaPorMesa(db, Number(input.mesaId)) : null;
    const ahora = new Date().toISOString();
    if (!cuenta) {
      let mesaId = Number(input.mesaId);
      let numeroServicio: number | null = null;
      if (tipoServicio === "mesa") {
        const mesa = db.prepare("SELECT id FROM mesas WHERE id = ? AND activa = 1").get(mesaId) as { id: number } | undefined;
        if (!mesa) throw new OrdenError("mesa_inexistente", "Mesa inexistente");
      } else {
        const maximo = db
          .prepare("SELECT max(numero_servicio) AS numero FROM cuentas WHERE jornada_id = ? AND tipo_servicio = 'para_llevar'")
          .get(jornada.id) as { numero: number | null };
        numeroServicio = (maximo.numero ?? 0) + 1;
        mesaId = crearMesaInternaParaLlevar(db, numeroServicio);
      }
      const info = db
        .prepare(
          `INSERT INTO cuentas
            (mesa_id, estado, abierta_por_empleado_id, abierta_en, jornada_id, tipo_servicio, numero_servicio, cliente_nombre)
           VALUES (?, 'abierta', ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          mesaId,
          empleado.id,
          ahora,
          jornada.id,
          tipoServicio,
          numeroServicio,
          tipoServicio === "para_llevar" ? nombreCliente(input.clienteNombre) : null,
        );
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
    const avisos = controlarStock(db, { ...cfg, bloqueo_sin_stock: "bloquear" }, consumo);

    registrarConsumoDeOrden(db, ordenId, consumo, cfg.politica_inventario);

    const servicio = db
      .prepare("SELECT c.tipo_servicio, c.numero_servicio, c.cliente_nombre, m.numero FROM cuentas c JOIN mesas m ON m.id = c.mesa_id WHERE c.id = ?")
      .get(cuenta.id) as MesaNumero & { tipo_servicio: "mesa" | "para_llevar"; numero_servicio: number | null; cliente_nombre: string | null };
    const comandaId = crearComanda(db, {
      envioN: numero,
      meseroId: empleado.id,
      lineaIds,
      ordenId,
      tipo: "orden",
    });
    encolarJob(db, "comanda", {
      mesaNumero: servicio.tipo_servicio === "mesa" ? servicio.numero : null,
      ordenNumero: numero,
      mesero: empleado.nombre,
      indicaciones:
        servicio.tipo_servicio === "para_llevar"
          ? [`PARA LLEVAR #${servicio.numero_servicio}`, servicio.cliente_nombre, input.indicaciones]
              .filter(Boolean)
              .join(" · ")
          : input.indicaciones ?? null,
      lineas: ticketLineas,
    });
    return { cuentaId: cuenta.id, ordenId, comandaId, repetida: false, avisos, mesero: empleado.nombre };
  })();

  await despacharJobs(db, printer);
  return result;
}
