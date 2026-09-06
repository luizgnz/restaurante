import type Database from "better-sqlite3";
import type { AppConfig, PoliticaInventario } from "../../config.ts";

export type LineaConsumo = { productoId: number; cantidad: number };

type Componente = { productoId: number; cantidad: number };

function expandir(db: Database.Database, lineas: LineaConsumo[]): Componente[] {
  const out: Componente[] = [];
  for (const linea of lineas) {
    const producto = db.prepare("SELECT tipo_consumo, rastrear_inventario FROM productos WHERE id = ?").get(linea.productoId) as {
      tipo_consumo: string;
      rastrear_inventario?: number;
    };
    if (producto.tipo_consumo === "receta_kit") {
      const receta = db
        .prepare("SELECT ingrediente_id, cantidad_real FROM receta_lineas WHERE producto_id = ?")
        .all(linea.productoId) as { ingrediente_id: number; cantidad_real: number }[];
      for (const r of receta) {
        out.push({ productoId: r.ingrediente_id, cantidad: r.cantidad_real * linea.cantidad });
      }
    } else if (producto.tipo_consumo === "almacenable_unitario" || producto.rastrear_inventario) {
      out.push({ productoId: linea.productoId, cantidad: linea.cantidad });
    }
  }
  return out;
}

function ajustar(
  db: Database.Database,
  productoId: number,
  dOnHand: number,
  dReserved: number,
): void {
  db.prepare(
    "INSERT INTO stock (producto_id, on_hand_real, reserved_real) VALUES (?, 0, 0) ON CONFLICT(producto_id) DO NOTHING",
  ).run(productoId);
  db.prepare("UPDATE stock SET on_hand_real = on_hand_real + ?, reserved_real = reserved_real + ? WHERE producto_id = ?").run(
    dOnHand,
    dReserved,
    productoId,
  );
}

export function aplicarReserva(
  db: Database.Database,
  lineas: LineaConsumo[],
  politica: PoliticaInventario,
): void {
  for (const c of expandir(db, lineas)) {
    if (politica === "descuento_al_enviar") {
      ajustar(db, c.productoId, -c.cantidad, 0);
    } else {
      ajustar(db, c.productoId, 0, c.cantidad);
    }
  }
}

export function reservarPorEnvio(
  db: Database.Database,
  lineas: LineaConsumo[],
  politica: PoliticaInventario,
): void {
  const run = db.transaction(() => aplicarReserva(db, lineas, politica));
  run();
}

export function firmar(
  db: Database.Database,
  lineas: LineaConsumo[],
  momento: "enviar" | "precuenta" | "caja",
  politica: PoliticaInventario,
): void {
  const debeFirmar =
    (politica === "reserva_al_enviar_firme_al_enviar_caja" && momento === "caja") ||
    (politica === "reserva_al_enviar_firme_al_precuenta" && momento === "precuenta") ||
    (politica === "descuento_al_enviar" && momento === "enviar");
  if (!debeFirmar) return;
  if (politica === "descuento_al_enviar") return;
  const run = db.transaction(() => {
    for (const c of expandir(db, lineas)) {
      ajustar(db, c.productoId, -c.cantidad, -c.cantidad);
    }
  });
  run();
}

export function liberarReserva(db: Database.Database, lineas: LineaConsumo[]): void {
  const run = db.transaction(() => {
    for (const c of expandir(db, lineas)) {
      ajustar(db, c.productoId, 0, -c.cantidad);
    }
  });
  run();
}

// ---------------------------------------------------------------------------
// Libro de inventario por línea de orden (modelo Cuenta → Órdenes).
//
// Todo lo de acá arriba sigue sirviendo al flujo legacy de `pedidos`, que mueve
// stock sin saber a qué línea pertenece. El modelo nuevo registra por línea
// cuánto sigue reservado y cuánto ya se firmó, para no tener que deducir la
// firmeza del estado de la cuenta.
// ---------------------------------------------------------------------------

