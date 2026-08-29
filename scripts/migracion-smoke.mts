// Ejercicio de migración legacy → cuentas sobre una copia, sin tocar el archivo vivo.
//
//   npx tsx scripts/migracion-smoke.mts [ruta/a/salon.sqlite]
//
// Con argumento: copia esa BD a un directorio temporal, aplica migraciones y
// convierte los pedidos; verifica el invariante de una cuenta activa por mesa.
// Sin argumento: arma una BD sintética con datos legacy representativos y
// verifica además totales e idempotencia.
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defaultConfig } from "../src/config.ts";
import { migrate } from "../src/db/migrate.ts";
import { openSalonDb } from "../src/db/open.ts";
import { totalEfectivoCuenta } from "../src/modules/cuentas/totales.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { migrarPedidosACuentas } from "../src/modules/migracion/pedidos-a-cuentas.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";

function fallar(msg: string): never {
  console.error(`FALLO: ${msg}`);
  process.exit(1);
}

function verificarInvariante(db: ReturnType<typeof openSalonDb>): void {
  const duplicadas = db
    .prepare(
      `SELECT mesa_id, count(*) AS n FROM cuentas
       WHERE estado IN ('abierta', 'precuenta_emitida')
       GROUP BY mesa_id HAVING count(*) > 1`,
    )
    .all() as unknown[];
  if (duplicadas.length > 0) fallar(`mesas con cuentas activas duplicadas: ${JSON.stringify(duplicadas)}`);
  console.log("Invariante: ninguna mesa con más de una cuenta activa. OK");
  const fk = db.pragma("foreign_key_check") as unknown[];
  if (fk.length > 0) fallar(`foreign_key_check: ${JSON.stringify(fk)}`);
  console.log("foreign_key_check sin violaciones. OK");
}

const origen = process.argv[2];
const dir = mkdtempSync(path.join(tmpdir(), "rest-mig-"));
const dbPath = path.join(dir, "data", "salon.sqlite");

if (origen) {
  copyFileSync(origen, dbPath);
  console.log(`Copia de ${origen} → ${dbPath}`);
  const db = openSalonDb(dbPath);
  db.pragma("foreign_keys = ON");
  migrate(db);
  const resultado = migrarPedidosACuentas(db, dir, defaultConfig());
  console.log("Informe de migración:", JSON.stringify(resultado));
  if (resultado.errores.length > 0) fallar(`errores: ${resultado.errores.join("; ")}`);
  verificarInvariante(db);
  db.close();
  console.log("MIGRACIÓN SOBRE COPIA REAL: TODO BIEN");
  process.exit(0);
}

const { openTestDb } = await import("../test/helpers.ts");
const db = openTestDb();
console.log("BD sintética (sin BD de desarrollo indicada):", dir);

const ids = seedCartaDemo(db);
const mesero = await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "avanzado" });
const ahora = new Date().toISOString();
const mesaDe = (numero: number) => (db.prepare("SELECT id FROM mesas WHERE numero = ?").get(numero) as { id: number }).id;

const insertPedido = db.prepare(
  `INSERT INTO pedidos (mesa_id, preset, cubiertos, estado, mesero_id, abierto_en, nota_privada, indicaciones)
   VALUES (?, 'salon', ?, ?, ?, ?, NULL, NULL)`,
);
const insertLinea = db.prepare(
  "INSERT INTO pedido_lineas (pedido_id, producto_id, cantidad, nota, estado, precio_centavos) VALUES (?, ?, ?, ?, ?, ?)",
);
const insertComanda = db.prepare(
  "INSERT INTO comandas (pedido_id, envio_n, mesero_id, creada_en, tipo) VALUES (?, ?, ?, ?, 'legacy')",
);
const insertComandaLinea = db.prepare(
  "INSERT INTO comanda_lineas (comanda_id, pedido_linea_id, etapa) VALUES (?, ?, ?)",
);

const p1 = Number(insertPedido.run(ids.mesa7, 4, "enviado", mesero.id, ahora).lastInsertRowid);
const l1a = Number(insertLinea.run(p1, ids.hamburguesa, 2, "sin cebolla", "enviada", 8900).lastInsertRowid);
const l1b = Number(insertLinea.run(p1, ids.jugo, 1, null, "enviada", 2500).lastInsertRowid);
const c1 = Number(insertComanda.run(p1, 1, mesero.id, ahora).lastInsertRowid);
insertComandaLinea.run(c1, l1a, "servido");
insertComandaLinea.run(c1, l1b, "listo");

const p2 = Number(insertPedido.run(mesaDe(1), 2, "precuenta_emitida", mesero.id, ahora).lastInsertRowid);
const l2 = Number(insertLinea.run(p2, ids.agua, 3, null, "enviada", 1500).lastInsertRowid);
const c2 = Number(insertComanda.run(p2, 1, mesero.id, ahora).lastInsertRowid);
insertComandaLinea.run(c2, l2, "listo");
const snapshot2 = JSON.stringify({ mesaNumero: 1, mesero: "Ana", cubiertos: 2, lineas: [], totalCentavos: 4500 });
db.prepare(
  "INSERT INTO precuentas (pedido_id, cuenta_id, numero, vigente, mesero_id, snapshot_json, emitida_en) VALUES (?, NULL, 1, 1, ?, ?, ?)",
).run(p2, mesero.id, snapshot2, ahora);

const p3 = Number(insertPedido.run(null, 1, "borrador", mesero.id, ahora).lastInsertRowid);
insertLinea.run(p3, ids.hamburguesa, 1, null, "nueva", 8900);
insertPedido.run(mesaDe(2), 2, "cancelado", mesero.id, ahora);

const resultado = migrarPedidosACuentas(db, dir, defaultConfig());
console.log("Informe de migración:", JSON.stringify(resultado));
if (resultado.errores.length > 0) fallar(`errores: ${resultado.errores.join("; ")}`);

verificarInvariante(db);

const cuentaP1 = db.prepare("SELECT id FROM cuentas WHERE legacy_pedido_id = ?").get(p1) as { id: number } | undefined;
const cuentaP2 = db.prepare("SELECT id FROM cuentas WHERE legacy_pedido_id = ?").get(p2) as { id: number } | undefined;
if (!cuentaP1 || !cuentaP2) fallar("faltan cuentas migradas para los pedidos enviados");
const total1 = totalEfectivoCuenta(db, cuentaP1.id);
const total2 = totalEfectivoCuenta(db, cuentaP2.id);
if (total1 !== 2 * 8900 + 2500) fallar(`total mesa 7: ${total1} ≠ 20300`);
if (total2 !== 4500) fallar(`total mesa 1: ${total2} ≠ 4500`);
console.log(`Totales conservados: mesa 7 = ${total1}, mesa 1 = ${total2}. OK`);

const segunda = migrarPedidosACuentas(db, dir, defaultConfig());
if (segunda.cuentas !== 0 || segunda.ordenes !== 0 || segunda.lineas !== 0 || segunda.errores.length > 0) {
  fallar(`segunda corrida convirtió de nuevo: ${JSON.stringify(segunda)}`);
}
console.log(`Idempotencia: segunda corrida no convierte nada (reexporta el borrador pendiente: ${segunda.borradoresExportados}). OK`);
db.close();
console.log("MIGRACIÓN DE HUMO: TODO BIEN");
