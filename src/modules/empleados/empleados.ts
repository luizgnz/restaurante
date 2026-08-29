import type Database from "better-sqlite3";
import { hashPin, verifyPin } from "./pin.ts";

export type Derecho = "minimo" | "basico" | "avanzado";
export type RolClave = "administrador" | "mesero" | "cocina" | "caja" | "inventario";
export type AccionPin = "enviar" | "precuenta" | "caja" | "abrir_sesion" | "crear_pedido" | "anular" | "inventario";

export type Empleado = {
  id: number;
  nombre: string;
  pin_hash: string;
  derecho: Derecho;
  activo: number;
};

export type UsuarioGestion = {
  id: number;
  nombre: string;
  usuario: string | null;
  derecho: Derecho;
  activo: boolean;
  roles: RolClave[];
};

export const ROLES: Array<{ clave: RolClave; nombre: string; descripcion: string }> = [
  { clave: "administrador", nombre: "Administrador", descripcion: "Configura el sistema, usuarios e inventario" },
  { clave: "mesero", nombre: "Mesero", descripcion: "Crea órdenes y atiende mesas" },
  { clave: "cocina", nombre: "Cocina", descripcion: "Recibe y prepara comandas" },
  { clave: "caja", nombre: "Caja", descripcion: "Emite comprobantes y cierra cuentas" },
  { clave: "inventario", nombre: "Inventario", descripcion: "Consulta existencias y disponibilidad" },
];

const CLAVES_ROL = new Set<string>(ROLES.map((rol) => rol.clave));

export class EmpleadoError extends Error {
  codigo: string;
  constructor(codigo: string, message: string) {
    super(message);
    this.name = "EmpleadoError";
    this.codigo = codigo;
  }
}

function rolesPorDerecho(derecho: Derecho): RolClave[] {
  if (derecho === "avanzado") return ["administrador"];
  if (derecho === "basico") return ["mesero"];
  return ["cocina"];
}

function derechoPorRoles(roles: RolClave[]): Derecho {
  if (roles.includes("administrador")) return "avanzado";
  if (roles.some((rol) => rol === "mesero" || rol === "caja" || rol === "inventario")) return "basico";
  return "minimo";
}

function validarRoles(roles: readonly string[]): RolClave[] {
  const unicos = [...new Set(roles)];
  if (unicos.length === 0 || unicos.some((rol) => !CLAVES_ROL.has(rol))) {
    throw new EmpleadoError("roles_invalidos", "Selecciona al menos un rol válido");
  }
  return unicos as RolClave[];
}

export function rolesDeEmpleado(db: Database.Database, empleadoId: number): RolClave[] {
  return (db.prepare("SELECT rol_clave FROM empleado_roles WHERE empleado_id = ? ORDER BY rol_clave").all(empleadoId) as Array<{ rol_clave: RolClave }>).map((row) => row.rol_clave);
}

function guardarRoles(db: Database.Database, empleadoId: number, roles: RolClave[]): void {
  db.prepare("DELETE FROM empleado_roles WHERE empleado_id = ?").run(empleadoId);
  const insertar = db.prepare("INSERT INTO empleado_roles (empleado_id, rol_clave) VALUES (?, ?)");
  for (const rol of roles) insertar.run(empleadoId, rol);
}

export function listarUsuarios(db: Database.Database): UsuarioGestion[] {
  const rows = db.prepare("SELECT id, nombre, usuario, derecho, activo FROM empleados ORDER BY activo DESC, nombre").all() as Array<Omit<UsuarioGestion, "activo" | "roles"> & { activo: number }>;
  return rows.map((row) => ({ ...row, activo: row.activo === 1, roles: rolesDeEmpleado(db, row.id) }));
}

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
  input: { nombre: string; pin: string; derecho?: Derecho; usuario?: string; password?: string; roles?: RolClave[] },
): Promise<{ id: number }> {
  const nombre = input.nombre.trim();
  if (!nombre) throw new EmpleadoError("nombre_requerido", "El usuario necesita un nombre");
  if (!input.pin.trim()) throw new EmpleadoError("pin_requerido", "El usuario necesita un PIN");
  const roles = validarRoles(input.roles ?? rolesPorDerecho(input.derecho ?? "minimo"));
  const derecho = derechoPorRoles(roles);
  const pin_hash = await hashPin(input.pin);
  const password_hash = input.password ? await hashPin(input.password) : null;
  const usuario = input.usuario?.trim().toLowerCase() || null;
  try {
    return db.transaction(() => {
      const info = db
        .prepare("INSERT INTO empleados (nombre, pin_hash, derecho, activo, usuario, password_hash) VALUES (?, ?, ?, 1, ?, ?)")
        .run(nombre, pin_hash, derecho, usuario, password_hash);
      const id = Number(info.lastInsertRowid);
      guardarRoles(db, id, roles);
      return { id };
    })();
  } catch (error) {
    if (error instanceof Error && error.message.includes("empleados.usuario")) {
      throw new EmpleadoError("usuario_duplicado", "Ese nombre de usuario ya está en uso");
    }
    throw error;
  }
}

