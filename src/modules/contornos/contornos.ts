import type Database from "better-sqlite3";

export class ContornoError extends Error {
  codigo: string;
  constructor(codigo: string, message: string) {
    super(message);
    this.name = "ContornoError";
    this.codigo = codigo;
  }
}

export type GrupoContorno = { id: number; nombre: string };

export type VarianteContorno = {
  id: number;
  grupoId: number;
  nombre: string;
  suplementoCentavos: number;
  extraCentavos: number;
  activo: boolean;
};

export type SlotPlato = {
  posicion: number;
  nombre: string;
  permiteExtra: boolean;
  grupos: GrupoContorno[];
};

export type SeleccionContorno = { slotPosicion: number; varianteId: number };

export type SeleccionValidada = {
  slotPosicion: number;
  slotNombre: string;
  varianteId: number;
  varianteNombre: string;
  precioCentavos: number;
  esExtra: boolean;
  ordenExtra: number;
};

type GrupoRow = { id: number; nombre: string };
type VarianteRow = {
  id: number;
  grupo_id: number;
  nombre: string;
  suplemento_centavos: number;
  extra_centavos: number;
  activo: number;
};

export function crearGrupo(db: Database.Database, input: { nombre: string }): { id: number; nombre: string } {
  const nombre = input.nombre.trim();
  if (!nombre) throw new ContornoError("nombre_requerido", "El grupo necesita un nombre");
  const duplicado = db.prepare("SELECT id FROM contorno_grupos WHERE lower(nombre) = lower(?)").get(nombre);
  if (duplicado) throw new ContornoError("grupo_duplicado", "Ese grupo de contornos ya existe");
  const id = Number(db.prepare("INSERT INTO contorno_grupos (nombre) VALUES (?)").run(nombre).lastInsertRowid);
  return { id, nombre };
}

export function crearVariante(
  db: Database.Database,
  input: { grupoId: number; nombre: string; suplementoCentavos?: number; extraCentavos?: number },
): { id: number } {
  const nombre = input.nombre.trim();
  if (!nombre) throw new ContornoError("nombre_requerido", "La variante necesita un nombre");
  const grupo = db.prepare("SELECT id FROM contorno_grupos WHERE id = ?").get(input.grupoId);
  if (!grupo) throw new ContornoError("grupo_inexistente", "Grupo de contornos inexistente");
  const duplicada = db
    .prepare("SELECT id FROM contorno_variantes WHERE grupo_id = ? AND lower(nombre) = lower(?)")
    .get(input.grupoId, nombre);
  if (duplicada) throw new ContornoError("variante_duplicada", "Esa variante ya existe en el grupo");
  const suplemento = Math.max(0, Math.round(input.suplementoCentavos ?? 0));
  const extra = Math.max(0, Math.round(input.extraCentavos ?? 0));
  const id = Number(
    db
      .prepare(
        "INSERT INTO contorno_variantes (grupo_id, nombre, suplemento_centavos, extra_centavos, activo) VALUES (?, ?, ?, ?, 1)",
      )
      .run(input.grupoId, nombre, suplemento, extra).lastInsertRowid,
  );
  return { id };
}

export function listarContornos(db: Database.Database): {
  grupos: Array<GrupoContorno & { variantes: VarianteContorno[] }>;
} {
  const grupos = db.prepare("SELECT id, nombre FROM contorno_grupos ORDER BY nombre").all() as GrupoRow[];
  const variantes = db
    .prepare(
      "SELECT id, grupo_id, nombre, suplemento_centavos, extra_centavos, activo FROM contorno_variantes ORDER BY nombre",
    )
    .all() as VarianteRow[];
  return {
    grupos: grupos.map((grupo) => ({
      id: grupo.id,
      nombre: grupo.nombre,
      variantes: variantes
        .filter((variante) => variante.grupo_id === grupo.id)
        .map((variante) => ({
          id: variante.id,
          grupoId: variante.grupo_id,
          nombre: variante.nombre,
          suplementoCentavos: variante.suplemento_centavos,
          extraCentavos: variante.extra_centavos,
          activo: Boolean(variante.activo),
        })),
    })),
  };
}

export type SlotInput = { posicion: number; nombre: string; permiteExtra?: boolean; grupoIds: number[] };