export class InventarioError extends Error {
  codigo: string;
  constructor(codigo: string, message: string) {
    super(message);
    this.name = "InventarioError";
    this.codigo = codigo;
  }
}

export type LineaOrdenConsumo = { lineaClave: string; productoId: number; cantidad: number };
export type CambioOrdenConsumo = {
  lineaClave: string;
  productoId: number;
  delta: number;
  /**
   * `true` solo si esta corrección **crea** la línea. Es la única situación en la
   * que se expande la receta vigente: una línea que ya existía se mueve con las
   * proporciones que el libro registró al enviarla.
   */
  esNueva: boolean;
};
export type PendienteDeFirmar = {
  ordenId: number;
  lineaClave: string;
  productoId: number;
  cantidad: number;
};

type ComponenteDeLinea = {
  productoId: number;
  cantidadPorUnidad: number;
  reservada: number;
  firmada: number;
};

/** Componentes que consume **una** unidad del producto, agregados por insumo. */
function componentesPorUnidad(db: Database.Database, productoId: number): Componente[] {
  const porProducto = new Map<number, number>();
  for (const c of expandir(db, [{ productoId, cantidad: 1 }])) {
    porProducto.set(c.productoId, (porProducto.get(c.productoId) ?? 0) + c.cantidad);
  }
  return [...porProducto].map(([id, cantidad]) => ({ productoId: id, cantidad }));
}

/** Lo que el libro registró para esa línea, con las proporciones del envío. */
function componentesDelLibro(
  db: Database.Database,
  ordenId: number,
  lineaClave: string,
): ComponenteDeLinea[] {
  return (
    db
      .prepare(
        `SELECT producto_id, cantidad_por_unidad, reservada_real, firmada_real
         FROM orden_linea_inventario
         WHERE orden_id = ? AND linea_clave = ?
         ORDER BY producto_id`,
      )
      .all(ordenId, lineaClave) as {
      producto_id: number;
      cantidad_por_unidad: number;
      reservada_real: number;
      firmada_real: number;
    }[]
  ).map((f) => ({
    productoId: f.producto_id,
    cantidadPorUnidad: f.cantidad_por_unidad,
    reservada: f.reservada_real,
    firmada: f.firmada_real,
  }));
}

function anotarLibro(
  db: Database.Database,
  ordenId: number,
  lineaClave: string,
  productoId: number,
  cantidadPorUnidad: number,
  dReservada: number,
  dFirmada: number,
): void {
  db.prepare(
    `INSERT INTO orden_linea_inventario
      (orden_id, linea_clave, producto_id, cantidad_por_unidad, reservada_real, firmada_real)
      VALUES (?, ?, ?, ?, 0, 0)
      ON CONFLICT(orden_id, linea_clave, producto_id) DO NOTHING`,
  ).run(ordenId, lineaClave, productoId, cantidadPorUnidad);
  db.prepare(
    `UPDATE orden_linea_inventario
     SET reservada_real = reservada_real + ?, firmada_real = firmada_real + ?
     WHERE orden_id = ? AND linea_clave = ? AND producto_id = ?`,
  ).run(dReservada, dFirmada, ordenId, lineaClave, productoId);
}

/**
 * Registra el consumo de una orden recién enviada. `descuento_al_enviar` firma
 * en el acto; las políticas de reserva dejan la cantidad reservada esperando a
 * que Task 6 la firme.
 */
export function registrarConsumoDeOrden(
  db: Database.Database,
  ordenId: number,
  lineas: LineaOrdenConsumo[],
  politica: PoliticaInventario,
): void {
  const firmaAlEnviar = politica === "descuento_al_enviar";
  for (const linea of lineas) {
    if (linea.cantidad <= 0) continue;
    for (const c of componentesPorUnidad(db, linea.productoId)) {
      const total = c.cantidad * linea.cantidad;
      if (total === 0) continue;
      if (firmaAlEnviar) {
        ajustar(db, c.productoId, -total, 0);
        anotarLibro(db, ordenId, linea.lineaClave, c.productoId, c.cantidad, 0, total);
      } else {
        ajustar(db, c.productoId, 0, total);
        anotarLibro(db, ordenId, linea.lineaClave, c.productoId, c.cantidad, total, 0);
      }
    }
  }
}

