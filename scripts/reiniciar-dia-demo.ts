/**
 * Reinicia el día de demostración: borra TODA la data de ejemplo
 * (cuentas, órdenes, comandas, incidencias, precuentas, auditoría) y
 * siembra órdenes frescas repartidas en las últimas 2 horas, con etapas
 * variadas (enviado / en preparación / listo) y una precuenta emitida.
 *
 * Uso:   node --import tsx scripts/reiniciar-dia-demo.ts [usuario password]
 *        (por defecto admin/admin; requiere el servidor corriendo)
 *
 * No toca productos, mesas, inventario base, empleados ni sesiones:
 * solo el movimiento del día. Deja respaldo de la base junto al original.
 */
import Database from "better-sqlite3";
import { copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://127.0.0.1:8081";
const [usuario = "admin", password = "admin"] = process.argv.slice(2);
const DB = join(homedir(), "Library", "Application Support", "Restaurante", "data", "salon.sqlite");

const TABLAS_DEL_MOVIMIENTO = [
  "comanda_lineas",
  "comandas",
  "cocina_incidencias",
  "orden_linea_contornos",
  "orden_linea_inventario",
  "orden_lineas",
  "orden_correccion_lineas",
  "orden_correcciones",
  "precuentas",
  "cancelaciones_cuentas",
  "caja_handoffs",
  "pedido_lineas",
  "pedidos",
  "auditoria_anulaciones",
  "print_jobs",
  "ordenes",
  "cuentas",
];

const PIN = "1234";
const PEDIDOS: Array<{ mesa: number; haceMinutos: number; lineas: Array<[number, number]> }> = [
  { mesa: 3, haceMinutos: 10, lineas: [[9, 3], [16, 2]] },
  { mesa: 7, haceMinutos: 20, lineas: [[5, 2], [6, 1]] },
  { mesa: 5, haceMinutos: 30, lineas: [[12, 2], [10, 1]] },
  { mesa: 10, haceMinutos: 45, lineas: [[12, 2]] },
  { mesa: 6, haceMinutos: 55, lineas: [[17, 4], [8, 2]] },
  { mesa: 8, haceMinutos: 80, lineas: [[13, 2]] },
  { mesa: 9, haceMinutos: 100, lineas: [[11, 1], [7, 2]] },
  { mesa: 4, haceMinutos: 110, lineas: [[18, 2], [16, 1]] },
];

async function api(ruta: string, metodo = "GET", cuerpo?: unknown) {
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: cuerpo ? { "content-type": "application/json" } : undefined,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${metodo} ${ruta} -> ${res.status}: ${JSON.stringify(data)}`);
  return data as Record<string, unknown>;
}

const db = new Database(DB);
db.pragma("journal_mode = WAL");

// Respaldo antes de tocar nada.
const respaldo = `${DB}.bak-demo-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}`;
db.pragma("wal_checkpoint(TRUNCATE)");
copyFileSync(DB, respaldo);
console.log(`respaldo: ${respaldo}`);

// 1) Fuera todo el movimiento anterior (una sola transacción).
const limpiar = db.transaction(() => {
  for (const tabla of TABLAS_DEL_MOVIMIENTO) db.prepare(`DELETE FROM ${tabla}`).run();
});
limpiar();
console.log("data de ejemplo eliminada");

// 2) Sesión admin para sembrar por la API (así quedan consistentes con
//    inventario, comandas y auditoría).
const sesion = (await api("/api/sesion/abrir", "POST", { usuario, password })) as { abierta?: boolean };
if (!sesion.abierta) throw new Error("no se pudo abrir sesión admin");
const galleta = (await fetch(`${BASE}/api/sesion/abrir`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ usuario, password }),
}).then((r) => r.headers.get("set-cookie"))) ?? "";
const galletaCorta = galleta.split(";")[0];

async function apiConSesion(ruta: string, metodo: string, cuerpo?: unknown) {
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", cookie: galletaCorta },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${metodo} ${ruta} -> ${res.status}: ${JSON.stringify(data)}`);
  return data as Record<string, number | string | boolean>;
}

// 3) Órdenes frescas, una por mesa.
const sembradas: Array<{ cuentaId: number; comandaId: number; mesa: number; haceMinutos: number }> = [];
for (const pedido of PEDIDOS) {
  const r = (await apiConSesion("/api/ordenes", "POST", {
    mesaId: pedido.mesa,
    claveIdempotencia: `demo-${new Date().toISOString().slice(0, 13)}-${pedido.mesa}-${pedido.haceMinutos}`,
    pin: PIN,
    lineas: pedido.lineas.map(([productoId, cantidad]) => ({ productoId, cantidad, nota: "" })),
    indicaciones: "",
  })) as { cuentaId: number; comandaId: number };
  sembradas.push({ cuentaId: r.cuentaId, comandaId: r.comandaId, mesa: pedido.mesa, haceMinutos: pedido.haceMinutos });
}
console.log(`${sembradas.length} órdenes creadas`);

// 4) Retro-fechar a lo pedido (formato ISO con T).
const retro = db.transaction(() => {
  for (const fila of sembradas) {
    const hace = (min: number) => new Date(Date.now() - min * 60000).toISOString();
    db.prepare("UPDATE cuentas SET abierta_en = ? WHERE id = ?").run(hace(fila.haceMinutos), fila.cuentaId);
    db.prepare("UPDATE ordenes SET creada_en = ? WHERE cuenta_id = ?").run(hace(fila.haceMinutos), fila.cuentaId);
    db.prepare("UPDATE comandas SET creada_en = ? WHERE id = ?").run(hace(fila.haceMinutos), fila.comandaId);
  }
});
retro();
console.log("fechas repartidas en las últimas 2 horas");

// 5) Etapas variadas y una precuenta, igual que un servicio real.
for (const fila of sembradas) {
  if (fila.mesa === 5) await apiConSesion(`/api/kds/comandas/${fila.comandaId}/etapa`, "POST", { etapa: "en_proceso" });
  if (fila.mesa === 6 || fila.mesa === 9) await apiConSesion(`/api/kds/comandas/${fila.comandaId}/etapa`, "POST", { etapa: "listo" });
}
const mesa10 = sembradas.find((fila) => fila.mesa === 10);
if (mesa10) await apiConSesion(`/api/cuentas/${mesa10.cuentaId}/precuenta`, "POST", { pin: PIN });

const total = db.prepare("SELECT COUNT(*) AS n FROM cuentas").get() as { n: number };
console.log(`día de demostración reiniciado: ${total.n} cuentas activas, todo del día de hoy`);
db.close();