export function configurarSlots(db: Database.Database, productoId: number, slots: SlotInput[]): void {
  const producto = db.prepare("SELECT id FROM productos WHERE id = ?").get(productoId);
  if (!producto) throw new ContornoError("producto_inexistente", "Producto inexistente");
  for (const slot of slots) {
    if (!slot.nombre.trim()) throw new ContornoError("slot_sin_nombre", "El slot necesita un nombre");
    if (slot.grupoIds.length === 0) throw new ContornoError("slot_sin_grupos", "El slot necesita al menos un grupo");
    for (const grupoId of slot.grupoIds) {
      const grupo = db.prepare("SELECT id FROM contorno_grupos WHERE id = ?").get(grupoId);
      if (!grupo) throw new ContornoError("grupo_inexistente", "Grupo de contornos inexistente");
    }
  }
  db.transaction(() => {
    db.prepare("DELETE FROM plato_slots WHERE producto_id = ?").run(productoId);
    const insertSlot = db.prepare(
      "INSERT INTO plato_slots (producto_id, posicion, nombre, permite_extra) VALUES (?, ?, ?, ?)",
    );
    const insertGrupo = db.prepare("INSERT INTO plato_slot_grupos (slot_id, grupo_id) VALUES (?, ?)");
    const posiciones = new Set<number>();
    for (const slot of slots) {
      if (posiciones.has(slot.posicion)) throw new ContornoError("slot_duplicado", "Posición de slot repetida");
      posiciones.add(slot.posicion);
      const slotId = Number(insertSlot.run(productoId, slot.posicion, slot.nombre.trim(), slot.permiteExtra ? 1 : 0).lastInsertRowid);
      for (const grupoId of slot.grupoIds) insertGrupo.run(slotId, grupoId);
    }
  })();
}

export function slotsDeProducto(db: Database.Database, productoId: number): SlotPlato[] {
  const slots = db
    .prepare("SELECT id, posicion, nombre, permite_extra FROM plato_slots WHERE producto_id = ? ORDER BY posicion")
    .all(productoId) as Array<{ id: number; posicion: number; nombre: string; permite_extra: number }>;
  const gruposPorSlot = db
    .prepare(
      `SELECT psg.slot_id, g.id, g.nombre
       FROM plato_slot_grupos psg
       JOIN contorno_grupos g ON g.id = psg.grupo_id`,
    )
    .all() as Array<{ slot_id: number; id: number; nombre: string }>;
  return slots.map((slot) => ({
    posicion: slot.posicion,
    nombre: slot.nombre,
    permiteExtra: Boolean(slot.permite_extra),
    grupos: gruposPorSlot.filter((grupo) => grupo.slot_id === slot.id).map((grupo) => ({ id: grupo.id, nombre: grupo.nombre })),
  }));
}

/** El plato no requiere contornos si no tiene slots configurados. */
export function requiereContornos(db: Database.Database, productoId: number): boolean {
  return slotsDeProducto(db, productoId).length > 0;
}

export function validarSelecciones(
  db: Database.Database,
  productoId: number,
  selecciones: SeleccionContorno[],
): SeleccionValidada[] {
  const slots = slotsDeProducto(db, productoId);
  if (slots.length === 0) {
    if (selecciones.length > 0) throw new ContornoError("slot_inexistente", "El producto no tiene contornos");
    return [];
  }
  const varianteStmt = db.prepare(
    "SELECT id, grupo_id, nombre, suplemento_centavos, extra_centavos FROM contorno_variantes WHERE id = ? AND activo = 1",
  );
  const porSlot = new Map<number, SeleccionContorno[]>();
  for (const seleccion of selecciones) {
    const lista = porSlot.get(seleccion.slotPosicion) ?? [];
    lista.push(seleccion);
    porSlot.set(seleccion.slotPosicion, lista);
  }
  const salida: SeleccionValidada[] = [];
  for (const slot of slots) {
    const delSlot = porSlot.get(slot.posicion) ?? [];
    if (delSlot.length === 0) {
      throw new ContornoError("contornos_incompletos", `Falta elegir ${slot.nombre}`);
    }
    const gruposPermitidos = new Set(slot.grupos.map((grupo) => grupo.id));
    delSlot.forEach((seleccion, indice) => {
      const variante = varianteStmt.get(seleccion.varianteId) as VarianteRow | undefined;
      if (!variante) throw new ContornoError("variante_inexistente", "Variante inexistente");
      if (!gruposPermitidos.has(variante.grupo_id)) {
        throw new ContornoError("variante_no_permitida", `${variante.nombre} no es una opción de ${slot.nombre}`);
      }
      const esExtra = indice > 0;
      if (esExtra && !slot.permiteExtra) {
        throw new ContornoError("extra_no_permitido", `${slot.nombre} no permite extras`);
      }
      if (esExtra && variante.extra_centavos <= 0) {
        throw new ContornoError("extra_no_permitido", `${variante.nombre} no tiene precio de extra configurado`);
      }
      salida.push({
        slotPosicion: slot.posicion,
        slotNombre: slot.nombre,
        varianteId: variante.id,
        varianteNombre: variante.nombre,
        precioCentavos: esExtra ? variante.extra_centavos : variante.suplemento_centavos,
        esExtra,
        ordenExtra: indice,
      });
    });
  }
  for (const seleccion of selecciones) {
    if (!slots.some((slot) => slot.posicion === seleccion.slotPosicion)) {
      throw new ContornoError("slot_inexistente", "El slot no existe en el plato");
    }
  }
  return salida;
}
