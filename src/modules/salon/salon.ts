import type Database from "better-sqlite3";

export type EstadoMesa = "libre" | "ocupada" | "en_cocina" | "precuenta" | "en_caja";

export class SalonError extends Error {
  codigo: string;
  constructor(codigo: string, message: string) {
    super(message);
    this.name = "SalonError";
    this.codigo = codigo;
  }
}

type PedidoRow = { id: number; estado: string };

function pedidoAbierto(db: Database.Database, mesaId: number): PedidoRow | undefined {
  return db
    .prepare(
      "SELECT id, estado FROM pedidos WHERE mesa_id = ? AND estado NOT IN ('en_caja', 'cancelado') ORDER BY id DESC LIMIT 1",
    )
    .get(mesaId) as PedidoRow | undefined;
}

export function pedidoIdAbierto(db: Database.Database, mesaId: number): number | null {
  return pedidoAbierto(db, mesaId)?.id ?? null;
}

export function estadoMesa(db: Database.Database, mesaId: number): EstadoMesa {
  const pedido = pedidoAbierto(db, mesaId);
  if (!pedido) return "libre";
  if (pedido.estado === "precuenta_emitida") return "precuenta";
  if (pedido.estado === "enviado" || pedido.estado === "parcialmente_enviado") return "en_cocina";
  return "ocupada";
}

export function abrirMesa(
  db: Database.Database,
  input: { mesaId: number; cubiertos: number; preset: string; meseroId: number },
): { pedidoId: number } {
  if (input.cubiertos <= 0) throw new SalonError("cubiertos_requeridos", "Hay que indicar cubiertos");
  if (pedidoAbierto(db, input.mesaId)) throw new SalonError("mesa_ocupada", "mesa_ocupada");
  const info = db
    .prepare(
      "INSERT INTO pedidos (mesa_id, preset, cubiertos, estado, mesero_id, abierto_en) VALUES (?, ?, ?, 'borrador', ?, ?)",
    )
    .run(input.mesaId, input.preset, input.cubiertos, input.meseroId, new Date().toISOString());
  return { pedidoId: Number(info.lastInsertRowid) };
}

/** Devuelve el único pedido sin completar y sin mesa, si existe. */
export function borradorSinMesa(db: Database.Database): number | null {
  const row = db
    .prepare(
      `SELECT id FROM pedidos
       WHERE mesa_id IS NULL AND estado = 'borrador'
       ORDER BY id DESC LIMIT 1`,
    )
    .get() as { id: number } | undefined;
  return row?.id ?? null;
}

export function abrirTab(
  db: Database.Database,
  input: { cubiertos: number; preset: string; meseroId: number },
): { pedidoId: number } {
  const existente = borradorSinMesa(db);
  if (existente) return { pedidoId: existente };
  const info = db
    .prepare(
      "INSERT INTO pedidos (mesa_id, preset, cubiertos, estado, mesero_id, abierto_en) VALUES (NULL, ?, ?, 'borrador', ?, ?)",
    )
    .run(input.preset, input.cubiertos, input.meseroId, new Date().toISOString());
  return { pedidoId: Number(info.lastInsertRowid) };
}

/** Borra los pedidos sin mesa que quedaron vacíos, dejando a lo sumo el borrador actual. */
export function limpiarPedidosSinMesa(db: Database.Database): number {
  const sobrantes = db
    .prepare(
      `SELECT p.id FROM pedidos p
       WHERE p.mesa_id IS NULL
         AND p.estado = 'borrador'
         AND NOT EXISTS (SELECT 1 FROM pedido_lineas pl WHERE pl.pedido_id = p.id AND pl.estado NOT LIKE 'anulada%')
         AND NOT EXISTS (SELECT 1 FROM comandas c WHERE c.pedido_id = p.id)
         AND NOT EXISTS (SELECT 1 FROM precuentas pc WHERE pc.pedido_id = p.id)
         AND NOT EXISTS (SELECT 1 FROM caja_handoffs ch WHERE ch.pedido_id = p.id)
       ORDER BY p.id DESC`,
    )
    .all() as { id: number }[];
  const aBorrar = sobrantes.slice(1);
  if (aBorrar.length === 0) return 0;
  const borrarLineas = db.prepare("DELETE FROM pedido_lineas WHERE pedido_id = ?");
  const borrarPedido = db.prepare("DELETE FROM pedidos WHERE id = ?");
  db.transaction(() => {
    for (const p of aBorrar) {
      borrarLineas.run(p.id);
      borrarPedido.run(p.id);
    }
  })();
  return aBorrar.length;
}