export async function actualizarUsuario(
  db: Database.Database,
  id: number,
  input: { nombre: string; usuario?: string | null; pin?: string; password?: string; roles: RolClave[]; activo: boolean },
): Promise<UsuarioGestion> {
  const actual = db.prepare("SELECT id FROM empleados WHERE id = ?").get(id);
  if (!actual) throw new EmpleadoError("empleado_inexistente", "El usuario no existe");
  const nombre = input.nombre.trim();
  if (!nombre) throw new EmpleadoError("nombre_requerido", "El usuario necesita un nombre");
  const roles = validarRoles(input.roles);
  const eraAdmin = rolesDeEmpleado(db, id).includes("administrador");
  if (eraAdmin && (!roles.includes("administrador") || !input.activo)) {
    const otros = Number((db.prepare(`SELECT count(DISTINCT er.empleado_id) AS c FROM empleado_roles er JOIN empleados e ON e.id = er.empleado_id WHERE er.rol_clave = 'administrador' AND e.activo = 1 AND e.id <> ?`).get(id) as { c: number }).c);
    if (otros === 0) throw new EmpleadoError("ultimo_administrador", "Debe quedar al menos un administrador activo");
  }
  const usuario = input.usuario?.trim().toLowerCase() || null;
  const derecho = derechoPorRoles(roles);
  const pinHash = input.pin?.trim() ? await hashPin(input.pin) : null;
  const passwordHash = input.password?.trim() ? await hashPin(input.password) : null;
  try {
    db.transaction(() => {
      db.prepare(`UPDATE empleados SET nombre = ?, usuario = ?, derecho = ?, activo = ?, pin_hash = COALESCE(?, pin_hash), password_hash = COALESCE(?, password_hash) WHERE id = ?`).run(
        nombre, usuario, derecho, input.activo ? 1 : 0, pinHash, passwordHash, id,
      );
      guardarRoles(db, id, roles);
    })();
  } catch (error) {
    if (error instanceof Error && error.message.includes("empleados.usuario")) {
      throw new EmpleadoError("usuario_duplicado", "Ese nombre de usuario ya está en uso");
    }
    throw error;
  }
  return listarUsuarios(db).find((usuarioRow) => usuarioRow.id === id)!;
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

function puede(derecho: Derecho, accion: AccionPin, roles: RolClave[]): boolean {
  if (roles.length === 0) {
    if (accion === "caja" || accion === "abrir_sesion" || accion === "inventario") return derecho === "avanzado";
    return derecho === "basico" || derecho === "avanzado";
  }
  if (roles.includes("administrador")) return true;
  if (accion === "inventario") return false;
  if (accion === "caja") return roles.includes("caja");
  if (accion === "abrir_sesion") return false;
  if (accion === "precuenta") return roles.includes("mesero") || roles.includes("caja");
  if (accion === "enviar" || accion === "crear_pedido" || accion === "anular") return roles.includes("mesero");
  return false;
}

export async function exigirPin(
  db: Database.Database,
  pin: string,
  accion: AccionPin,
): Promise<Empleado> {
  const empleado = await probarPin(db, pin);
  if (!empleado) throw new PinError("pin_invalido", "PIN incorrecto");
  if (!puede(empleado.derecho, accion, rolesDeEmpleado(db, empleado.id))) {
    throw new PinError("sin_derecho", "Sin derecho para esta acción");
  }
  return empleado;
}
