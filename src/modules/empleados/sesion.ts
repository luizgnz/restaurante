import type Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";
import { exigirCredenciales, PinError, rolesDeEmpleado, type Empleado, type RolClave } from "./empleados.ts";

export type Credenciales = { usuario: string; password: string };

export type SesionAbierta = {
  id: number;
  abierta_en: string;
  administrador: Pick<Empleado, "id" | "nombre" | "derecho">;
};

export type UsuarioSesion = Pick<Empleado, "id" | "nombre" | "derecho"> & { roles: RolClave[] };

export type SesionUsuario = {
  id: number;
  abierta_en: string;
  usuario: UsuarioSesion;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function abrirSesion(db: Database.Database, credenciales: Credenciales): Promise<SesionAbierta> {
  const administrador = await exigirCredenciales(db, credenciales.usuario, credenciales.password);
  if (!rolesDeEmpleado(db, administrador.id).includes("administrador")) {
    throw new PinError("sin_derecho", "Solo un administrador puede abrir el turno del restaurante");
  }
  const actual = sesionAbierta(db);
  if (actual) return actual;
  const abierta_en = new Date().toISOString();
  const info = db
    .prepare("INSERT INTO sesiones_pos (administrador_id, abierta_en) VALUES (?, ?)")
    .run(administrador.id, abierta_en);
  return {
    id: Number(info.lastInsertRowid),
    abierta_en,
    administrador: { id: administrador.id, nombre: administrador.nombre, derecho: administrador.derecho },
  };
}

export async function abrirSesionUsuario(
  db: Database.Database,
  credenciales: Credenciales,
): Promise<{ token: string; sesion: SesionUsuario }> {
  const empleado = await exigirCredenciales(db, credenciales.usuario, credenciales.password);
  const roles = rolesDeEmpleado(db, empleado.id);
  if (!sesionAbierta(db)) {
    db.prepare("INSERT INTO sesiones_pos (administrador_id, abierta_en) VALUES (?, ?)")
      .run(empleado.id, new Date().toISOString());
  }
  const token = randomBytes(32).toString("base64url");
  const abierta_en = new Date().toISOString();
  const info = db
    .prepare("INSERT INTO sesiones_usuario (token_hash, empleado_id, abierta_en) VALUES (?, ?, ?)")
    .run(hashToken(token), empleado.id, abierta_en);
  return {
    token,
    sesion: {
      id: Number(info.lastInsertRowid),
      abierta_en,
      usuario: { id: empleado.id, nombre: empleado.nombre, derecho: empleado.derecho, roles },
    },
  };
}

export function sesionUsuarioPorToken(db: Database.Database, token: string | undefined): SesionUsuario | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT su.id, su.abierta_en, e.id AS empleado_id, e.nombre, e.derecho
       FROM sesiones_usuario su
       JOIN empleados e ON e.id = su.empleado_id
       WHERE su.token_hash = ? AND su.cerrada_en IS NULL AND e.activo = 1
       LIMIT 1`,
    )
    .get(hashToken(token)) as
    | { id: number; abierta_en: string; empleado_id: number; nombre: string; derecho: Empleado["derecho"] }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    abierta_en: row.abierta_en,
    usuario: {
      id: row.empleado_id,
      nombre: row.nombre,
      derecho: row.derecho,
      roles: rolesDeEmpleado(db, row.empleado_id),
    },
  };
}

export function cerrarSesionUsuario(db: Database.Database, token: string | undefined): void {
  if (!token) return;
  db.prepare("UPDATE sesiones_usuario SET cerrada_en = ? WHERE token_hash = ? AND cerrada_en IS NULL")
    .run(new Date().toISOString(), hashToken(token));
}

export function cerrarTodasSesionesUsuario(db: Database.Database): void {
  db.prepare("UPDATE sesiones_usuario SET cerrada_en = ? WHERE cerrada_en IS NULL").run(new Date().toISOString());
}

export function sesionAbierta(db: Database.Database): SesionAbierta | null {
  const row = db
    .prepare(
      `SELECT s.id, s.abierta_en, e.id AS empleado_id, e.nombre, e.derecho
       FROM sesiones_pos s
       JOIN empleados e ON e.id = s.administrador_id
       WHERE s.cerrada_en IS NULL
       ORDER BY s.id DESC
       LIMIT 1`,
    )
    .get() as
    | { id: number; abierta_en: string; empleado_id: number; nombre: string; derecho: Empleado["derecho"] }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    abierta_en: row.abierta_en,
    administrador: { id: row.empleado_id, nombre: row.nombre, derecho: row.derecho },
  };
}

export function cerrarSesion(db: Database.Database): void {
  db.prepare("UPDATE sesiones_pos SET cerrada_en = ? WHERE cerrada_en IS NULL").run(new Date().toISOString());
}
