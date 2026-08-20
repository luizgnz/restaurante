import type Database from "better-sqlite3";

export type SeedIds = {
  pan: number;
  carne: number;
  queso: number;
  lechuga: number;
  hamburguesa: number;
  jugo: number;
  agua: number;
  mesa7: number;
};

function insertProducto(
  db: Database.Database,
  nombre: string,
  precio: number,
  categoriaId: number | null,
  tipo: string,
  enPos: number,
): number {
  const info = db
    .prepare(
      "INSERT INTO productos (nombre, precio_centavos, categoria_id, tipo_consumo, disponible_en_pos, activo) VALUES (?, ?, ?, ?, ?, 1)",
    )
    .run(nombre, precio, categoriaId, tipo, enPos);
  return Number(info.lastInsertRowid);
}

function setStock(db: Database.Database, productoId: number, onHand: number): void {
  db.prepare("INSERT INTO stock (producto_id, on_hand_real, reserved_real) VALUES (?, ?, 0)").run(productoId, onHand);
}

export function seedCartaDemo(db: Database.Database): SeedIds {
  const comida = Number(
    db.prepare("INSERT INTO categorias_pos (nombre, estacion) VALUES (?, ?)").run("Principales", "cocina").lastInsertRowid,
  );
  const bebidas = Number(
    db.prepare("INSERT INTO categorias_pos (nombre, estacion) VALUES (?, ?)").run("Bebidas", "cocina").lastInsertRowid,
  );

  const pan = insertProducto(db, "Pan", 0, null, "almacenable_unitario", 0);
  const carne = insertProducto(db, "Carne g", 0, null, "almacenable_unitario", 0);
  const queso = insertProducto(db, "Queso", 0, null, "almacenable_unitario", 0);
  const lechuga = insertProducto(db, "Lechuga g", 0, null, "almacenable_unitario", 0);
  const hamburguesa = insertProducto(db, "Hamburguesa", 8900, comida, "receta_kit", 1);
  const jugo = insertProducto(db, "Jugo", 2500, bebidas, "almacenable_unitario", 1);
  const agua = insertProducto(db, "Agua con gas", 1500, bebidas, "almacenable_unitario", 1);

  const receta = db.prepare(
    "INSERT INTO receta_lineas (producto_id, ingrediente_id, cantidad_real) VALUES (?, ?, ?)",
  );
  receta.run(hamburguesa, pan, 1);
  receta.run(hamburguesa, carne, 150);
  receta.run(hamburguesa, queso, 1);
  receta.run(hamburguesa, lechuga, 20);

  setStock(db, pan, 20);
  setStock(db, carne, 2000);
  setStock(db, queso, 20);
  setStock(db, lechuga, 400);
  setStock(db, jugo, 10);
  setStock(db, agua, 10);

  const piso = Number(db.prepare("INSERT INTO pisos (nombre) VALUES (?)").run("Salón").lastInsertRowid);
  const mesa7 = asegurarPlanoDemo(db, piso);

  return { pan, carne, queso, lechuga, hamburguesa, jugo, agua, mesa7 };
}

const LAYOUT: { numero: number; asientos: number; x: number; y: number; forma: "square" | "round"; ancho: number; alto: number }[] = [
  { numero: 1, asientos: 2, x: 8, y: 12, forma: "round", ancho: 84, alto: 84 },
  { numero: 2, asientos: 4, x: 26, y: 12, forma: "square", ancho: 92, alto: 92 },
  { numero: 3, asientos: 4, x: 46, y: 12, forma: "square", ancho: 92, alto: 92 },
  { numero: 4, asientos: 2, x: 66, y: 12, forma: "round", ancho: 84, alto: 84 },
  { numero: 5, asientos: 6, x: 8, y: 42, forma: "square", ancho: 120, alto: 88 },
  { numero: 6, asientos: 4, x: 32, y: 42, forma: "square", ancho: 92, alto: 92 },
  { numero: 7, asientos: 4, x: 52, y: 42, forma: "round", ancho: 96, alto: 96 },
  { numero: 8, asientos: 4, x: 72, y: 42, forma: "square", ancho: 92, alto: 92 },
  { numero: 9, asientos: 2, x: 8, y: 72, forma: "round", ancho: 84, alto: 84 },
  { numero: 10, asientos: 8, x: 36, y: 72, forma: "square", ancho: 150, alto: 88 },
];

export function asegurarPlanoDemo(db: Database.Database, pisoId?: number): number {
  const piso =
    pisoId ??
    (db.prepare("SELECT id FROM pisos ORDER BY id LIMIT 1").get() as { id: number } | undefined)?.id;
  if (!piso) throw new Error("sin piso");
  const insert = db.prepare(
    "INSERT INTO mesas (piso_id, numero, asientos, activa, pos_x, pos_y, forma, ancho, alto) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)",
  );
  const update = db.prepare(
    "UPDATE mesas SET asientos = ?, pos_x = ?, pos_y = ?, forma = ?, ancho = ?, alto = ?, activa = 1 WHERE numero = ?",
  );
  let mesa7 = 0;
  for (const t of LAYOUT) {
    const existing = db.prepare("SELECT id FROM mesas WHERE numero = ?").get(t.numero) as { id: number } | undefined;
    if (existing) {
      update.run(t.asientos, t.x, t.y, t.forma, t.ancho, t.alto, t.numero);
      if (t.numero === 7) mesa7 = existing.id;
    } else {
      const id = Number(insert.run(piso, t.numero, t.asientos, t.x, t.y, t.forma, t.ancho, t.alto).lastInsertRowid);
      if (t.numero === 7) mesa7 = id;
    }
  }
  return mesa7;
}