/**
 * ¿Esta línea necesita renglones en el libro y no los tiene?
 *
 * Un producto sin inventario rastreado no expande a nada, así que la ausencia
 * de renglones es su estado normal. Una línea que sí consume insumos y no tiene
 * renglones es trazabilidad perdida: mover stock a ciegas dejaría la reserva
 * previa colgada sin que nadie se enterara.
 */
function faltaTrazabilidad(db: Database.Database, ordenId: number, cambio: CambioOrdenConsumo): boolean {
  if (cambio.delta === 0 || cambio.esNueva) return false;
  if (componentesDelLibro(db, ordenId, cambio.lineaClave).length > 0) return false;
  return componentesPorUnidad(db, cambio.productoId).length > 0;
}

/** Las líneas de la corrección que consumen insumos y no tienen libro que las respalde. */
export function lineasSinTrazabilidad(
  db: Database.Database,
  ordenId: number,
  cambios: CambioOrdenConsumo[],
): CambioOrdenConsumo[] {
  return cambios.filter((c) => faltaTrazabilidad(db, ordenId, c));
}

function componentesDeLaLinea(
  db: Database.Database,
  ordenId: number,
  cambio: CambioOrdenConsumo,
): ComponenteDeLinea[] {
  const delLibro = componentesDelLibro(db, ordenId, cambio.lineaClave);
  // El libro manda: las proporciones son las del envío, no las de la carta de
  // hoy. Si la receta cambió después, la corrección devuelve exactamente lo que
  // se había apartado.
  if (delLibro.length > 0) return delLibro;
  if (faltaTrazabilidad(db, ordenId, cambio)) {
    throw new InventarioError(
      "inventario_sin_trazabilidad",
      `La línea ${cambio.lineaClave} consume insumos y no tiene libro de inventario`,
    );
  }
  if (!cambio.esNueva) return [];
  // Línea que nace en esta corrección: acá sí se expande la receta vigente, que
  // es la que se va a cocinar, y el libro queda con esas proporciones.
  return componentesPorUnidad(db, cambio.productoId).map((c) => ({
    productoId: c.productoId,
    cantidadPorUnidad: c.cantidad,
    reservada: 0,
    firmada: 0,
  }));
}

/**
 * Aplica el delta de una corrección contra el libro, no contra una suposición:
 *
 * - delta positivo: unidades nuevas. Con política de reserva entran reservadas
 *   aunque la línea ya tenga cantidad firmada, porque se firmarán en la próxima
 *   precuenta; con `descuento_al_enviar` se descuentan en el acto.
 * - delta negativo: primero devuelve lo reservado y solo después revierte lo ya
 *   firmado al `on_hand`. Nunca devuelve más de lo que el libro registra, así
 *   que no puede inventar stock ni dejar reserva negativa.
 */