export function asignarMesa(db: Database.Database, pedidoId: number, mesaId: number): void {
  const pedido = db.prepare("SELECT id, estado FROM pedidos WHERE id = ?").get(pedidoId) as PedidoRow | undefined;
  if (!pedido) throw new SalonError("pedido_inexistente", "Pedido inexistente");
  if (pedido.estado === "en_caja" || pedido.estado === "cancelado") {
    throw new SalonError("pedido_cerrado", "Pedido cerrado");
  }
  if (pedidoAbierto(db, mesaId)) throw new SalonError("mesa_ocupada", "mesa_ocupada");
  db.prepare("UPDATE pedidos SET mesa_id = ? WHERE id = ?").run(mesaId, pedidoId);
}

export type MesaPlanoInput = {
  id?: number;
  piso_id?: number;
  numero: number;
  asientos: number;
  pos_x: number;
  pos_y: number;
  forma: string;
  ancho: number;
  alto: number;
  activa?: number;
  fondo_color?: string | null;
  fondo_data?: string | null;
};

export type PisoPlanoInput = {
  id?: number;
  nombre: string;
  mesas?: MesaPlanoInput[];
  fondo_color?: string | null;
  fondo_data?: string | null;
  fondo_quitar_imagen?: boolean;
};

function aplicarFondoBlob(
  db: Database.Database,
  pisoId: number,
  dataUrl: string | null | undefined,
  quitar: boolean | undefined,
): void {
  if (quitar) {
    db.prepare("UPDATE pisos SET fondo_mime = NULL, fondo_blob = NULL WHERE id = ?").run(pisoId);
    return;
  }
  if (!dataUrl) return;
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return;
  db.prepare("UPDATE pisos SET fondo_mime = ?, fondo_blob = ? WHERE id = ?").run(m[1], Buffer.from(m[2], "base64"), pisoId);
}

function claveNombrePiso(nombre: string): string {
  return nombre.trim().toLocaleLowerCase("es");
}

function validarUnicidadPlano(
  db: Database.Database,
  input: { pisos: PisoPlanoInput[]; quitarMesaIds?: number[]; quitarPisoIds?: number[] },
): void {
  const nombres = new Map<string, string>();
  const numeros = new Map<number, string>();
  const quitadas = new Set(input.quitarMesaIds ?? []);
  const pisosQuitar = new Set(input.quitarPisoIds ?? []);
  const idsMesaPayload = new Set<number>();
  const idsPisoPayload = new Set<number>();
  for (const piso of input.pisos) {
    const nombre = piso.nombre.trim();
    if (!nombre) throw new SalonError("piso_sin_nombre", "El piso necesita un nombre");
    const clave = claveNombrePiso(nombre);
    const previo = nombres.get(clave);
    if (previo) throw new SalonError("piso_nombre_duplicado", `Ya hay un piso llamado ${previo}`);
    nombres.set(clave, nombre);
    if (piso.id) idsPisoPayload.add(piso.id);
    for (const mesa of piso.mesas ?? []) {
      if (mesa.id && quitadas.has(mesa.id)) continue;
      if (mesa.id) idsMesaPayload.add(mesa.id);
      const numero = Math.max(1, Math.floor(mesa.numero));
      const otra = numeros.get(numero);
      if (otra) throw new SalonError("mesa_numero_duplicado", `La mesa ${numero} ya existe (${otra})`);
      numeros.set(numero, nombre);
    }
  }
  const pisosDb = db
    .prepare("SELECT id, nombre FROM pisos WHERE COALESCE(activo, 1) = 1")
    .all() as { id: number; nombre: string }[];
  for (const p of pisosDb) {
    if (pisosQuitar.has(p.id) || idsPisoPayload.has(p.id)) continue;
    const clave = claveNombrePiso(p.nombre);
    const previo = nombres.get(clave);
    if (previo) throw new SalonError("piso_nombre_duplicado", `Ya hay un piso llamado ${previo}`);
    nombres.set(clave, p.nombre.trim());
  }
  const mesasDb = db
    .prepare("SELECT id, numero, piso_id FROM mesas WHERE activa = 1")
    .all() as { id: number; numero: number; piso_id: number }[];
  for (const m of mesasDb) {
    if (quitadas.has(m.id) || pisosQuitar.has(m.piso_id) || idsMesaPayload.has(m.id)) continue;
    const otra = numeros.get(m.numero);
    if (otra) throw new SalonError("mesa_numero_duplicado", `La mesa ${m.numero} ya existe (${otra})`);
    numeros.set(m.numero, `mesa ${m.id}`);
  }
}

