import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { defaultConfig, type AppConfig } from "../../config.ts";
import { snapshotCuenta, totalEfectivoCuenta } from "../cuentas/totales.ts";

export type ResultadoMigracion = {
  cuentas: number;
  ordenes: number;
  lineas: number;
  borradoresExportados: number;
  errores: string[];
};

type PedidoLegacy = {
  id: number;
  mesa_id: number | null;
  estado: string;
  mesero_id: number | null;
  abierto_en: string;
  nota_privada: string | null;
  indicaciones: string | null;
  mesa_numero: number | null;
  mesero: string | null;
};

type LineaLegacy = {
  id: number;
  producto_id: number;
  cantidad: number;
  nota: string | null;
  estado: string;
  precio_centavos: number;
  nombre: string;
};

type ComandaLegacy = { id: number; envio_n: number; mesero_id: number; creada_en: string };

type BorradorExportado = {
  pedidoId: number;
  mesa: number | null;
  empleado: string | null;
  abiertoEn: string;
  notaPrivada: string | null;
  indicaciones: string | null;
  productos: Array<{
    productoId: number;
    nombre: string;
    cantidad: number;
    nota: string | null;
    precioCentavos: number;
  }>;
};

class MigracionError extends Error {}

function estadoCuenta(estado: string): "abierta" | "precuenta_emitida" | "en_caja" | "cancelada" {
  if (estado === "en_caja") return "en_caja";
  if (estado === "cancelado") return "cancelada";
  if (estado === "precuenta_emitida") return "precuenta_emitida";
  return "abierta";
}

function pedidosPendientes(db: Database.Database): PedidoLegacy[] {
  return db
    .prepare(
      `SELECT p.id, p.mesa_id, p.estado, p.mesero_id, p.abierto_en, p.nota_privada, p.indicaciones,
              m.numero AS mesa_numero, e.nombre AS mesero
       FROM pedidos p
       LEFT JOIN mesas m ON m.id = p.mesa_id
       LEFT JOIN empleados e ON e.id = p.mesero_id
       LEFT JOIN cuentas c ON c.legacy_pedido_id = p.id
       WHERE c.id IS NULL
       ORDER BY p.id`,
    )
    .all() as PedidoLegacy[];
}

function lineasPedido(db: Database.Database, pedidoId: number): LineaLegacy[] {
  return db
    .prepare(
      `SELECT pl.id, pl.producto_id, pl.cantidad, pl.nota, pl.estado, pl.precio_centavos, p.nombre
       FROM pedido_lineas pl
       JOIN productos p ON p.id = pl.producto_id
       WHERE pl.pedido_id = ?
       ORDER BY pl.id`,
    )
    .all(pedidoId) as LineaLegacy[];
}

function exportarBorradores(db: Database.Database, exportDir: string, pedidos: PedidoLegacy[]): number {
  const carpeta = path.join(exportDir, "migration");
  let escritos = 0;
  for (const pedido of pedidos) {
    const pendientes = lineasPedido(db, pedido.id).filter((l) => l.estado === "nueva");
    if (pendientes.length === 0) continue;
    mkdirSync(carpeta, { recursive: true });
    const borrador: BorradorExportado = {
      pedidoId: pedido.id,
      mesa: pedido.mesa_numero,
      empleado: pedido.mesero,
      abiertoEn: pedido.abierto_en,
      notaPrivada: pedido.nota_privada,
      indicaciones: pedido.indicaciones,
      productos: pendientes.map((l) => ({
        productoId: l.producto_id,
        nombre: l.nombre,
        cantidad: l.cantidad,
        nota: l.nota,
        precioCentavos: l.precio_centavos,
      })),
    };
    writeFileSync(path.join(carpeta, `pedido-${pedido.id}-borrador.json`), `${JSON.stringify(borrador, null, 2)}\n`, "utf8");
    escritos += 1;
  }
  return escritos;
}

function expandirProducto(
  db: Database.Database,
  productoId: number,
): Array<{ productoId: number; cantidadPorUnidad: number }> {
  const producto = db
    .prepare("SELECT tipo_consumo, rastrear_inventario FROM productos WHERE id = ?")
    .get(productoId) as { tipo_consumo: string; rastrear_inventario: number } | undefined;
  if (!producto) throw new MigracionError(`Producto inexistente ${productoId}`);
  if (producto.tipo_consumo === "receta_kit") {
    return (
      db
        .prepare("SELECT ingrediente_id, cantidad_real FROM receta_lineas WHERE producto_id = ?")
        .all(productoId) as { ingrediente_id: number; cantidad_real: number }[]
    ).map((r) => ({ productoId: r.ingrediente_id, cantidadPorUnidad: r.cantidad_real }));
  }
  if (producto.tipo_consumo === "almacenable_unitario" || producto.rastrear_inventario) {
    return [{ productoId, cantidadPorUnidad: 1 }];
  }
  return [];
}

