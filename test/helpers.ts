import { mkdirSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import { defaultConfig, type AppConfig } from "../src/config.ts";
import { migrate } from "../src/db/migrate.ts";
import { openSalonDb } from "../src/db/open.ts";
import { createApp } from "../src/http/app.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { MemoryPrinter } from "../src/print/memory.ts";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/db/migrations");

export function openEmptySalonDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "rest-"));
  mkdirSync(path.join(dir, "data"), { recursive: true });
  const db = openSalonDb(path.join(dir, "data", "salon.sqlite"), "linux");
  db.pragma("foreign_keys = ON");
  return db;
}

export function openTestDb() {
  const db = openEmptySalonDb();
  migrate(db);
  return db;
}

// ---------------------------------------------------------------------------
// Entorno HTTP compartido por las pruebas de contrato de la API.
// ---------------------------------------------------------------------------

export type App = ReturnType<typeof createApp>;

export type EntornoApi = {
  db: Database.Database;
  ids: ReturnType<typeof seedCartaDemo>;
  printer: MemoryPrinter;
  cfg: AppConfig;
  app: App;
};

/** Carta demo, tres derechos de PIN y la app montada sobre la misma config. */
export async function entornoApi(cfg: AppConfig = defaultConfig()): Promise<EntornoApi> {
  const db = openTestDb();
  const ids = seedCartaDemo(db);
  await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
  await crearEmpleado(db, { nombre: "Mini", pin: "3333", derecho: "minimo" });
  await crearEmpleado(db, {
    nombre: "Jefa",
    pin: "2222",
    derecho: "avanzado",
    usuario: "admin",
    password: "admin",
  });
  const printer = new MemoryPrinter();
  return { db, ids, printer, cfg, app: createApp({ db, config: cfg, printer }) };
}

export async function post(app: App, url: string, body?: unknown): Promise<Response> {
  return app.request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function codigoDe(res: Response): Promise<string> {
  return ((await res.json()) as { codigo: string }).codigo;
}

export type RespuestaOrden = {
  cuentaId: number;
  ordenId: number;
  ordenNumero: number;
  comandaId: number;
  repetida: boolean;
};

export async function crearOrden(e: EntornoApi, cuerpo: Record<string, unknown> = {}): Promise<RespuestaOrden> {
  const res = await post(e.app, "/api/ordenes", {
    mesaId: e.ids.mesa7,
    claveIdempotencia: "browser-uuid-1",
    pin: "1234",
    lineas: [{ productoId: e.ids.hamburguesa, cantidad: 2, nota: "sin cebolla" }],
    indicaciones: "primero bebidas",
    ...cuerpo,
  });
  if (res.status !== 201) throw new Error(`orden no creada: ${res.status} ${await res.text()}`);
  return (await res.json()) as RespuestaOrden;
}

export type CuentaHttp = {
  id: number;
  mesa: { id: number; numero: number };
  estado: string;
  notaPrivada: string | null;
  totalCentavos: number;
  ordenes: {
    id: number;
    numero: number;
    estado: string;
    indicaciones: string | null;
    lineas: { lineaClave: string; productoId: number; cantidad: number; nota: string | null }[];
  }[];
};

export async function verCuenta(app: App, cuentaId: number): Promise<CuentaHttp> {
  const res = await app.request(`/api/cuentas/${cuentaId}`);
  if (res.status !== 200) throw new Error(`cuenta ilegible: ${res.status}`);
  return (await res.json()) as CuentaHttp;
}

export function migrateUpTo(db: Database.Database, lastId: string): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY
    );
  `);
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const id = file.replace(/\.sql$/, "");
    if (id > lastId) break;
    if (db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(id)) continue;
    db.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
    db.prepare("INSERT INTO schema_migrations (id) VALUES (?)").run(id);
  }
}
