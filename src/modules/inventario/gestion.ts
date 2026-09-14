import type Database from "better-sqlite3";
import { exigirPin } from "../empleados/empleados.ts";
import { available } from "./cifras.ts";
import { InventarioError } from "./asientos.ts";

export type MaterialInventario = {
  id: number;
  nombre: string;
  codigo: string | null;
  enMano: number;
  reservado: number;
  disponible: number;
  ultimaEntradaEn: string | null;
  umbralPocoStock: number | null;
  unidadBase: UnidadBaseInventario;
  unidadInventario: UnidadInventario;
};

export type MotivoPerdidaInventario = "producto_danado" | "consumo_interno";
export type UnidadBaseInventario = "unidad" | "g" | "ml";
export type UnidadInventario = "unidad" | "g" | "kg" | "ml" | "l";

type MaterialFila = {
  id: number;
  nombre: string;
  codigo: string | null;
  on_hand_real: number;
  reserved_real: number;
  ultima_entrada_en: string | null;
  umbral_poco_stock: number | null;
  unidad_base: UnidadBaseInventario;
  unidad_inventario: UnidadInventario;
};

function materialDeFila(fila: MaterialFila): MaterialInventario {
  const factor = factorUnidad(fila.unidad_base, fila.unidad_inventario);
  return {
    id: fila.id,
    nombre: fila.nombre,
    codigo: fila.codigo,
    enMano: fila.on_hand_real / factor,
    reservado: fila.reserved_real / factor,
    disponible: available(fila.on_hand_real, fila.reserved_real) / factor,
    ultimaEntradaEn: fila.ultima_entrada_en,
    umbralPocoStock: fila.umbral_poco_stock == null ? null : fila.umbral_poco_stock / factor,
    unidadBase: fila.unidad_base,
    unidadInventario: fila.unidad_inventario,
  };
}

function factorUnidad(base: UnidadBaseInventario, inventario: UnidadInventario): number {
  if (base === "unidad" && inventario === "unidad") return 1;
  if (base === "g" && inventario === "g") return 1;
  if (base === "g" && inventario === "kg") return 1000;
  if (base === "ml" && inventario === "ml") return 1;
  if (base === "ml" && inventario === "l") return 1000;
  throw new InventarioError("unidad_invalida", "La unidad no es compatible con este material");
}

const SELECT_MATERIAL = `
  SELECT
    p.id,
    p.nombre,
    p.codigo,
    s.on_hand_real,
    s.reserved_real,
    (
      SELECT max(m.creado_en)
      FROM inventario_movimientos m
      WHERE m.producto_id = p.id AND m.tipo = 'entrada'
    ) AS ultima_entrada_en,
    p.umbral_poco_stock,
    p.unidad_base,
    p.unidad_inventario
  FROM productos p
  JOIN stock s ON s.producto_id = p.id
  WHERE p.activo = 1
`;

export function listarInventario(db: Database.Database): MaterialInventario[] {
  const filas = db.prepare(`${SELECT_MATERIAL} ORDER BY lower(p.nombre), p.id`).all() as MaterialFila[];
  return filas.map(materialDeFila);
}

export async function registrarEntradaInventario(
  db: Database.Database,
  input: { productoId: number; cantidad: number; pin: string },
): Promise<{ material: MaterialInventario; movimientoId: number }> {
  if (!Number.isFinite(input.cantidad) || input.cantidad <= 0 || input.cantidad > 1_000_000) {
    throw new InventarioError("cantidad_invalida", "La cantidad debe ser mayor que cero");
  }

  const empleado = await exigirPin(db, input.pin, "inventario");
  return db.transaction(() => {
    const anterior = db
      .prepare(
        `SELECT p.id, s.on_hand_real, p.unidad_base, p.unidad_inventario
         FROM productos p
         JOIN stock s ON s.producto_id = p.id
         WHERE p.id = ? AND p.activo = 1`,
      )
      .get(input.productoId) as { id: number; on_hand_real: number; unidad_base: UnidadBaseInventario; unidad_inventario: UnidadInventario } | undefined;
    if (!anterior) throw new InventarioError("material_inexistente", "El material no existe o no controla inventario");

    const cantidadBase = input.cantidad * factorUnidad(anterior.unidad_base, anterior.unidad_inventario);
    if (cantidadBase > 1_000_000) throw new InventarioError("cantidad_invalida", "La cantidad es demasiado alta");
    const nuevo = anterior.on_hand_real + cantidadBase;
    db.prepare("UPDATE stock SET on_hand_real = ? WHERE producto_id = ?").run(nuevo, input.productoId);
    const movimientoId = Number(
      db
        .prepare(
          `INSERT INTO inventario_movimientos
            (producto_id, tipo, cantidad_real, stock_anterior_real, stock_nuevo_real, empleado_id, creado_en)
           VALUES (?, 'entrada', ?, ?, ?, ?, ?)`,
        )
        .run(input.productoId, cantidadBase, anterior.on_hand_real, nuevo, empleado.id, new Date().toISOString())
        .lastInsertRowid,
    );
    const fila = db.prepare(`${SELECT_MATERIAL} AND p.id = ?`).get(input.productoId) as MaterialFila;
    return { material: materialDeFila(fila), movimientoId };
  })();
}

