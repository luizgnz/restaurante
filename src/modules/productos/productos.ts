import type Database from "better-sqlite3";
import { available, availableToAssemble } from "../inventario/cifras.ts";

export class ProductoError extends Error {
  codigo: string;
  constructor(codigo: string, message: string) {
    super(message);
    this.name = "ProductoError";
    this.codigo = codigo;
  }
}

const TIPOS = new Set(["no_almacenable", "almacenable_unitario", "receta_kit"]);

export function crearProducto(
  db: Database.Database,
  input: {
    nombre: string;
    precio_centavos: number;
    categoria_id: number | null;
    tipo_consumo: string;
    disponible_en_pos: boolean;
    rastrear_inventario?: boolean;
    codigo?: string | null;
    color?: string | null;
    foto_data?: string | null;
  },
): { id: number } {
  const nombre = input.nombre.trim();
  if (!nombre) throw new ProductoError("nombre_requerido", "El producto necesita un nombre");
  if (!Number.isInteger(input.precio_centavos) || input.precio_centavos < 0) {
    throw new ProductoError("precio_invalido", "Precio inválido");
  }
  if (!TIPOS.has(input.tipo_consumo)) throw new ProductoError("tipo_invalido", "Tipo de producto inválido");
  if (input.categoria_id != null) {
    const cat = db.prepare("SELECT id FROM categorias_pos WHERE id = ?").get(input.categoria_id);
    if (!cat) throw new ProductoError("categoria_inexistente", "Categoría inexistente");
  }
  const codigo = input.codigo?.trim() || null;
  if (codigo) {
    const dup = db.prepare("SELECT id FROM productos WHERE codigo = ?").get(codigo);
    if (dup) throw new ProductoError("codigo_duplicado", "Ese código de producto ya existe");
  }
  const color = input.color?.trim() || null;
  const foto = input.foto_data?.trim() || null;
  const rastrear = input.tipo_consumo === "receta_kit" ? Boolean(input.rastrear_inventario) : input.rastrear_inventario !== false;
  const tipo =
    input.tipo_consumo === "receta_kit" ? "receta_kit" : rastrear ? "almacenable_unitario" : "no_almacenable";
  const id = Number(
    db
      .prepare(
        "INSERT INTO productos (nombre, precio_centavos, categoria_id, tipo_consumo, disponible_en_pos, activo, codigo, color, foto_data, rastrear_inventario) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)",
      )
      .run(
        nombre,
        input.precio_centavos,
        input.categoria_id,
        tipo,
        input.disponible_en_pos ? 1 : 0,
        codigo,
        color,
        foto,
        rastrear ? 1 : 0,
      ).lastInsertRowid,
  );
  if (rastrear || tipo === "almacenable_unitario") {
    db.prepare("INSERT INTO stock (producto_id, on_hand_real, reserved_real) VALUES (?, 0, 0)").run(id);
  }
  return { id };
}

export function listarCategorias(db: Database.Database): { id: number; nombre: string; estacion: string }[] {
  return db.prepare("SELECT id, nombre, estacion FROM categorias_pos ORDER BY nombre").all() as {
    id: number;
    nombre: string;
    estacion: string;
  }[];
}

export function listarProductos(db: Database.Database): {
  id: number;
  nombre: string;
  precio_centavos: number;
  disponible_en_pos: number;
  activo: number;
}[] {
  return db
    .prepare(
      "SELECT id, nombre, precio_centavos, disponible_en_pos, activo FROM productos WHERE activo = 1 ORDER BY nombre",
    )
    .all() as { id: number; nombre: string; precio_centavos: number; disponible_en_pos: number; activo: number }[];
}

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