export function ajustarConsumoDeCorreccion(
  db: Database.Database,
  ordenId: number,
  cambios: CambioOrdenConsumo[],
  politica: PoliticaInventario,
): void {
  const firmaAlEnviar = politica === "descuento_al_enviar";
  for (const cambio of cambios) {
    if (cambio.delta === 0) continue;
    for (const c of componentesDeLaLinea(db, ordenId, cambio)) {
      const movimiento = c.cantidadPorUnidad * Math.abs(cambio.delta);
      if (movimiento === 0) continue;
      if (cambio.delta > 0) {
        if (firmaAlEnviar) {
          ajustar(db, c.productoId, -movimiento, 0);
          anotarLibro(db, ordenId, cambio.lineaClave, c.productoId, c.cantidadPorUnidad, 0, movimiento);
        } else {
          ajustar(db, c.productoId, 0, movimiento);
          anotarLibro(db, ordenId, cambio.lineaClave, c.productoId, c.cantidadPorUnidad, movimiento, 0);
        }
        continue;
      }
      const deReserva = Math.min(c.reservada, movimiento);
      const deFirmado = Math.min(c.firmada, movimiento - deReserva);
      if (deReserva > 0) ajustar(db, c.productoId, 0, -deReserva);
      if (deFirmado > 0) ajustar(db, c.productoId, deFirmado, 0);
      if (deReserva > 0 || deFirmado > 0) {
        anotarLibro(db, ordenId, cambio.lineaClave, c.productoId, c.cantidadPorUnidad, -deReserva, -deFirmado);
      }
    }
  }
}

/**
 * Convierte la reserva pendiente de esas líneas en consumo firmado, **una sola
 * vez**: los insumos ya se usaron (el plato se preparó o se sirvió), así que el
 * stock sale ahora y el libro queda firmado, aunque la cuenta nunca llegue a
 * caja. Lo que ya estaba firmado no se toca.
 */
export function firmarReservasDeLineas(db: Database.Database, ordenId: number, lineaClaves: string[]): void {
  if (lineaClaves.length === 0) return;
  const run = db.transaction(() => {
    const filasStmt = db.prepare(
      `SELECT producto_id, reservada_real FROM orden_linea_inventario
       WHERE orden_id = ? AND linea_clave = ? AND reservada_real > 0`,
    );
    const updateStmt = db.prepare(
      `UPDATE orden_linea_inventario
       SET firmada_real = firmada_real + reservada_real, reservada_real = 0
       WHERE orden_id = ? AND linea_clave = ? AND producto_id = ?`,
    );
    for (const clave of lineaClaves) {
      const filas = filasStmt.all(ordenId, clave) as { producto_id: number; reservada_real: number }[];
      for (const f of filas) {
        ajustar(db, f.producto_id, -f.reservada_real, -f.reservada_real);
        updateStmt.run(ordenId, clave, f.producto_id);
      }
    }
  });
  run();
}

/**
 * Devuelve al stock **todo** el consumo que el libro registra para esas líneas:
 * libera lo reservado y revierte lo ya firmado al `on_hand`. Es el camino de la
 * reutilización: un plato anulado o una cuenta cancelada no consumió nada que
 * se pueda volver a la despensa. Deja el libro en cero para esas líneas.
 */
export function devolverConsumoDeLineas(db: Database.Database, ordenId: number, lineaClaves: string[]): void {
  if (lineaClaves.length === 0) return;
  const run = db.transaction(() => {
    for (const clave of lineaClaves) {
      for (const c of componentesDelLibro(db, ordenId, clave)) {
        if (c.reservada > 0) ajustar(db, c.productoId, 0, -c.reservada);
        if (c.firmada > 0) ajustar(db, c.productoId, c.firmada, 0);
        if (c.reservada > 0 || c.firmada > 0) {
          anotarLibro(db, ordenId, clave, c.productoId, c.cantidadPorUnidad, -c.reservada, -c.firmada);
        }
      }
    }
  });
  run();
}

/**
 * ¿Esta política firma la reserva en este momento del flujo? Es la pregunta que
 * decide **cuándo** firmar, y la responde el llamador (Task 6). Lo que se firma
 * no se deduce de acá: sale del libro.
 */
export function firmaReservaEn(politica: PoliticaInventario, momento: "precuenta" | "caja"): boolean {
  return (
    (politica === "reserva_al_enviar_firme_al_enviar_caja" && momento === "caja") ||
    (politica === "reserva_al_enviar_firme_al_precuenta" && momento === "precuenta")
  );
}

