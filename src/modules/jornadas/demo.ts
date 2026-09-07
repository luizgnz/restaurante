import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { snapshotCuenta } from "../cuentas/totales.ts";
import { crearRespaldoJornada, estadoJornada, resumenJornada } from "./jornadas.ts";

const PEDIDOS = [
  { mesa: 3, haceMinutos: 10, lineas: [["Empanada", 3], ["Café", 2]] },
  { mesa: 7, haceMinutos: 20, lineas: [["Hamburguesa", 2], ["Jugo", 1]] },
  { mesa: 5, haceMinutos: 30, lineas: [["Pizza margarita", 2], ["Papas fritas", 1]] },
  { mesa: 10, haceMinutos: 45, lineas: [["Pizza margarita", 2]] },
  { mesa: 6, haceMinutos: 55, lineas: [["Cerveza", 4], ["Completo", 2]] },
  { mesa: 8, haceMinutos: 80, lineas: [["Sopa del día", 2]] },
  { mesa: 9, haceMinutos: 100, lineas: [["Ensalada César", 1], ["Agua con gas", 2]] },
  { mesa: 4, haceMinutos: 110, lineas: [["Flan", 2], ["Café", 1]] },
] as const;

const TABLAS_MOVIMIENTO = [
  "cocina_incidencias",
  "comanda_lineas",
  "comandas",
  "caja_handoffs",
  "precuentas",
  "cancelaciones_cuentas",
  "auditoria_anulaciones",
  "orden_linea_contornos",
  "orden_linea_inventario",
  "orden_correccion_lineas",
  "orden_correcciones",
  "orden_lineas",
  "ordenes",
  "cuentas",
  "pedido_lineas",
  "pedidos",
  "print_jobs",
] as const;

function fechaLocal(): string {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
}

function isoHace(minutos: number): string {
  return new Date(Date.now() - minutos * 60_000).toISOString();
}

type Producto = { id: number; nombre: string; precio_centavos: number };

