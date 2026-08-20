import type Database from "better-sqlite3";
import { exigirCredenciales, type Empleado } from "./empleados.ts";

export type Credenciales = { usuario: string; password: string };

export type SesionAbierta = {
  id: number;
  abierta_en: string;
  administrador: Pick<Empleado, "id" | "nombre" | "derecho">;
};

export async function abrirSesion(db: Database.Database, credenciales: Credenciales): Promise<SesionAbierta> {
  const administrador = await exigirCredenciales(db, credenciales.usuario, credenciales.password);
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