/** Lo que sigue reservado de esas órdenes, línea por línea y componente por componente. */
export function pendienteDeFirmar(db: Database.Database, ordenIds: number[]): PendienteDeFirmar[] {
  if (ordenIds.length === 0) return [];
  const marcas = ordenIds.map(() => "?").join(", ");
  return (
    db
      .prepare(
        `SELECT orden_id, linea_clave, producto_id, reservada_real FROM orden_linea_inventario
         WHERE orden_id IN (${marcas}) AND reservada_real > 0
         ORDER BY orden_id, linea_clave, producto_id`,
      )
      .all(...ordenIds) as {
      orden_id: number;
      linea_clave: string;
      producto_id: number;
      reservada_real: number;
    }[]
  ).map((f) => ({
    ordenId: f.orden_id,
    lineaClave: f.linea_clave,
    productoId: f.producto_id,
    cantidad: f.reservada_real,
  }));
}

/**
 * Firma **todo lo que el libro declara reservado**, sin mirar la configuración:
 * si esas unidades quedaron apartadas, se firman cuando el llamador lo pide. El
 * *cuándo* es de quien llama (Task 6, con `firmaReservaEn`); el *qué* es del
 * libro. Deducirlo de la política vigente dejaría reserva colgada para siempre
 * si la política cambia entre el envío y el cobro.
 *
 * Llamarla dos veces no descuenta dos veces: la segunda no encuentra pendiente.
 */
export function firmarReservadoDeOrdenes(db: Database.Database, ordenIds: number[]): void {
  const run = db.transaction(() => {
    for (const p of pendienteDeFirmar(db, ordenIds)) {
      ajustar(db, p.productoId, -p.cantidad, -p.cantidad);
      db.prepare(
        `UPDATE orden_linea_inventario
         SET firmada_real = firmada_real + reservada_real, reservada_real = 0
         WHERE orden_id = ? AND linea_clave = ? AND producto_id = ?`,
      ).run(p.ordenId, p.lineaClave, p.productoId);
    }
  });
  run();
}

/**
 * Igual que la anterior, para todas las órdenes de una cuenta. Incluye las
 * anuladas a propósito: una anulación deja sus renglones en cero, así que no
 * aportan nada, y excluirlas volvería inalcanzable cualquier reserva que hubiera
 * quedado ahí por un borde.
 */
export function firmarReservadoDeCuenta(db: Database.Database, cuentaId: number): void {
  const ordenes = db.prepare("SELECT id FROM ordenes WHERE cuenta_id = ? ORDER BY id").all(cuentaId) as {
    id: number;
  }[];
  firmarReservadoDeOrdenes(
    db,
    ordenes.map((o) => o.id),
  );
}

// ---------------------------------------------------------------------------
// Stock al vender, merma por anulación y liberación al cancelar.
// ---------------------------------------------------------------------------

export type FaltanteStock = { productoId: number; nombre: string; requerido: number; disponible: number };

/**
 * Aplica la política `bloqueo_sin_stock` a un consumo por venir. Con
 * `bloquear` lanza `stock_insuficiente` (409); con `avisar` devuelve los avisos
 * para que la respuesta se los lleve al mesero. No mueve stock: solo mira.
 */
export function controlarStock(
  db: Database.Database,
  cfg: Pick<AppConfig, "bloqueo_sin_stock">,
  lineas: LineaConsumo[],
): string[] {
  if (cfg.bloqueo_sin_stock === "permitir") return [];
  const faltantes = faltantesDeStock(db, lineas.filter((l) => l.cantidad > 0));
  if (faltantes.length === 0) return [];
  const detalle = faltantes.map(
    (f) => `${f.nombre}: pide ${f.requerido}, disponible ${Math.max(0, Math.round(f.disponible * 100) / 100)}`,
  );
  if (cfg.bloqueo_sin_stock === "bloquear") {
    throw new InventarioError("stock_insuficiente", `Sin stock suficiente — ${detalle.join("; ")}`);
  }
  return detalle.map((d) => `Stock bajo — ${d}`);
}