export async function reiniciarDiaDemo(
  db: Database.Database,
  empleadoId: number | null,
  dataDir?: string,
): Promise<{ jornadaId: number; cuentas: number; respaldoRuta: string }> {
  const estadoAnterior = estadoJornada(db);
  const anterior = estadoAnterior.jornada ?? estadoAnterior.ultimaCerrada;
  if (!anterior) throw new Error("No existe una jornada que se pueda respaldar");
  const resumenAnterior = estadoAnterior.jornada ? resumenJornada(db, anterior.id) : null;
  const respaldoRuta = await crearRespaldoJornada(db, anterior, dataDir);
  const empleado = empleadoId == null
    ? null
    : db.prepare("SELECT id, nombre FROM empleados WHERE id = ? AND activo = 1").get(empleadoId) as
      | { id: number; nombre: string }
      | undefined;
  const actor = empleado ?? (db.prepare("SELECT id, nombre FROM empleados WHERE activo = 1 ORDER BY id LIMIT 1").get() as
    | { id: number; nombre: string }
    | undefined);
  if (!actor) throw new Error("No hay un empleado activo para crear el día de demostración");

  const productos = new Map<string, Producto>();
  for (const pedido of PEDIDOS) {
    for (const [nombre] of pedido.lineas) {
      if (productos.has(nombre)) continue;
      const producto = db.prepare(
        "SELECT id, nombre, precio_centavos FROM productos WHERE nombre = ? AND activo = 1 AND disponible_en_pos = 1",
      ).get(nombre) as Producto | undefined;
      if (!producto) throw new Error(`Falta el producto demo: ${nombre}`);
      productos.set(nombre, producto);
    }
  }
  const mesas = new Map<number, number>();
  for (const pedido of PEDIDOS) {
    const mesa = db.prepare("SELECT id FROM mesas WHERE numero = ? AND activa = 1 ORDER BY id LIMIT 1").get(pedido.mesa) as
      | { id: number }
      | undefined;
    if (!mesa) throw new Error(`Falta la mesa demo #${pedido.mesa}`);
    mesas.set(pedido.mesa, mesa.id);
  }

  const jornadaId = db.transaction(() => {
    for (const tabla of TABLAS_MOVIMIENTO) db.prepare(`DELETE FROM ${tabla}`).run();
    if (estadoAnterior.jornada) {
      const cerradoEn = new Date().toISOString();
      db.prepare(
        `UPDATE jornadas_operativas
         SET estado = 'cerrada', cerrada_en = ?, cerrada_por_empleado_id = ?, respaldo_ruta = ?, resumen_json = ?
         WHERE id = ?`,
      ).run(cerradoEn, actor.id, respaldoRuta, JSON.stringify(resumenAnterior), anterior.id);
      db.prepare(
        `INSERT INTO jornada_eventos (jornada_id, tipo, empleado_id, detalle_json, creado_en)
         VALUES (?, 'cierre', ?, ?, ?)`,
      ).run(anterior.id, actor.id, JSON.stringify({ motivo: "reinicio_demo", resumen: resumenAnterior, respaldoRuta }), cerradoEn);
    }

    const abiertaEn = new Date().toISOString();
    const nuevaId = Number(db.prepare(
      `INSERT INTO jornadas_operativas (fecha_operativa, estado, abierta_en, abierta_por_empleado_id)
       VALUES (?, 'abierta', ?, ?)`,
    ).run(fechaLocal(), abiertaEn, actor.id).lastInsertRowid);
    db.prepare(
      `INSERT INTO jornada_eventos (jornada_id, tipo, empleado_id, detalle_json, creado_en)
       VALUES (?, 'apertura', ?, '{"origen":"reinicio_demo"}', ?)`,
    ).run(nuevaId, actor.id, abiertaEn);

    const insertarCuenta = db.prepare(
      `INSERT INTO cuentas (mesa_id, estado, abierta_por_empleado_id, abierta_en, jornada_id)
       VALUES (?, 'abierta', ?, ?, ?)`,
    );
    const insertarOrden = db.prepare(
      `INSERT INTO ordenes (cuenta_id, numero, estado, indicaciones, creada_por_empleado_id, creada_en, clave_idempotencia)
       VALUES (?, 1, 'enviada', NULL, ?, ?, ?)`,
    );
    const insertarLinea = db.prepare(
      `INSERT INTO orden_lineas (orden_id, producto_id, cantidad, precio_centavos, nota, linea_clave)
       VALUES (?, ?, ?, ?, NULL, ?)`,
    );
    const insertarComanda = db.prepare(
      `INSERT INTO comandas (pedido_id, envio_n, mesero_id, creada_en, orden_id, correccion_id, tipo, jornada_id)
       VALUES (NULL, 1, ?, ?, ?, NULL, 'orden', ?)`,
    );
    const insertarComandaLinea = db.prepare(
      `INSERT INTO comanda_lineas (comanda_id, pedido_linea_id, orden_linea_id, orden_correccion_linea_id, etapa)
       VALUES (?, NULL, ?, NULL, ?)`,
    );

    let cuentaPrecuenta: number | null = null;
    for (const pedido of PEDIDOS) {
      const creadaEn = isoHace(pedido.haceMinutos);
      const cuentaId = Number(insertarCuenta.run(mesas.get(pedido.mesa), actor.id, creadaEn, nuevaId).lastInsertRowid);
      const ordenId = Number(insertarOrden.run(cuentaId, actor.id, creadaEn, `demo-${randomUUID()}`).lastInsertRowid);
      const comandaId = Number(insertarComanda.run(actor.id, creadaEn, ordenId, nuevaId).lastInsertRowid);
      const etapa = pedido.mesa === 5 ? "en_proceso" : pedido.mesa === 6 || pedido.mesa === 9 ? "listo" : "por_preparar";
      for (const [nombre, cantidad] of pedido.lineas) {
        const producto = productos.get(nombre)!;
        const lineaId = Number(insertarLinea.run(ordenId, producto.id, cantidad, producto.precio_centavos, randomUUID()).lastInsertRowid);
        insertarComandaLinea.run(comandaId, lineaId, etapa);
      }
      if (pedido.mesa === 10) cuentaPrecuenta = cuentaId;
    }

    if (cuentaPrecuenta != null) {
      const snapshot = { ...snapshotCuenta(db, cuentaPrecuenta), mesero: actor.nombre, leyenda: "Esto no es boleta ni factura. El documento tributario lo emite caja." };
      db.prepare(
        `INSERT INTO precuentas (pedido_id, cuenta_id, numero, vigente, mesero_id, snapshot_json, emitida_en)
         VALUES (NULL, ?, 1, 1, ?, ?, ?)`,
      ).run(cuentaPrecuenta, actor.id, JSON.stringify(snapshot), new Date().toISOString());
      db.prepare("UPDATE cuentas SET estado = 'precuenta_emitida' WHERE id = ?").run(cuentaPrecuenta);
    }

    db.prepare(
      `INSERT INTO jornada_eventos (jornada_id, tipo, empleado_id, detalle_json, creado_en)
       VALUES (?, 'reinicio_demo', ?, ?, ?)`,
    ).run(nuevaId, actor.id, JSON.stringify({ cuentas: PEDIDOS.length, respaldoRuta }), new Date().toISOString());
    return nuevaId;
  })();

  return { jornadaId, cuentas: PEDIDOS.length, respaldoRuta };
}
