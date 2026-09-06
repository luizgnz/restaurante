/**
 * Carga las fotos de la carta a la base de datos (productos.foto_data).
 *
 * Lee assets/fotos-carta/manifest.json (producto → archivo + fuente/licencia),
 * reescala cada imagen a 640 px, la comprime a JPEG ~70 con `sips` (macOS) y
 * guarda una data URL en el producto cuyo nombre coincida. Idempotente:
 * puede correr cuantas veces sea necesario.
 *
 * Uso:   node --import tsx scripts/cargar-fotos-carta.ts
 *
 * No toca nada más de la base; los productos sin foto en assets quedan como
 * están (el seed les pone letra de relleno solo al crearlos).
 */
import Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "..");
const CARPETA = join(RAIZ, "assets", "fotos-carta");
const MANIFEST = join(CARPETA, "manifest.json");
const DB = join(homedir(), "Library", "Application Support", "Restaurante", "data", "salon.sqlite");

type Entrada = { producto: string; archivo: string; fuente: string; licencia: string };

if (!existsSync(MANIFEST)) {
  console.error(`No está ${MANIFEST}. Revisa assets/fotos-carta/.`);
  process.exit(1);
}

const manifest: Entrada[] = JSON.parse(readFileSync(MANIFEST, "utf8"));
const disponibles = new Set(readdirSync(CARPETA).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)));

// Respaldo de la base junto al original, con checkpoint previo de WAL.
const db = new Database(DB);
db.pragma("wal_checkpoint(TRUNCATE)");
db.close();
const respaldo = `${DB}.bak-fotos-${new Date().toISOString().slice(0, 10)}`;
copyFileSync(DB, respaldo);

const conector = new Database(DB);
const buscar = conector.prepare("SELECT id FROM productos WHERE nombre = ?");
const actualizar = conector.prepare("UPDATE productos SET foto_data = ? WHERE id = ?");

const tmp = mkdtempSync(join(tmpdir(), "fotos-carta-"));
let cargadas = 0;
const sinFoto: string[] = [];

for (const entrada of manifest) {
  if (!disponibles.has(entrada.archivo)) {
    sinFoto.push(entrada.producto);
    continue;
  }
  const comprimida = join(tmp, entrada.archivo.replace(/\.\w+$/, ".jpg"));
  try {
    execFileSync("sips", [
      "-Z", "640",
      "-s", "format", "jpeg",
      "-s", "formatOptions", "70",
      join(CARPETA, entrada.archivo),
      "--out", comprimida,
    ], { stdio: "pipe" });
  } catch (err) {
    console.error(`✗ ${entrada.producto}: sips falló con ${entrada.archivo}`);
    sinFoto.push(entrada.producto);
    continue;
  }
  const dataUrl = `data:image/jpeg;base64,${readFileSync(comprimida).toString("base64")}`;
  const fila = buscar.get(entrada.producto) as { id: number } | undefined;
  if (!fila) {
    console.error(`✗ ${entrada.producto}: no hay producto con ese nombre en la base`);
    sinFoto.push(entrada.producto);
    continue;
  }
  actualizar.run(dataUrl, fila.id);
  cargadas += 1;
  console.log(`✓ ${entrada.producto} ← ${entrada.archivo} (${(readFileSync(comprimida).length / 1024).toFixed(0)} KB) · ${entrada.licencia}`);
}

conector.close();
console.log(`\n${cargadas} fotos cargadas · respaldo en ${respaldo}`);
if (sinFoto.length > 0) console.log(`Sin foto: ${sinFoto.join(", ")}`);
