import type Database from "better-sqlite3";
import type { PoliticaInventario } from "../../config.ts";

export type LineaConsumo = { productoId: number; cantidad: number };

type Componente = { productoId: number; cantidad: number };

function expandir(db: Database.Database, lineas: LineaConsumo[]): Componente[] {
  const out: Componente[] = [];
  for (const linea of lineas) {
    const producto = db.prepare("SELECT tipo_consumo FROM productos WHERE id = ?").get(linea.productoId) as {
      tipo_consumo: string;
    };
    if (producto.tipo_consumo === "receta_kit") {
      const receta = db
        .prepare("SELECT ingrediente_id, cantidad_real FROM receta_lineas WHERE producto_id = ?")
        .all(linea.productoId) as { ingrediente_id: number; cantidad_real: number }[];
      for (const r of receta) {
        out.push({ productoId: r.ingrediente_id, cantidad: r.cantidad_real * linea.cantidad });
      }
    } else if (producto.tipo_consumo === "almacenable_unitario") {
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

export function reservarPorEnvio(
  db: Database.Database,
  lineas: LineaConsumo[],
  politica: PoliticaInventario,
): void {
  const run = db.transaction(() => {
    for (const c of expandir(db, lineas)) {
      if (politica === "descuento_al_enviar") {
        ajustar(db, c.productoId, -c.cantidad, 0);
      } else {
        ajustar(db, c.productoId, 0, c.cantidad);
      }
    }
  });
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