function consumoFirmado(
  db: Database.Database,
  pedidoId: number,
  comandaCreadaEn: string,
  cfg: AppConfig,
): boolean {
  if (cfg.politica_inventario === "descuento_al_enviar") return true;
  if (cfg.politica_inventario === "reserva_al_enviar_firme_al_enviar_caja") {
    return Boolean(db.prepare("SELECT 1 FROM caja_handoffs WHERE pedido_id = ? LIMIT 1").get(pedidoId));
  }
  const precuenta = db
    .prepare("SELECT emitida_en FROM precuentas WHERE pedido_id = ? ORDER BY emitida_en DESC LIMIT 1")
    .get(pedidoId) as { emitida_en: string } | undefined;
  return Boolean(precuenta && precuenta.emitida_en >= comandaCreadaEn);
}

function migrarUno(
  db: Database.Database,
  pedido: PedidoLegacy,
  cfg: AppConfig,
): { cuentaId: number; ordenes: number; lineas: number } {
  if (pedido.mesa_id == null) {
    throw new MigracionError(`Pedido ${pedido.id} sin mesa: se exportó como borrador y no se convierte en cuenta`);
  }
  const cuentaId = Number(
    db
      .prepare(
        `INSERT INTO cuentas
          (mesa_id, estado, abierta_por_empleado_id, abierta_en, cerrada_en, nota_privada, legacy_pedido_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        pedido.mesa_id,
        estadoCuenta(pedido.estado),
        pedido.mesero_id,
        pedido.abierto_en,
        pedido.estado === "en_caja" || pedido.estado === "cancelado" ? pedido.abierto_en : null,
        pedido.nota_privada,
        pedido.id,
      ).lastInsertRowid,
  );

  const comandas = db
    .prepare("SELECT id, envio_n, mesero_id, creada_en FROM comandas WHERE pedido_id = ? ORDER BY envio_n, id")
    .all(pedido.id) as ComandaLegacy[];
  const todas = lineasPedido(db, pedido.id);
  const migradas = new Set<number>();
  let nOrdenes = 0;
  let nLineas = 0;

  for (const comanda of comandas) {
    const lineas = db
      .prepare(
        `SELECT pl.id, pl.producto_id, pl.cantidad, pl.nota, pl.estado, pl.precio_centavos, p.nombre,
                cl.id AS comanda_linea_id
         FROM comanda_lineas cl
         JOIN pedido_lineas pl ON pl.id = cl.pedido_linea_id
         JOIN productos p ON p.id = pl.producto_id
         WHERE cl.comanda_id = ?
         ORDER BY cl.id`,
      )
      .all(comanda.id) as Array<LineaLegacy & { comanda_linea_id: number }>;
    if (lineas.length === 0) throw new MigracionError(`Comanda ${comanda.id} sin líneas`);
    const tieneAnuladas = lineas.some((l) => l.estado.startsWith("anulada"));
    const todasAnuladas = lineas.every((l) => l.estado.startsWith("anulada"));
    const ordenId = Number(
      db
        .prepare(
          `INSERT INTO ordenes
            (cuenta_id, numero, estado, indicaciones, creada_por_empleado_id, creada_en,
             clave_idempotencia, legacy_envio_n)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          cuentaId,
          comanda.envio_n,
          todasAnuladas ? "anulada" : tieneAnuladas ? "corregida" : "enviada",
          pedido.indicaciones,
          comanda.mesero_id,
          comanda.creada_en,
          `migracion-pedido-${pedido.id}-envio-${comanda.envio_n}`,
          comanda.envio_n,
        ).lastInsertRowid,
    );
    const canceladas: Array<{ linea: LineaLegacy; ordenLineaId: number; lineaClave: string }> = [];
    for (const linea of lineas) {
      if (migradas.has(linea.id)) throw new MigracionError(`Línea ${linea.id} aparece en más de una comanda`);
      migradas.add(linea.id);
      const lineaClave = `legacy-pedido-linea-${linea.id}`;
      const ordenLineaId = Number(
        db
          .prepare(
            `INSERT INTO orden_lineas
              (orden_id, producto_id, cantidad, precio_centavos, nota, linea_clave)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(ordenId, linea.producto_id, linea.cantidad, linea.precio_centavos, linea.nota, lineaClave).lastInsertRowid,
      );
      db.prepare(
        `UPDATE comanda_lineas
         SET pedido_linea_id = NULL, orden_linea_id = ?
         WHERE id = ?`,
      ).run(ordenLineaId, linea.comanda_linea_id);
      if (linea.estado.startsWith("anulada")) canceladas.push({ linea, ordenLineaId, lineaClave });

      if (!linea.estado.startsWith("anulada")) {
        const firmado = consumoFirmado(db, pedido.id, comanda.creada_en, cfg);
        for (const componente of expandirProducto(db, linea.producto_id)) {
          const cantidad = componente.cantidadPorUnidad * linea.cantidad;
          db.prepare(
            `INSERT INTO orden_linea_inventario
              (orden_id, linea_clave, producto_id, cantidad_por_unidad, reservada_real, firmada_real)
             VALUES (?, ?, ?, ?, ?, ?)`,
          ).run(
            ordenId,
            lineaClave,
            componente.productoId,
            componente.cantidadPorUnidad,
            firmado ? 0 : cantidad,
            firmado ? cantidad : 0,
          );
        }
      }
      nLineas += 1;
    }
    db.prepare("UPDATE comandas SET pedido_id = NULL, orden_id = ?, tipo = 'orden' WHERE id = ?").run(ordenId, comanda.id);

    if (canceladas.length > 0) {
      const correccionId = Number(
        db
          .prepare(
            `INSERT INTO orden_correcciones
              (orden_id, numero_version, motivo, indicaciones, es_anulacion,
               creada_por_empleado_id, creada_en, clave_idempotencia)
             VALUES (?, 1, ?, NULL, ?, ?, ?, ?)`,
          )
          .run(
            ordenId,
            "Migración de anulación legacy",
            todasAnuladas ? 1 : 0,
            comanda.mesero_id,
            comanda.creada_en,
            `migracion-anulacion-pedido-${pedido.id}-envio-${comanda.envio_n}`,
          ).lastInsertRowid,
      );
      for (const c of canceladas) {
        db.prepare(
          `INSERT INTO orden_correccion_lineas
            (correccion_id, orden_linea_id, producto_id, cantidad_anterior, cantidad_nueva,
             nota_anterior, nota_nueva, linea_clave, precio_centavos)
           VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        ).run(
          correccionId,
          c.ordenLineaId,
          c.linea.producto_id,
          c.linea.cantidad,
          c.linea.nota,
          c.linea.nota,
          c.lineaClave,
          c.linea.precio_centavos,
        );
      }
    }
    nOrdenes += 1;
  }

  const sinComanda = todas.filter((l) => l.estado !== "nueva" && !migradas.has(l.id));
  if (sinComanda.length > 0) {
    throw new MigracionError(`Pedido ${pedido.id} tiene líneas enviadas sin comanda: ${sinComanda.map((l) => l.id).join(", ")}`);
  }

  const legacyTotal = todas
    .filter((l) => migradas.has(l.id) && !l.estado.startsWith("anulada"))
    .reduce((suma, l) => suma + l.cantidad * l.precio_centavos, 0);
  const nuevoTotal = totalEfectivoCuenta(db, cuentaId);
  if (legacyTotal !== nuevoTotal) {
    throw new MigracionError(`Total distinto en pedido ${pedido.id}: legacy=${legacyTotal}, cuenta=${nuevoTotal}`);
  }

  const precuentas = db
    .prepare("SELECT id, vigente, mesero_id, snapshot_json FROM precuentas WHERE pedido_id = ? ORDER BY numero")
    .all(pedido.id) as { id: number; vigente: number; mesero_id: number; snapshot_json: string }[];
  const snapshotActual = snapshotCuenta(db, cuentaId);
  for (const precuenta of precuentas) {
    const usarSnapshotCuenta =
      precuenta.vigente === 1 && (pedido.estado === "precuenta_emitida" || pedido.estado === "en_caja");
    let snapshot = precuenta.snapshot_json;
    if (usarSnapshotCuenta) {
      const anterior = JSON.parse(precuenta.snapshot_json) as { mesero?: string; leyenda?: string };
      snapshot = JSON.stringify({
        ...snapshotActual,
        mesero: anterior.mesero ?? pedido.mesero ?? "",
        leyenda: anterior.leyenda ?? "Documento de consumo. El cobro ocurre en caja.",
      });
    }
    db.prepare("UPDATE precuentas SET pedido_id = NULL, cuenta_id = ?, snapshot_json = ? WHERE id = ?").run(
      cuentaId,
      snapshot,
      precuenta.id,
    );
  }
  db.prepare("UPDATE caja_handoffs SET pedido_id = NULL, cuenta_id = ? WHERE pedido_id = ?").run(cuentaId, pedido.id);

  return { cuentaId, ordenes: nOrdenes, lineas: nLineas };
}