export function guardarPlano(
  db: Database.Database,
  input: { pisos: PisoPlanoInput[]; quitarMesaIds?: number[]; quitarPisoIds?: number[] },
): { pisos: { id: number; nombre: string }[] } {
  validarUnicidadPlano(db, input);
  const pisosOut: { id: number; nombre: string }[] = [];
  for (const piso of input.pisos) {
    const nombre = piso.nombre.trim();
    let id = piso.id;
    if (id) {
      db.prepare("UPDATE pisos SET nombre = ?, fondo_color = ? WHERE id = ?").run(nombre, piso.fondo_color ?? null, id);
    } else {
      id = Number(
        db.prepare("INSERT INTO pisos (nombre, fondo_color, activo) VALUES (?, ?, 1)").run(nombre, piso.fondo_color ?? null)
          .lastInsertRowid,
      );
    }
    aplicarFondoBlob(db, id, piso.fondo_data, piso.fondo_quitar_imagen);
    pisosOut.push({ id, nombre });
    for (const mesa of piso.mesas ?? []) {
      const forma = mesa.forma === "round" ? "round" : "square";
      const asientos = Math.max(1, Math.floor(mesa.asientos));
      const numero = Math.max(1, Math.floor(mesa.numero));
      if (mesa.id) {
        db.prepare(
          "UPDATE mesas SET piso_id = ?, numero = ?, asientos = ?, pos_x = ?, pos_y = ?, forma = ?, ancho = ?, alto = ?, activa = 1, fondo_color = ?, fondo_data = ? WHERE id = ?",
        ).run(
          id,
          numero,
          asientos,
          mesa.pos_x,
          mesa.pos_y,
          forma,
          mesa.ancho,
          mesa.alto,
          mesa.fondo_color ?? null,
          mesa.fondo_data ?? null,
          mesa.id,
        );
      } else {
        db.prepare(
          "INSERT INTO mesas (piso_id, numero, asientos, activa, pos_x, pos_y, forma, ancho, alto, fondo_color, fondo_data) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)",
        ).run(
          id,
          numero,
          asientos,
          mesa.pos_x,
          mesa.pos_y,
          forma,
          mesa.ancho,
          mesa.alto,
          mesa.fondo_color ?? null,
          mesa.fondo_data ?? null,
        );
      }
    }
  }
  for (const mesaId of input.quitarMesaIds ?? []) {
    if (pedidoAbierto(db, mesaId)) throw new SalonError("mesa_ocupada", "No se quita una mesa con pedido");
    db.prepare("UPDATE mesas SET activa = 0 WHERE id = ?").run(mesaId);
  }
  for (const pisoId of input.quitarPisoIds ?? []) {
    const ocupadas = db
      .prepare(
        `SELECT m.id FROM mesas m
         WHERE m.piso_id = ? AND m.activa = 1`,
      )
      .all(pisoId) as { id: number }[];
    for (const m of ocupadas) {
      if (pedidoAbierto(db, m.id)) throw new SalonError("piso_ocupado", "No se elimina un piso con pedidos abiertos");
    }
    db.prepare("UPDATE mesas SET activa = 0 WHERE piso_id = ?").run(pisoId);
    db.prepare("UPDATE pisos SET activo = 0 WHERE id = ?").run(pisoId);
  }
  return { pisos: pisosOut };
}

export function liberarMesa(db: Database.Database, mesaId: number): void {
  const pedido = pedidoAbierto(db, mesaId);
  if (!pedido) return;
  const lineas = db.prepare("SELECT count(*) AS c FROM pedido_lineas WHERE pedido_id = ?").get(pedido.id) as { c: number };
  if (lineas.c > 0) throw new SalonError("pedido_con_lineas", "No se libera una mesa con consumo");
  db.prepare("UPDATE pedidos SET estado = 'cancelado' WHERE id = ?").run(pedido.id);
}
