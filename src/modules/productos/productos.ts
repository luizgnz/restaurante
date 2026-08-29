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

export type LineaRecetaInput = { ingredienteId: number; cantidad: number };

function validarReceta(db: Database.Database, productoId: number, lineas: LineaRecetaInput[]): LineaRecetaInput[] {
  if (lineas.length === 0) throw new ProductoError("receta_vacia", "La receta necesita al menos un ingrediente");
  const vistos = new Set<number>();
  return lineas.map((linea) => {
    if (!Number.isInteger(linea.ingredienteId) || linea.ingredienteId <= 0 || linea.ingredienteId === productoId) {
      throw new ProductoError("ingrediente_invalido", "Selecciona un ingrediente válido");
    }
    if (!Number.isFinite(linea.cantidad) || linea.cantidad <= 0 || linea.cantidad > 1_000_000) {
      throw new ProductoError("cantidad_receta_invalida", "La cantidad de cada ingrediente debe ser mayor que cero");
    }
    if (vistos.has(linea.ingredienteId)) throw new ProductoError("ingrediente_duplicado", "Un ingrediente no puede repetirse");
    vistos.add(linea.ingredienteId);
    const ingrediente = db.prepare("SELECT p.id FROM productos p JOIN stock s ON s.producto_id = p.id WHERE p.id = ? AND p.activo = 1 AND p.tipo_consumo != 'receta_kit'").get(linea.ingredienteId);
    if (!ingrediente) throw new ProductoError("ingrediente_inexistente", "El ingrediente debe ser un material activo con control de inventario");
    return linea;
  });
}

export function recetaDeProducto(db: Database.Database, productoId: number): Array<{ ingredienteId: number; nombre: string; cantidad: number }> {
  return db.prepare(
    `SELECT rl.ingrediente_id AS ingredienteId, p.nombre, rl.cantidad_real AS cantidad
     FROM receta_lineas rl JOIN productos p ON p.id = rl.ingrediente_id
     WHERE rl.producto_id = ? ORDER BY rl.id`,
  ).all(productoId) as Array<{ ingredienteId: number; nombre: string; cantidad: number }>;
}

export function guardarReceta(db: Database.Database, productoId: number, lineas: LineaRecetaInput[]): void {
  const producto = db.prepare("SELECT tipo_consumo FROM productos WHERE id = ? AND activo = 1").get(productoId) as { tipo_consumo: string } | undefined;
  if (!producto) throw new ProductoError("producto_inexistente", "El producto no existe");
  if (producto.tipo_consumo !== "receta_kit") throw new ProductoError("producto_no_receta", "El producto no está configurado como receta");
  const validas = validarReceta(db, productoId, lineas);
  db.transaction(() => {
    db.prepare("DELETE FROM receta_lineas WHERE producto_id = ?").run(productoId);
    const insertar = db.prepare("INSERT INTO receta_lineas (producto_id, ingrediente_id, cantidad_real) VALUES (?, ?, ?)");
    for (const linea of validas) insertar.run(productoId, linea.ingredienteId, linea.cantidad);
  })();
}

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
    receta?: LineaRecetaInput[];
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
  return db.transaction(() => {
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
    if (tipo === "receta_kit") guardarReceta(db, id, input.receta ?? []);
    return { id };
  })();
}

export function listarCategorias(db: Database.Database): { id: number; nombre: string; estacion: string }[] {
  return db.prepare("SELECT id, nombre, estacion FROM categorias_pos ORDER BY nombre").all() as {
    id: number;
    nombre: string;
    estacion: string;
  }[];
}

export function crearCategoria(db: Database.Database, input: { nombre: string }): { id: number; nombre: string } {
  const nombre = input.nombre.trim();
  if (!nombre) throw new ProductoError("nombre_requerido", "La categoría necesita un nombre");
  if (nombre.length > 40) throw new ProductoError("nombre_invalido", "Nombre de categoría demasiado largo");
  const duplicada = db.prepare("SELECT id FROM categorias_pos WHERE lower(nombre) = lower(?)").get(nombre);
  if (duplicada) throw new ProductoError("categoria_duplicada", "Esa categoría ya existe");
  const id = Number(
    db.prepare("INSERT INTO categorias_pos (nombre, estacion) VALUES (?, 'cocina')").run(nombre).lastInsertRowid,
  );
  return { id, nombre };
}

export function listarProductos(db: Database.Database): {
  id: number;
  nombre: string;
  precio_centavos: number;
  tipo_consumo: string;
  rastrear_inventario: number;
  disponible_en_pos: number;
  activo: number;
}[] {
  return db
    .prepare(
      "SELECT p.id, p.nombre, p.precio_centavos, p.tipo_consumo, EXISTS(SELECT 1 FROM stock s WHERE s.producto_id = p.id) AS rastrear_inventario, p.disponible_en_pos, p.activo FROM productos p WHERE p.activo = 1 ORDER BY p.nombre",
    )
    .all() as { id: number; nombre: string; precio_centavos: number; tipo_consumo: string; rastrear_inventario: number; disponible_en_pos: number; activo: number }[];
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