export function migrarPedidosACuentas(
  db: Database.Database,
  exportDir: string,
  cfg: AppConfig = defaultConfig(),
): ResultadoMigracion {
  const resultado: ResultadoMigracion = { cuentas: 0, ordenes: 0, lineas: 0, borradoresExportados: 0, errores: [] };
  const pedidos = pedidosPendientes(db);
  if (pedidos.length === 0) return resultado;

  try {
    resultado.borradoresExportados = exportarBorradores(db, exportDir, pedidos);
  } catch (err) {
    resultado.errores.push(`No se pudieron exportar borradores: ${err instanceof Error ? err.message : String(err)}`);
    return resultado;
  }

  try {
    const conteoComandasAntes = (
      db.prepare("SELECT count(*) AS n FROM comanda_lineas").get() as { n: number }
    ).n;
    const activasAntes = (
      db.prepare("SELECT count(*) AS n FROM cuentas WHERE estado IN ('abierta', 'precuenta_emitida')").get() as {
        n: number;
      }
    ).n;
    const activasEsperadas = pedidos.filter(
      (p) =>
        p.mesa_id != null &&
        (p.estado === "borrador" || p.estado === "enviado" || p.estado === "precuenta_emitida") &&
        Boolean(db.prepare("SELECT 1 FROM comandas WHERE pedido_id = ? LIMIT 1").get(p.id)),
    ).length;
    const migrar = db.transaction(() => {
      for (const pedido of pedidos) {
        const lineas = lineasPedido(db, pedido.id);
        const tieneComanda = Boolean(db.prepare("SELECT 1 FROM comandas WHERE pedido_id = ? LIMIT 1").get(pedido.id));
        if (pedido.mesa_id == null) {
          if (tieneComanda || lineas.some((l) => l.estado !== "nueva")) {
            throw new MigracionError(`Pedido ${pedido.id} enviado sin mesa: requiere corrección manual`);
          }
          continue;
        }
        // Un pedido que nunca salió a cocina era solo un borrador legacy. Ya se
        // exportó a JSON; convertirlo en una cuenta vacía volvería a ocupar la
        // mesa, justo lo que el modelo nuevo evita.
        if (!tieneComanda && lineas.every((l) => l.estado === "nueva")) continue;
        const uno = migrarUno(db, pedido, cfg);
        resultado.cuentas += 1;
        resultado.ordenes += uno.ordenes;
        resultado.lineas += uno.lineas;
      }
      const activasCreadas = (
        db
          .prepare("SELECT count(*) AS n FROM cuentas WHERE estado IN ('abierta', 'precuenta_emitida')")
          .get() as { n: number }
      ).n;
      if (activasCreadas !== activasAntes + activasEsperadas) {
        throw new MigracionError(
          `Cambió el número de mesas activas: antes=${activasAntes}, esperadas=${activasEsperadas}, después=${activasCreadas}`,
        );
      }
      const conteoComandasDespues = (
        db.prepare("SELECT count(*) AS n FROM comanda_lineas").get() as { n: number }
      ).n;
      if (conteoComandasAntes !== conteoComandasDespues) {
        throw new MigracionError(
          `Cambió el número de líneas de comanda: ${conteoComandasAntes} → ${conteoComandasDespues}`,
        );
      }
      const fk = db.prepare("PRAGMA foreign_key_check").all() as unknown[];
      if (fk.length > 0) throw new MigracionError(`La conversión dejó ${fk.length} referencias inválidas`);
    });
    migrar();
  } catch (err) {
    resultado.cuentas = 0;
    resultado.ordenes = 0;
    resultado.lineas = 0;
    resultado.errores.push(err instanceof Error ? err.message : String(err));
  }
  return resultado;
}