/**
 * Lo que faltaría para servir estas líneas, comparado contra lo disponible
 * (en mano menos lo reservado a otras mesas). Es una **pre-check**: usa la
 * receta vigente, no el libro, porque se corre antes de mover un solo gramo.
 * Solo considera productos con inventario rastreado; lo demás no expande.
 */
export function faltantesDeStock(db: Database.Database, lineas: LineaConsumo[]): FaltanteStock[] {
  const requeridos = new Map<number, number>();
  for (const c of expandir(db, lineas)) {
    requeridos.set(c.productoId, (requeridos.get(c.productoId) ?? 0) + c.cantidad);
  }
  const faltantes: FaltanteStock[] = [];
  for (const [productoId, requerido] of requeridos) {
    const fila = db
      .prepare(
        `SELECT p.nombre, COALESCE(s.on_hand_real, 0) AS on_hand, COALESCE(s.reserved_real, 0) AS reservado
         FROM productos p LEFT JOIN stock s ON s.producto_id = p.id
         WHERE p.id = ?`,
      )
      .get(productoId) as { nombre: string; on_hand: number; reservado: number } | undefined;
    if (!fila) continue;
    const disponible = fila.on_hand - fila.reservado;
    if (requerido > disponible + 1e-9) {
      faltantes.push({ productoId, nombre: fila.nombre, requerido, disponible });
    }
  }
  return faltantes;
}

export type MermaAnulacion = { lineaClave: string; productoId: number; unidades: number };

/**
 * Documenta la merma de los insumos que ya se cocinaron de una línea anulada.
 *
 * El stock **no se toca**: esas unidades salieron cuando se reservó/firmó el
 * envío y devolverlas sería inventario fantasma (el plato existe, ya no está en
 * la despensa). Lo que falta es el rastro: un movimiento de pérdida por
 * componente, con el motivo `anulacion_preparacion`, queda en el kardex.
 */
export function registrarMermaDeAnulacion(
  db: Database.Database,
  ordenId: number,
  mermas: MermaAnulacion[],
  empleadoId: number,
): void {
  for (const merma of mermas) {
    for (const c of componentesDelLibro(db, ordenId, merma.lineaClave)) {
      const cantidad = c.cantidadPorUnidad * merma.unidades;
      if (cantidad <= 0) continue;
      const stock = db
        .prepare("SELECT COALESCE(on_hand_real, 0) AS s FROM stock WHERE producto_id = ?")
        .get(c.productoId) as { s: number } | undefined;
      const onHand = stock?.s ?? 0;
      db
        .prepare(
          `INSERT INTO inventario_movimientos
            (producto_id, tipo, cantidad_real, stock_anterior_real, stock_nuevo_real, empleado_id, motivo, creado_en)
           VALUES (?, 'perdida', ?, ?, ?, ?, 'anulacion_preparacion', ?)`,
        )
        .run(c.productoId, cantidad, onHand, onHand, empleadoId, new Date().toISOString());
    }
  }
}

/**
 * Libera lo reservado de unas órdenes sin firmarlo: las unidades vuelven a estar
 * disponibles porque nunca se cocinaron. Es el destino del stock cuando se
 * cancela una cuenta con líneas que cocina no empezó.
 */
export function liberarReservasDeOrdenes(db: Database.Database, ordenIds: number[]): void {
  const run = db.transaction(() => {
    for (const p of pendienteDeFirmar(db, ordenIds)) {
      ajustar(db, p.productoId, 0, -p.cantidad);
      db
        .prepare(
          `UPDATE orden_linea_inventario
           SET reservada_real = MAX(reservada_real - ?, 0)
           WHERE orden_id = ? AND linea_clave = ? AND producto_id = ?`,
        )
        .run(p.cantidad, p.ordenId, p.lineaClave, p.productoId);
    }
  });
  run();
}