export async function configurarUmbralPocoStock(
  db: Database.Database,
  input: { productoId: number; umbral: number | null; pin: string },
): Promise<{ material: MaterialInventario }> {
  if (input.umbral !== null && (!Number.isInteger(input.umbral) || input.umbral < 0 || input.umbral > 1_000_000)) {
    throw new InventarioError("umbral_invalido", "El umbral debe ser un número entero entre 0 y 1.000.000");
  }
  await exigirPin(db, input.pin, "inventario");
  const unidad = db.prepare(`SELECT unidad_base, unidad_inventario FROM productos
    WHERE id = ? AND activo = 1 AND EXISTS (SELECT 1 FROM stock WHERE producto_id = productos.id)`).get(input.productoId) as
    | { unidad_base: UnidadBaseInventario; unidad_inventario: UnidadInventario }
    | undefined;
  if (!unidad) throw new InventarioError("material_inexistente", "El material no existe o no controla inventario");
  const umbralBase = input.umbral == null ? null : input.umbral * factorUnidad(unidad.unidad_base, unidad.unidad_inventario);
  const resultado = db.prepare(`UPDATE productos SET umbral_poco_stock = ?
    WHERE id = ? AND activo = 1 AND EXISTS (SELECT 1 FROM stock WHERE producto_id = productos.id)`)
    .run(umbralBase, input.productoId);
  if (resultado.changes !== 1) {
    throw new InventarioError("material_inexistente", "El material no existe o no controla inventario");
  }
  const fila = db.prepare(`${SELECT_MATERIAL} AND p.id = ?`).get(input.productoId) as MaterialFila;
  return { material: materialDeFila(fila) };
}

export async function configurarUnidadInventario(
  db: Database.Database,
  input: { productoId: number; unidad: UnidadInventario; pin: string },
): Promise<{ material: MaterialInventario }> {
  await exigirPin(db, input.pin, "inventario");
  const actual = db.prepare(`SELECT unidad_base, umbral_poco_stock FROM productos
    WHERE id = ? AND activo = 1 AND EXISTS (SELECT 1 FROM stock WHERE producto_id = productos.id)`).get(input.productoId) as
    | { unidad_base: UnidadBaseInventario; umbral_poco_stock: number | null }
    | undefined;
  if (!actual) throw new InventarioError("material_inexistente", "El material no existe o no controla inventario");
  const factor = factorUnidad(actual.unidad_base, input.unidad);
  if (actual.umbral_poco_stock != null && actual.umbral_poco_stock % factor !== 0) {
    throw new InventarioError("umbral_incompatible", "Cambia o elimina el umbral individual antes de usar esa unidad");
  }
  db.prepare("UPDATE productos SET unidad_inventario = ? WHERE id = ?").run(input.unidad, input.productoId);
  const fila = db.prepare(`${SELECT_MATERIAL} AND p.id = ?`).get(input.productoId) as MaterialFila;
  return { material: materialDeFila(fila) };
}

export async function registrarPerdidaInventario(
  db: Database.Database,
  input: { productoId: number; cantidad: number; motivo: MotivoPerdidaInventario; pin: string },
): Promise<{ material: MaterialInventario; movimientoId: number }> {
  if (!Number.isFinite(input.cantidad) || input.cantidad <= 0 || input.cantidad > 1_000_000) {
    throw new InventarioError("cantidad_invalida", "La cantidad debe ser mayor que cero");
  }
  if (input.motivo !== "producto_danado" && input.motivo !== "consumo_interno") {
    throw new InventarioError("motivo_invalido", "Selecciona un motivo válido para la pérdida");
  }

  const empleado = await exigirPin(db, input.pin, "inventario");
  return db.transaction(() => {
    const anterior = db
      .prepare(
        `SELECT p.id, s.on_hand_real, p.unidad_base, p.unidad_inventario
         FROM productos p
         JOIN stock s ON s.producto_id = p.id
         WHERE p.id = ? AND p.activo = 1`,
      )
      .get(input.productoId) as { id: number; on_hand_real: number; unidad_base: UnidadBaseInventario; unidad_inventario: UnidadInventario } | undefined;
    if (!anterior) throw new InventarioError("material_inexistente", "El material no existe o no controla inventario");
    const cantidadBase = input.cantidad * factorUnidad(anterior.unidad_base, anterior.unidad_inventario);
    if (cantidadBase > 1_000_000) throw new InventarioError("cantidad_invalida", "La cantidad es demasiado alta");
    if (cantidadBase > anterior.on_hand_real) {
      throw new InventarioError("stock_insuficiente", "La pérdida no puede superar la existencia en mano");
    }

    const nuevo = anterior.on_hand_real - cantidadBase;
    db.prepare("UPDATE stock SET on_hand_real = ? WHERE producto_id = ?").run(nuevo, input.productoId);
    const movimientoId = Number(
      db
        .prepare(
          `INSERT INTO inventario_movimientos
            (producto_id, tipo, cantidad_real, stock_anterior_real, stock_nuevo_real, empleado_id, motivo, creado_en)
           VALUES (?, 'perdida', ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.productoId,
          cantidadBase,
          anterior.on_hand_real,
          nuevo,
          empleado.id,
          input.motivo,
          new Date().toISOString(),
        ).lastInsertRowid,
    );
    const fila = db.prepare(`${SELECT_MATERIAL} AND p.id = ?`).get(input.productoId) as MaterialFila;
    return { material: materialDeFila(fila), movimientoId };
  })();
}
