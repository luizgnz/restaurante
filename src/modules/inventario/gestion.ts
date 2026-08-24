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
};

type MaterialFila = {
  id: number;
  nombre: string;
  codigo: string | null;
  on_hand_real: number;
  reserved_real: number;
  ultima_entrada_en: string | null;
};

function materialDeFila(fila: MaterialFila): MaterialInventario {
  return {
    id: fila.id,
    nombre: fila.nombre,
    codigo: fila.codigo,
    enMano: fila.on_hand_real,
    reservado: fila.reserved_real,
    disponible: available(fila.on_hand_real, fila.reserved_real),
    ultimaEntradaEn: fila.ultima_entrada_en,
  };
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
    ) AS ultima_entrada_en
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
        `SELECT p.id, s.on_hand_real
         FROM productos p
         JOIN stock s ON s.producto_id = p.id
         WHERE p.id = ? AND p.activo = 1`,
      )
      .get(input.productoId) as { id: number; on_hand_real: number } | undefined;
    if (!anterior) throw new InventarioError("material_inexistente", "El material no existe o no controla inventario");

    const nuevo = anterior.on_hand_real + input.cantidad;
    db.prepare("UPDATE stock SET on_hand_real = ? WHERE producto_id = ?").run(nuevo, input.productoId);
    const movimientoId = Number(
      db
        .prepare(
          `INSERT INTO inventario_movimientos
            (producto_id, tipo, cantidad_real, stock_anterior_real, stock_nuevo_real, empleado_id, creado_en)
           VALUES (?, 'entrada', ?, ?, ?, ?, ?)`,
        )
        .run(input.productoId, input.cantidad, anterior.on_hand_real, nuevo, empleado.id, new Date().toISOString())
        .lastInsertRowid,
    );
    const fila = db.prepare(`${SELECT_MATERIAL} AND p.id = ?`).get(input.productoId) as MaterialFila;
    return { material: materialDeFila(fila), movimientoId };
  })();
}
