import type Database from "better-sqlite3";
import { hashPin, verifyPin } from "./pin.ts";

export type Derecho = "minimo" | "basico" | "avanzado";
export type AccionPin = "enviar" | "precuenta" | "caja" | "abrir_sesion" | "crear_pedido" | "anular";

export type Empleado = {
  id: number;
  nombre: string;
  pin_hash: string;
  derecho: Derecho;
  activo: number;
};

export function empleadoPorId(db: Database.Database, id: number): Empleado | undefined {
  return db
    .prepare("SELECT id, nombre, pin_hash, derecho, activo FROM empleados WHERE id = ? AND activo = 1")
    .get(id) as Empleado | undefined;
}

export class PinError extends Error {
  codigo: "pin_invalido" | "sin_derecho" | "credenciales_invalidas";

  constructor(codigo: "pin_invalido" | "sin_derecho" | "credenciales_invalidas", message: string) {
    super(message);
    this.name = "PinError";
    this.codigo = codigo;
  }
}

export async function crearEmpleado(
  db: Database.Database,
  input: { nombre: string; pin: string; derecho: Derecho; usuario?: string; password?: string },
): Promise<{ id: number }> {
  const pin_hash = await hashPin(input.pin);
  const password_hash = input.password ? await hashPin(input.password) : null;
  const usuario = input.usuario?.trim().toLowerCase() || null;
  const info = db
    .prepare(
      "INSERT INTO empleados (nombre, pin_hash, derecho, activo, usuario, password_hash) VALUES (?, ?, ?, 1, ?, ?)",
    )
    .run(input.nombre, pin_hash, input.derecho, usuario, password_hash);
  return { id: Number(info.lastInsertRowid) };
}

export async function exigirCredenciales(
  db: Database.Database,
  usuario: string,
  password: string,
): Promise<Empleado> {
  const clave = usuario.trim().toLowerCase();
  if (!clave || !password) {
    throw new PinError("credenciales_invalidas", "Usuario o contraseña incorrectos");
  }
  const row = db
    .prepare(
      "SELECT id, nombre, pin_hash, derecho, activo, usuario, password_hash FROM empleados WHERE activo = 1 AND usuario = ?",
    )
    .get(clave) as (Empleado & { usuario: string | null; password_hash: string | null }) | undefined;
  if (!row?.password_hash || !(await verifyPin(password, row.password_hash))) {
    throw new PinError("credenciales_invalidas", "Usuario o contraseña incorrectos");
  }
  if (row.derecho !== "avanzado") {
    throw new PinError("sin_derecho", "Solo un administrador puede abrir el salón");
  }
  return row;
}

export async function asegurarCuentaAdmin(db: Database.Database): Promise<void> {
  const hash = await hashPin("admin");
  const avanzado = db
    .prepare("SELECT id, usuario FROM empleados WHERE derecho = 'avanzado' AND activo = 1 ORDER BY id LIMIT 1")
    .get() as { id: number; usuario: string | null } | undefined;
  if (!avanzado) {
    await crearEmpleado(db, {
      nombre: "Jefa",
      pin: "2222",
      derecho: "avanzado",
      usuario: "admin",
      password: "admin",
    });
    return;
  }
  if (!avanzado.usuario) {
    db.prepare("UPDATE empleados SET usuario = ?, password_hash = ? WHERE id = ?").run("admin", hash, avanzado.id);
  }
}

export async function probarPin(db: Database.Database, pin: string): Promise<Empleado | null> {
  const rows = db
    .prepare("SELECT id, nombre, pin_hash, derecho, activo FROM empleados WHERE activo = 1")
    .all() as Empleado[];
  for (const row of rows) {
    if (await verifyPin(pin, row.pin_hash)) return row;
  }
  return null;
}

function puede(derecho: Derecho, accion: AccionPin): boolean {
  if (accion === "caja" || accion === "abrir_sesion") return derecho === "avanzado";
  return derecho === "basico" || derecho === "avanzado";
}

export async function exigirPin(
  db: Database.Database,
  pin: string,
  accion: AccionPin,
): Promise<Empleado> {
  const empleado = await probarPin(db, pin);
  if (!empleado) throw new PinError("pin_invalido", "PIN incorrecto");
  if (!puede(empleado.derecho, accion)) {
    throw new PinError("sin_derecho", "Sin derecho para esta acción");
  }
  return empleado;
}
