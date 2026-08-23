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
  menuDia: number;
  extra: number;
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
  const menuDia = (db.prepare("SELECT id FROM productos WHERE nombre = 'Menú del día'").get() as { id: number }).id;
  const extra = (db.prepare("SELECT id FROM productos WHERE lower(nombre) = 'extra'").get() as { id: number }).id;

  return { pan, carne, queso, lechuga, hamburguesa, jugo, agua, menuDia, extra, mesa7 };
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
    { nombre: "Menú del día", precio: 8900, categoria: principales, letra: "M", color: "#9b5d32" },
    { nombre: "Extra", precio: 0, categoria: principales, letra: "+", color: "#6f4a8e" },
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
  asegurarContornosDemo(db);
}

/** Agrega el ejemplo sin reemplazar configuraciones que el administrador ya haya guardado. */
export function asegurarContornosDemo(db: Database.Database): void {
  function grupo(nombre: string): number {
    const existente = db.prepare("SELECT id FROM contorno_grupos WHERE lower(nombre) = lower(?)").get(nombre) as
      | { id: number }
      | undefined;
    if (existente) return existente.id;
    return Number(db.prepare("INSERT INTO contorno_grupos (nombre) VALUES (?)").run(nombre).lastInsertRowid);
  }

  function variante(
    grupoId: number,
    nombre: string,
    suplementoCentavos: number,
    extraCentavos: number,
  ): number {
    const existente = db
      .prepare("SELECT id FROM contorno_variantes WHERE grupo_id = ? AND lower(nombre) = lower(?)")
      .get(grupoId, nombre) as { id: number } | undefined;
    if (existente) return existente.id;
    return Number(
      db
        .prepare(
          "INSERT INTO contorno_variantes (grupo_id, nombre, suplemento_centavos, extra_centavos, activo) VALUES (?, ?, ?, ?, 1)",
        )
        .run(grupoId, nombre, suplementoCentavos, extraCentavos).lastInsertRowid,
    );
  }

  function producto(nombre: string): number | null {
    return (db.prepare("SELECT id FROM productos WHERE lower(nombre) = lower(?)").get(nombre) as { id: number } | undefined)?.id ?? null;
  }

  function configurarSiVacio(
    productoId: number | null,
    slots: Array<{ posicion: number; nombre: string; permiteExtra: boolean; grupoIds: number[] }>,
  ) {
    if (!productoId) return;
    const cantidad = db.prepare("SELECT count(*) AS c FROM plato_slots WHERE producto_id = ?").get(productoId) as { c: number };
    if (cantidad.c > 0) return;
    const insertSlot = db.prepare(
      "INSERT INTO plato_slots (producto_id, posicion, nombre, permite_extra) VALUES (?, ?, ?, ?)",
    );
    const insertGrupo = db.prepare("INSERT INTO plato_slot_grupos (slot_id, grupo_id) VALUES (?, ?)");
    for (const slot of slots) {
      const slotId = Number(
        insertSlot.run(productoId, slot.posicion, slot.nombre, slot.permiteExtra ? 1 : 0).lastInsertRowid,
      );
      for (const grupoId of slot.grupoIds) insertGrupo.run(slotId, grupoId);
    }
  }

  db.transaction(() => {
    const proteina = grupo("Proteína");
    const carbohidrato = grupo("Carbohidrato");
    const ensalada = grupo("Ensalada");
    const tipoExtra = grupo("Tipo de extra");

    variante(proteina, "Pollo", 0, 1500);
    variante(proteina, "Carne", 500, 2000);
    variante(proteina, "Longaniza", 300, 1800);
    variante(carbohidrato, "Papas fritas", 0, 1000);
    variante(carbohidrato, "Arroz", 0, 800);
    variante(carbohidrato, "Puré", 0, 800);
    variante(ensalada, "Ensalada rusa", 0, 700);
    variante(ensalada, "Ensalada rallada", 0, 700);
    variante(tipoExtra, "Pollo", 1500, 0);
    variante(tipoExtra, "Carne", 2000, 0);
    variante(tipoExtra, "Longaniza", 1800, 0);

    configurarSiVacio(producto("Menú del día"), [
      { posicion: 1, nombre: "Proteína", permiteExtra: true, grupoIds: [proteina] },
      { posicion: 2, nombre: "Contorno", permiteExtra: false, grupoIds: [carbohidrato] },
      { posicion: 3, nombre: "Segundo contorno", permiteExtra: true, grupoIds: [carbohidrato, ensalada] },
    ]);
    configurarSiVacio(producto("Extra"), [
      { posicion: 1, nombre: "Tipo de extra", permiteExtra: false, grupoIds: [tipoExtra] },
    ]);
  })();
}
