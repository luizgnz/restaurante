import type Database from "better-sqlite3";
import { available, availableToAssemble } from "../inventario/cifras.ts";

export function armableDeProducto(db: Database.Database, productoId: number): number {
  const receta = db
    .prepare("SELECT ingrediente_id, cantidad_real FROM receta_lineas WHERE producto_id = ?")
    .all(productoId) as { ingrediente_id: number; cantidad_real: number }[];
  if (receta.length === 0) return Number.POSITIVE_INFINITY;
  const componentes = receta.map((r) => {
    const stock = db
      .prepare("SELECT on_hand_real, reserved_real FROM stock WHERE producto_id = ?")
      .get(r.ingrediente_id) as { on_hand_real: number; reserved_real: number } | undefined;
    const onHand = stock?.on_hand_real ?? 0;
    const reserved = stock?.reserved_real ?? 0;
    return { cantidadReceta: r.cantidad_real, disponible: available(onHand, reserved) };
  });
  return availableToAssemble(componentes);
}
