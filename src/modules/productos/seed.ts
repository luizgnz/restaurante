import type Database from "better-sqlite3";
import { ordenarMesas } from "../salon/orden.ts";

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
    db.prepare("INSERT INTO categorias_pos (nombre, estacion) VALUES (?, ?)").run("Comida", "cocina").lastInsertRowid,
  );
  const bebidas = Number(
    db.prepare("INSERT INTO categorias_pos (nombre, estacion) VALUES (?, ?)").run("Bebida", "cocina").lastInsertRowid,
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
  asegurarProductosDemo(db);

  return { pan, carne, queso, lechuga, hamburguesa, jugo, agua, mesa7 };
}

const LAYOUT = ordenarMesas([
  { numero: 1, asientos: 2 },
  { numero: 2, asientos: 4 },
  { numero: 3, asientos: 4 },
  { numero: 4, asientos: 2 },
  { numero: 5, asientos: 6 },
  { numero: 6, asientos: 4 },
  { numero: 7, asientos: 4 },
  { numero: 8, asientos: 4 },
  { numero: 9, asientos: 2 },
  { numero: 10, asientos: 8 },
]);

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
      update.run(t.asientos, t.pos_x, t.pos_y, t.forma, t.ancho, t.alto, t.numero);
      if (t.numero === 7) mesa7 = existing.id;
    } else {
      const id = Number(insert.run(piso, t.numero, t.asientos, t.pos_x, t.pos_y, t.forma, t.ancho, t.alto).lastInsertRowid);
      if (t.numero === 7) mesa7 = id;
    }
  }
  return mesa7;
}

function fotoSvg(color: string, letra: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="20" fill="${color}"/><text x="64" y="78" text-anchor="middle" font-size="48" fill="#ffffff" font-family="sans-serif">${letra}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function asegurarProductosDemo(db: Database.Database): void {
  function categoria(nombre: string, estacion: string): number {
    const row = db.prepare("SELECT id FROM categorias_pos WHERE nombre = ?").get(nombre) as { id: number } | undefined;
    if (row) return row.id;
    return Number(db.prepare("INSERT INTO categorias_pos (nombre, estacion) VALUES (?, ?)").run(nombre, estacion).lastInsertRowid);
  }
  const principales = categoria("Comida", "cocina");
  const bebidas = categoria("Bebida", "cocina");
  const postres = categoria("Postres", "cocina");
  const carta = [
    { nombre: "Hamburguesa", precio: 8900, categoria: principales, letra: "H", color: "#8b4513" },
    { nombre: "Completo", precio: 4500, categoria: principales, letra: "C", color: "#c45c26" },
    { nombre: "Empanada", precio: 1800, categoria: principales, letra: "E", color: "#d4a017" },
    { nombre: "Papas fritas", precio: 2500, categoria: principales, letra: "P", color: "#e0a106" },
    { nombre: "Ensalada César", precio: 5200, categoria: principales, letra: "S", color: "#3d7a3d" },
    { nombre: "Pizza margarita", precio: 8900, categoria: principales, letra: "Z", color: "#b33c3c" },
    { nombre: "Sopa del día", precio: 3200, categoria: principales, letra: "O", color: "#b56b2a" },
    { nombre: "Jugo", precio: 2500, categoria: bebidas, letra: "J", color: "#e07a2f" },
    { nombre: "Agua con gas", precio: 1500, categoria: bebidas, letra: "A", color: "#3d8ea8" },
    { nombre: "Café", precio: 1800, categoria: bebidas, letra: "F", color: "#4a2c1a" },
    { nombre: "Cerveza", precio: 2800, categoria: bebidas, letra: "V", color: "#c9a227" },
    { nombre: "Flan", precio: 2200, categoria: postres, letra: "L", color: "#c48a3a" },
  ];
  const insert = db.prepare(
    "INSERT INTO productos (nombre, precio_centavos, categoria_id, tipo_consumo, disponible_en_pos, activo, color, foto_data, rastrear_inventario) VALUES (?, ?, ?, 'no_almacenable', 1, 1, ?, ?, 0)",
  );
  const update = db.prepare("UPDATE productos SET foto_data = ?, color = ?, disponible_en_pos = 1, activo = 1 WHERE id = ?");
  for (const p of carta) {
    const foto = fotoSvg(p.color, p.letra);
    const existing = db.prepare("SELECT id FROM productos WHERE nombre = ?").get(p.nombre) as { id: number } | undefined;
    if (existing) update.run(foto, p.color, existing.id);
    else insert.run(p.nombre, p.precio, p.categoria, p.color, foto);
  }
}
