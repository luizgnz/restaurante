# Núcleo POS v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar un servidor Node local + SPA táctil en español que complete el circuito operativo: mesa → PIN + enviar cocina (KDS + job ESC/POS) → PIN + precuenta en papel → PIN avanzado + enviar a caja (firma inventario, libera mesa), sin cobro ni DTE.

**Architecture:** Un proceso Node (Hono) sirve API y estáticos. SQLite WAL es la única verdad. La lógica de negocio vive en `src/modules/*` (funciones puras + repositorio SQLite). Las impresoras se hablan por un puerto `PrinterPort`; en tests es un mock. La UI Vite/React consume la API. Datos en `RESTAURANTE_DATA_DIR` (tests) o rutas OS de la spec.

**Tech Stack:** Node 22+, TypeScript ESM, Hono, better-sqlite3, argon2, Vitest, Vite, React 19.

## Global Constraints

- TypeScript de punta a punta; Node **22 LTS**; `"type": "module"`.
- Dependencias **MIT/Apache** solamente. CI (script `npm run licenses`) falla si entra GPL/AGPL.
- Sin Electron. Sin cobro, cajón, arqueo ni boleta/factura SII. Precuenta ≠ DTE.
- SQLite: `PRAGMA journal_mode=WAL;` y `PRAGMA synchronous=FULL;`. En darwin además `PRAGMA fullfsync=ON`.
- Rutas de datos: Windows `C:\ProgramData\Restaurante\`, macOS `/Library/Application Support/Restaurante/`. El servicio **no** usa `cwd` para la BD. Tests y dev: `RESTAURANTE_DATA_DIR`.
- PIN: Argon2id. Enviar cocina, emitir precuenta y enviar a caja **rechazan** sin PIN válido en ese request.
- Default inventario: `reserva_al_enviar_firme_al_enviar_caja`.
- Default puerto: `8080`. UI idioma: **español**.
- Complementos v1: lista vacía y exactamente estas dos frases, en este orden: **No hay plugins para mostrar** luego **No hay plugins disponibles**.
- Impresión: el servidor encola jobs; fallo de impresora no deshace el acto de negocio.
- Commits: **no** crear commits a menos que el usuario lo pida. Saltar pasos `git commit` del plan.
- No implementar en `main` sin rama: usar `feat/nucleo-pos-v1`.

---

## File structure

| Path | Responsibility |
| --- | --- |
| `package.json` | App única: scripts `test`, `dev`, `start`, `build`, `licenses`. |
| `tsconfig.json` | Strict ESM, `src` + `ui` + `test`. |
| `vitest.config.ts` | Tests Node; include `test/**/*.test.ts`. |
| `src/index.ts` | Arranque: paths → migrate → listen. |
| `src/paths.ts` | Directorios programa/datos por OS. |
| `src/config.ts` | Lee/escribe `config.json` con defaults. |
| `src/license.ts` | Verifica `licencia.json` firmada Ed25519. |
| `src/db/open.ts` | Abre SQLite con WAL/FULL. |
| `src/db/migrate.ts` | Aplica `schema_migrations`. |
| `src/db/migrations/001_init.sql` | Esquema v1 núcleo. |
| `src/http/app.ts` | App Hono: rutas API + estáticos. |
| `src/print/types.ts` | `PrinterPort`, `PrintJobKind`. |
| `src/print/queue.ts` | Encola, reintenta, despacha. |
| `src/print/escpos.ts` | Bytes de comanda / precuenta / anulación. |
| `src/modules/empleados/` | Hash PIN, derechos, prueba de PIN. |
| `src/modules/salon/` | Pisos, mesas, ocupación. |
| `src/modules/productos/` | Carta, receta un nivel, armable. |
| `src/modules/inventario/` | on_hand, reserved, available, asientos. |
| `src/modules/pedidos/` | Pedido, líneas, enviar. |
| `src/modules/kds/` | Comandas y etapas. |
| `src/modules/precuenta/` | Snapshot, emitir, reimprimir. |
| `src/modules/caja/` | Handoff `en_caja`. |
| `src/modules/complementos/` | Lista vacía + frases fijas. |
| `ui/` | SPA React táctil. |
| `test/` | Vitest: unidad, sistema, WAL, plugins UI. |
| `scripts/check-licenses.mjs` | Inventario SPDX permitido. |

Fuera de **este** plan (planes posteriores): Inno Setup, `.pkg`, WinSW/launchd, portal dueña, extra nube AES/R2, servidor de updates, transferir/unir/partir, Playwright, multi-estación bar.

---

### Task 1: Scaffold + rutas de datos

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/paths.ts`, `test/paths.test.ts`
- Test: `test/paths.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `dataDir(env, platform): string`, `programDir(env, platform): string`, `salonDbPath(env, platform): string`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { dataDir, programDir, salonDbPath } from "../src/paths.ts";

describe("paths", () => {
  it("usa RESTAURANTE_DATA_DIR cuando está definido", () => {
    const env = { RESTAURANTE_DATA_DIR: "/tmp/rest-test" };
    expect(dataDir(env, "darwin")).toBe("/tmp/rest-test");
    expect(salonDbPath(env, "darwin")).toBe("/tmp/rest-test/data/salon.sqlite");
  });

  it("en darwin usa Application Support si no hay override", () => {
    expect(dataDir({}, "darwin")).toBe("/Library/Application Support/Restaurante");
    expect(programDir({}, "darwin")).toBe("/usr/local/restaurante");
  });

  it("en win32 usa ProgramData si no hay override", () => {
    const env = { PROGRAMDATA: "C:\\ProgramData", PROGRAMFILES: "C:\\Program Files" };
    expect(dataDir(env, "win32")).toBe("C:\\ProgramData\\Restaurante");
    expect(programDir(env, "win32")).toBe("C:\\Program Files\\Restaurante");
  });

  it("nunca resuelve la BD desde cwd", () => {
    const env = { RESTAURANTE_DATA_DIR: "/var/restaurante" };
    expect(salonDbPath(env, "darwin")).not.toContain(process.cwd());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/paths.test.ts`
Expected: FAIL — módulo `src/paths.ts` no existe o `npm` no está inicializado. Crear `package.json` mínimo **después** de confirmar que el test está escrito, no antes de la lógica: el primer `npm test` puede fallar por falta de `package.json`; eso es el RED de scaffold. Tras `npm install`, el test debe fallar con `Cannot find module '../src/paths.ts'`.

`package.json`:

```json
{
  "name": "restaurante",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "tsx src/index.ts",
    "build": "tsc -p tsconfig.json --noEmit && vite build --config ui/vite.config.ts",
    "start": "node --import tsx src/index.ts",
    "licenses": "node scripts/check-licenses.mjs"
  }
}
```

DevDependencies iniciales: `typescript`, `vitest`, `tsx`. No añadir `better-sqlite3` hasta Task 3.

`tsconfig.json`: `"strict": true`, `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `"target": "ES2022"`, `"allowImportingTsExtensions": true`, `"noEmit": true`.

`.gitignore`: `node_modules/`, `dist/`, `ui/dist/`, `*.sqlite*`, `.env`, `.superpowers/`.

- [ ] **Step 3: Write minimal implementation**

```typescript
import path from "node:path";

export type Env = NodeJS.ProcessEnv;
export type Plat = NodeJS.Platform;

export function dataDir(env: Env = process.env, platform: Plat = process.platform): string {
  if (env.RESTAURANTE_DATA_DIR) return env.RESTAURANTE_DATA_DIR;
  if (platform === "win32") {
    const root = env.PROGRAMDATA ?? "C:\\ProgramData";
    return path.join(root, "Restaurante");
  }
  return "/Library/Application Support/Restaurante";
}

export function programDir(env: Env = process.env, platform: Plat = process.platform): string {
  if (env.RESTAURANTE_PROGRAM_DIR) return env.RESTAURANTE_PROGRAM_DIR;
  if (platform === "win32") {
    const root = env.PROGRAMFILES ?? "C:\\Program Files";
    return path.join(root, "Restaurante");
  }
  return "/usr/local/restaurante";
}

export function salonDbPath(env: Env = process.env, platform: Plat = process.platform): string {
  return path.join(dataDir(env, platform), "data", "salon.sqlite");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/paths.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

Saltar (el usuario no pidió commit).

---

### Task 2: config.json con defaults de restaurante

**Files:**
- Create: `src/config.ts`, `test/config.test.ts`
- Test: `test/config.test.ts`

**Interfaces:**
- Consumes: `dataDir` de Task 1
- Produces: `AppConfig`, `defaultConfig()`, `loadConfig(dir)`, `saveConfig(dir, cfg)`, `configPath(dir)`

```typescript
export type PoliticaInventario =
  | "descuento_al_enviar"
  | "reserva_al_enviar_firme_al_precuenta"
  | "reserva_al_enviar_firme_al_enviar_caja";

export type AppConfig = {
  puerto: number;
  extra_nube: boolean;
  acceso_directo: boolean;
  url_updates: string;
  politica_inventario: PoliticaInventario;
  bloqueo_sin_stock: "permitir" | "avisar" | "bloquear";
  pin_al_enviar: boolean;
  pin_al_emitir_precuenta: boolean;
  pin_al_enviar_caja: boolean;
  enviar_a_caja_requiere_avanzado: boolean;
  precuenta_obligatoria_antes_de_caja: boolean;
  liberar_mesa_cuando: "al_enviar_a_caja" | "manual";
  bloqueo_inactividad_seg: number;
};
```

- [ ] **Step 1: Write the failing test**

```typescript
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig, loadConfig, saveConfig } from "../src/config.ts";

describe("config", () => {
  it("default: puerto 8080, extra nube off, inventario reserva→firme en caja", () => {
    const c = defaultConfig();
    expect(c.puerto).toBe(8080);
    expect(c.extra_nube).toBe(false);
    expect(c.acceso_directo).toBe(false);
    expect(c.politica_inventario).toBe("reserva_al_enviar_firme_al_enviar_caja");
    expect(c.pin_al_enviar).toBe(true);
    expect(c.pin_al_emitir_precuenta).toBe(true);
    expect(c.pin_al_enviar_caja).toBe(true);
    expect(c.enviar_a_caja_requiere_avanzado).toBe(true);
    expect(c.precuenta_obligatoria_antes_de_caja).toBe(true);
    expect(c.liberar_mesa_cuando).toBe("al_enviar_a_caja");
    expect(c.bloqueo_inactividad_seg).toBe(60);
  });

  it("crea config.json con defaults si no existe", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rest-cfg-"));
    const loaded = loadConfig(dir);
    expect(loaded.puerto).toBe(8080);
    const raw = JSON.parse(readFileSync(path.join(dir, "config.json"), "utf8"));
    expect(raw.extra_nube).toBe(false);
  });

  it("persiste cambios de puerto", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rest-cfg-"));
    const c = loadConfig(dir);
    saveConfig(dir, { ...c, puerto: 9090 });
    expect(loadConfig(dir).puerto).toBe(9090);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/config.test.ts`
Expected: FAIL `Cannot find module '../src/config.ts'`

- [ ] **Step 3: Write minimal implementation**

`loadConfig`: si no hay archivo, `saveConfig(dir, defaultConfig())` y devolver defaults. Merge de claves faltantes con defaults (instalación antigua).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit** — saltar.

---

### Task 3: SQLite WAL + migraciones

**Files:**
- Create: `src/db/open.ts`, `src/db/migrate.ts`, `src/db/migrations/001_init.sql`, `test/db.test.ts`
- Test: `test/db.test.ts`

**Interfaces:**
- Consumes: `salonDbPath`
- Produces: `openSalonDb(filePath, platform): Database.Database`, `migrate(db): void`

Dependencia runtime: `better-sqlite3` (MIT). Types: `@types/better-sqlite3`.

- [ ] **Step 1: Write the failing test**

```typescript
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { migrate } from "../src/db/migrate.ts";
import { openSalonDb } from "../src/db/open.ts";

describe("db", () => {
  it("abre con WAL y synchronous FULL", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rest-db-"));
    mkdirSync(path.join(dir, "data"), { recursive: true });
    const db = openSalonDb(path.join(dir, "data", "salon.sqlite"), "linux");
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(Number(db.pragma("synchronous", { simple: true }))).toBe(2); // FULL
    db.close();
  });

  it("en darwin activa fullfsync", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rest-db-"));
    mkdirSync(path.join(dir, "data"), { recursive: true });
    const db = openSalonDb(path.join(dir, "data", "salon.sqlite"), "darwin");
    expect(Number(db.pragma("fullfsync", { simple: true }))).toBe(1);
    db.close();
  });

  it("migrate crea schema_migrations y tablas núcleo", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rest-db-"));
    mkdirSync(path.join(dir, "data"), { recursive: true });
    const db = openSalonDb(path.join(dir, "data", "salon.sqlite"), "linux");
    migrate(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const names = tables.map((t) => t.name);
    for (const t of ["schema_migrations", "empleados", "pisos", "mesas", "productos", "receta_lineas", "stock", "pedidos", "pedido_lineas", "comandas", "comanda_lineas", "print_jobs", "precuentas", "caja_handoffs"]) {
      expect(names).toContain(t);
    }
    db.close();
  });

  it("migrate es idempotente", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rest-db-"));
    mkdirSync(path.join(dir, "data"), { recursive: true });
    const db = openSalonDb(path.join(dir, "data", "salon.sqlite"), "linux");
    migrate(db);
    migrate(db);
    const n = db.prepare("SELECT count(*) AS c FROM schema_migrations").get() as { c: number };
    expect(n.c).toBe(1);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/db.test.ts`
Expected: FAIL módulo ausente.

- [ ] **Step 3: Write minimal implementation**

`openSalonDb`: `mkdirSync` del directorio padre; `new Database(filePath)`; pragmas; si `platform === "darwin"` entonces `fullfsync=ON`.

`001_init.sql` — columnas mínimas (todas las PK `INTEGER PRIMARY KEY`):

- `empleados(id, nombre, pin_hash, derecho TEXT CHECK IN ('minimo','basico','avanzado'), activo INTEGER)`
- `pisos(id, nombre)`
- `mesas(id, piso_id, numero, asientos, activa)`
- `categorias_pos(id, nombre, estacion)`
- `productos(id, nombre, precio_centavos INTEGER, categoria_id, tipo_consumo TEXT, disponible_en_pos, activo)`
- `receta_lineas(id, producto_id, ingrediente_id, cantidad_real)`
- `stock(producto_id PK, on_hand_real, reserved_real)`
- `pedidos(id, mesa_id NULL, preset TEXT, cubiertos, estado, mesero_id, abierto_en)`
- `pedido_lineas(id, pedido_id, producto_id, cantidad, nota, estado, precio_centavos)`
- `comandas(id, pedido_id, envio_n, mesero_id, creada_en)`
- `comanda_lineas(id, comanda_id, pedido_linea_id, etapa TEXT)`
- `print_jobs(id, kind TEXT, payload TEXT, status TEXT, attempts, last_error, created_en)`
- `precuentas(id, pedido_id, numero, vigente, mesero_id, snapshot_json, emitida_en)`
- `caja_handoffs(id, pedido_id, precuenta_id, mesero_id, snapshot_json, creado_en)`
- `schema_migrations(id TEXT PRIMARY KEY)`

Precios en **centavos enteros** (CLP sin decimales: 1 peso = 1 centavo conceptual; usar enteros para no flotar). En UI se muestran como pesos enteros.

`migrate`: leer SQL, `db.exec`, insertar `001_init`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/db.test.ts`
Expected: PASS

- [ ] **Step 5: Commit** — saltar.

---

### Task 4: Licencia firmada Ed25519

**Files:**
- Create: `src/license.ts`, `test/license.test.ts`
- Test: `test/license.test.ts`

**Interfaces:**
- Produces: `LicensePayload { localId: string; extras: { nube: boolean }; caducidad: string }`, `signLicense(payload, secretKey)`, `verifyLicense(fileJson, publicKey): LicensePayload`, `loadLicense(dir, publicKey)`

Formato archivo `licencia.json`: `{ "payload": { ... }, "sig": "<base64>" }` sobre `JSON.stringify(payload)` UTF-8. Firma: `crypto.sign(null, data, { key: privateKey, dsaEncoding: 'ieee-p1363' })` con Ed25519 (`crypto.generateKeyPairSync("ed25519")`).

Sin internet: `verifyLicense` **no** hace fetch. Caducidad pasada: igual devuelve payload (el salón no se bloquea); `licenseWarnings(payload, now): string[]` incluye aviso si `now > caducidad`.

- [ ] **Step 1: Write the failing test**

```typescript
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { licenseWarnings, signLicense, verifyLicense } from "../src/license.ts";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

describe("license", () => {
  const payload = { localId: "local-1", extras: { nube: false }, caducidad: "2099-01-01" };

  it("acepta firma válida", () => {
    const file = signLicense(payload, privateKey);
    expect(verifyLicense(file, publicKey)).toEqual(payload);
  });

  it("rechaza firma inválida", () => {
    const file = signLicense(payload, privateKey);
    file.sig = Buffer.alloc(64).toString("base64");
    expect(() => verifyLicense(file, publicKey)).toThrow(/firma/i);
  });

  it("caducada no bloquea: verify ok y warning", () => {
    const p = { ...payload, caducidad: "2020-01-01" };
    const file = signLicense(p, privateKey);
    expect(verifyLicense(file, publicKey).localId).toBe("local-1");
    expect(licenseWarnings(p, new Date("2026-08-20"))).toContain("licencia_caducada");
  });
});
```

- [ ] **Step 2: Run** `npm test -- test/license.test.ts` — FAIL módulo ausente.

- [ ] **Step 3: Implement** `src/license.ts` como arriba.

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit** — saltar.

En arranque (Task 6): si no hay `licencia.json`, el servidor **arranca igual** en modo desarrollo con warning `sin_licencia` (el salón de demo no se apaga). Producción del instalador copiará la licencia; no es bloqueo de API de sala.

---

### Task 5: Empleados + Argon2id + prueba de PIN

**Files:**
- Create: `src/modules/empleados/pin.ts`, `src/modules/empleados/empleados.ts`, `test/empleados.test.ts`
- Test: `test/empleados.test.ts`

**Interfaces:**
- Produces:
  - `hashPin(pin: string): Promise<string>`
  - `verifyPin(pin: string, hash: string): Promise<boolean>`
  - `crearEmpleado(db, { nombre, pin, derecho }): Promise<{ id: number }>`
  - `probarPin(db, pin: string): Promise<Empleado | null>` — el primer empleado activo cuyo hash coincida
  - `exigirPin(db, pin: string, accion: "enviar" | "precuenta" | "caja"): Promise<Empleado>`
    - PIN vacío o incorrecto → throw `PinError` con código `pin_invalido`
    - derecho `minimo` en `enviar` o `precuenta` → `sin_derecho`
    - `caja` exige `avanzado`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { hashPin, verifyPin } from "../src/modules/empleados/pin.ts";
import { crearEmpleado, exigirPin } from "../src/modules/empleados/empleados.ts";
import { openTestDb } from "./helpers.ts";

describe("empleados", () => {
  it("hash no guarda el PIN en claro", async () => {
    const h = await hashPin("1234");
    expect(h).not.toContain("1234");
    expect(await verifyPin("1234", h)).toBe(true);
    expect(await verifyPin("0000", h)).toBe(false);
  });

  it("exigirPin envía con básico", async () => {
    const db = openTestDb();
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const e = await exigirPin(db, "1234", "enviar");
    expect(e.nombre).toBe("Ana");
  });

  it("PIN incorrecto no identifica", async () => {
    const db = openTestDb();
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    await expect(exigirPin(db, "9999", "enviar")).rejects.toMatchObject({ codigo: "pin_invalido" });
  });

  it("mínimo no puede enviar ni precuenta; avanzado sí caja", async () => {
    const db = openTestDb();
    await crearEmpleado(db, { nombre: "Luis", pin: "1111", derecho: "minimo" });
    await crearEmpleado(db, { nombre: "Jefa", pin: "2222", derecho: "avanzado" });
    await expect(exigirPin(db, "1111", "enviar")).rejects.toMatchObject({ codigo: "sin_derecho" });
    await expect(exigirPin(db, "1111", "precuenta")).rejects.toMatchObject({ codigo: "sin_derecho" });
    await expect(exigirPin(db, "1111", "caja")).rejects.toMatchObject({ codigo: "sin_derecho" });
    const j = await exigirPin(db, "2222", "caja");
    expect(j.nombre).toBe("Jefa");
  });
});
```

`test/helpers.ts`:

```typescript
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "../src/db/migrate.ts";
import { openSalonDb } from "../src/db/open.ts";

export function openTestDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "rest-"));
  mkdirSync(path.join(dir, "data"), { recursive: true });
  const db = openSalonDb(path.join(dir, "data", "salon.sqlite"), "linux");
  migrate(db);
  return db;
}
```

Dependencia: `argon2` (MIT). `hashPin` usa `argon2.hash(pin, { type: argon2.argon2id })`.

- [ ] **Step 2: FAIL** — módulos ausentes.

- [ ] **Step 3: Implement** `PinError extends Error { codigo: "pin_invalido" | "sin_derecho" }`. `probarPin` itera empleados activos (N pequeño).

- [ ] **Step 4: PASS** `npm test -- test/empleados.test.ts`

- [ ] **Step 5: Commit** — saltar.

---

### Task 6: Productos, receta un nivel, armable

**Files:**
- Create: `src/modules/productos/productos.ts`, `src/modules/inventario/cifras.ts`, `test/armable.test.ts`
- Test: `test/armable.test.ts`

**Interfaces:**
- `available(onHand: number, reserved: number): number` → `onHand - reserved` (no negativo en display; internamente puede ser 0)
- `availableToAssemble(componentes: { cantidadReceta: number; disponible: number }[]): number` → `Math.floor(min(disponible/cantidadReceta))`; receta vacía → `Infinity` (sin control de stock)
- Hamburguesa spec: 1 pan + 150 g carne + 1 queso + 20 g lechuga

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { available, availableToAssemble } from "../src/modules/inventario/cifras.ts";

describe("cifras", () => {
  it("disponible = a mano - reservado", () => {
    expect(available(10, 3)).toBe(7);
    expect(available(2, 2)).toBe(0);
  });

  it("armable hamburguesa es el mínimo de componentes", () => {
    const n = availableToAssemble([
      { cantidadReceta: 1, disponible: 10 },    // pan
      { cantidadReceta: 150, disponible: 750 }, // carne → 5
      { cantidadReceta: 1, disponible: 8 },     // queso
      { cantidadReceta: 20, disponible: 200 },  // lechuga → 10
    ]);
    expect(n).toBe(5);
  });

  it("receta vacía no limita", () => {
    expect(availableToAssemble([])).toBe(Number.POSITIVE_INFINITY);
  });
});
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3:**

```typescript
export function available(onHand: number, reserved: number): number {
  return onHand - reserved;
}

export function availableToAssemble(
  componentes: { cantidadReceta: number; disponible: number }[],
): number {
  if (componentes.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(
    ...componentes.map((c) => Math.floor(c.disponible / c.cantidadReceta)),
  );
}
```

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit** — saltar.

También: `seedCartaDemo(db)` en `src/modules/productos/seed.ts` (usado por tests de sistema y `dev`): ingredientes pan/carne/queso/lechuga/jugo/agua; productos Hamburguesa (receta), Jugo (almacenable_unitario), Agua con gas (almacenable_unitario); stock suficiente para el ejemplo 5+2+3. Cubrir con test `seed deja armable hamburguesa >= 5`.

---

### Task 7: Inventario reserva y firme según política

**Files:**
- Create: `src/modules/inventario/asientos.ts`, `test/inventario.test.ts`
- Test: `test/inventario.test.ts`

**Interfaces:**
- `reservarPorEnvio(db, lineas: { productoId, cantidad }[], politica): void`
- `firmar(db, lineas, momento: "enviar" | "precuenta" | "caja", politica): void`
- `liberarReserva(db, lineas): void`
- Default `reserva_al_enviar_firme_al_enviar_caja`: enviar incrementa `reserved`; caja baja `on_hand` y `reserved`. Precuenta **no** mueve stock.

Usar transacción `db.transaction(() => { ... })()`.

- [ ] **Step 1: Test**

```typescript
it("default: enviar reserva, precuenta no firma, caja firma", () => {
  // seed hamburguesa con 10 panes on_hand 0 reserved
  // reservar 5 hamburguesas → reserved pan = 5, on_hand = 10, available = 5, armable baja
  // firmar precuenta → igual
  // firmar caja → on_hand 5, reserved 0
});

it("descuento_al_enviar baja on_hand al enviar", () => {
  // on_hand 10 → 5, reserved 0
});
```

Implementar expandiendo receta un nivel (producto `receta_kit` usa `receta_lineas`; `almacenable_unitario` reserva el propio `producto_id`).

- [ ] **Step 2–4:** FAIL, implementar, PASS.

- [ ] **Step 5: Commit** — saltar.

---

### Task 8: Salón — pisos, mesas, abrir mesa

**Files:**
- Create: `src/modules/salon/salon.ts`, `test/salon.test.ts`
- Test: `test/salon.test.ts`

**Interfaces:**
- `estadoMesa(db, mesaId): "libre" | "ocupada" | "en_cocina" | "precuenta" | "en_caja"`
- `abrirMesa(db, { mesaId, cubiertos, preset, meseroId }): { pedidoId }` — exige cubiertos > 0; mesa libre
- `liberarMesa(db, mesaId)` si pedido vacío
- Pedido sin mesa: `abrirTab(db, { nombre, cubiertos, preset, meseroId })`

- [ ] **Step 1: Test** abrir mesa 7 cubiertos 4 → ocupada; segunda apertura de la misma mesa lanza `mesa_ocupada`. Liberar con pedido sin líneas → libre.

- [ ] **Step 2–5:** FAIL, implement, PASS, saltar commit.

---

### Task 9: Pedidos — líneas y enviar con PIN

**Files:**
- Create: `src/modules/pedidos/pedidos.ts`, `src/modules/kds/kds.ts`, `src/print/types.ts`, `src/print/queue.ts`, `src/print/escpos.ts`, `test/enviar.test.ts`
- Test: `test/enviar.test.ts`

**Interfaces:**
- `agregarLinea(db, pedidoId, { productoId, cantidad, nota? })` — sin PIN
- `enviarACocina(db, pedidoId, pin, printer: PrinterPort, cfg): Promise<{ comandaId, jobId }>`
  1. `exigirPin(..., "enviar")`
  2. transacción: líneas `nueva` → `enviada`; crear comanda + líneas KDS etapa `por_preparar`; `reservarPorEnvio`; encolar print job `comanda`
  3. **después** de commit, `queue.dispatch(printer)` — si printer tira, job queda `queued`/`failed`, **no** rollback de comanda
- PIN malo: no comanda, no job, no reserva
- `PrinterPort { print(bytes: Uint8Array): Promise<void> }`
- `MemoryPrinter` en tests: guarda `chunks: Uint8Array[]`; opción `fail: boolean`

Ticket ESC/POS (test sobre `renderComanda`): contiene mesa, nombre mesero, nombres de productos y cantidades. No hace falta impresora real.

- [ ] **Step 1: Test del ejemplo**

```typescript
it("mesa 7: 5 hamburguesas 2 jugos 3 aguas, PIN envía KDS y job; PIN malo no", async () => {
  // seed, abrir mesa 7, agregar lineas, exigirPin fail 0000
  // enviar con 1234 → comanda 1, print_jobs kind=comanda status sent o queued
  // stock reserved
});

it("impresora caída: comanda existe y job en cola", async () => {
  // MemoryPrinter fail:true
  // pedido enviado, print_jobs.status = 'queued' o 'failed', attempts >= 1
});
```

- [ ] **Step 2–5:** FAIL, implement, PASS, saltar commit.

`enviarACocina` actualiza `pedidos.mesero_id` al empleado del PIN (`atribuir_mesero_en = en_cada_envio`). Estado pedido: `enviado` si todas las líneas enviadas, si no `parcialmente_enviado`. Mesa pasa a `en_cocina`.

---

### Task 10: Precuenta con PIN y reimpresión

**Files:**
- Create: `src/modules/precuenta/precuenta.ts`, `test/precuenta.test.ts`
- Test: `test/precuenta.test.ts`

**Interfaces:**
- `emitirPrecuenta(db, pedidoId, pin, printer, cfg)` → `{ precuentaId, numero }`
  - PIN `precuenta`; snapshot JSON (líneas, precios, total, mesa, cubiertos, mesero); job `precuenta`; **no** llama `firmar` en política default
  - invalida precuentas previas del pedido (`vigente=0`)
- `reimprimirPrecuenta(db, precuentaId, printer)` — **sin** PIN; mismo `numero`; no nuevo inventario; job kind `precuenta` con flag reimpresion
- Si se agregan líneas después, `vigente` de la anterior queda 0 al emitir otra

- [ ] **Step 1: Test** emitir 5+2+3 total = 5*precioH + 2*jugo + 3*agua; reserved igual; reimprimir no cambia reserved ni numero; PIN inválido no crea fila.

- [ ] **Step 2–5:** FAIL, implement, PASS, saltar commit.

Precios demo: Hamburguesa 8900, Jugo 2500, Agua 1500 (centavos=pesos). Total esperado: `5*8900 + 2*2500 + 3*1500 = 54000`.

El snapshot incluye leyenda `"Esto no es boleta ni factura. El documento tributario lo emite caja."` para no confundir con SII.

---

### Task 11: Enviar a caja

**Files:**
- Create: `src/modules/caja/caja.ts`, `test/caja.test.ts`
- Test: `test/caja.test.ts`

**Interfaces:**
- `enviarACaja(db, pedidoId, pin, cfg)`
  - `exigirPin(..., "caja")` (avanzado)
  - si `precuenta_obligatoria_antes_de_caja` y no hay precuenta vigente → `precuenta_requerida`
  - si hay líneas `nueva` → `lineas_sin_enviar` (default bloquear)
  - transacción: `firmar(..., "caja")`; pedido `en_caja`; `caja_handoffs`; si `liberar_mesa_cuando === "al_enviar_a_caja"` mesa libre
  - no hay campos de pago

- [ ] **Step 1: Test** básico no puede; avanzado sí; stock on_hand baja; mesa libre; segundo envío `pedido_cerrado`. Sin precuenta vigente → error.

- [ ] **Step 2–5:** FAIL, implement, PASS, saltar commit.

---

### Task 12: HTTP API + servidor

**Files:**
- Create: `src/http/app.ts`, `src/index.ts`, `test/api.test.ts`
- Test: `test/api.test.ts`

Dependencias: `hono`, `@hono/node-server` (MIT).

**Interfaces — `createApp({ db, config, printer, publicKey })`**

| Método | Ruta | Cuerpo | Notas |
| --- | --- | --- | --- |
| GET | `/api/salud` | — | `{ ok: true }` |
| GET | `/api/mesas` | — | plano |
| POST | `/api/mesas/:id/abrir` | `{ cubiertos, pin }` | |
| POST | `/api/pedidos/:id/lineas` | `{ productoId, cantidad, nota? }` | sin PIN |
| POST | `/api/pedidos/:id/enviar` | `{ pin }` | |
| POST | `/api/pedidos/:id/precuenta` | `{ pin }` | |
| POST | `/api/precuentas/:id/reimprimir` | — | sin PIN |
| POST | `/api/pedidos/:id/enviar-caja` | `{ pin }` | |
| GET | `/api/kds` | — | tarjetas |
| GET | `/api/carta` | — | productos + armable |
| GET | `/api/complementos` | — | ver Task 13 |
| GET | `/api/empleados` | — | lista nombres+id, **sin** hash |

Errores: JSON `{ error: string, codigo: string }` status 400/403. Sin stack traces.

Test: `app.request` de Hono (sin listen) recorre el ejemplo mesa 7.

`src/index.ts`: `openSalonDb(salonDbPath())`, `migrate`, `loadConfig`, `createApp`, `serve({ port: config.puerto, hostname: "0.0.0.0" })`. Bind en todas las interfaces LAN; no documentar port-forward.

- [ ] **Step 1–5:** test API, FAIL, implement, PASS, saltar commit.

---

### Task 13: Complementos vacíos

**Files:**
- Create: `src/modules/complementos/complementos.ts`, `ui/src/pantallas/Complementos.tsx`, `test/complementos.test.ts`
- Test: `test/complementos.test.ts`

**Interfaces:**
- `listarPlugins(): []` siempre
- `mensajesVacios(): ["No hay plugins para mostrar", "No hay plugins disponibles"]`
- GET `/api/complementos` → `{ plugins: [], mensajes: esas dos frases }`

Test de unidad + test que el componente (render con `react-dom/server` o testing-library) incluye ambas frases en orden. Dependencia de test: `@testing-library/react` solo si hace falta; preferir `renderToStaticMarkup` para no añadir jsdom hasta la UI.

- [ ] **Step 1–5:** FAIL, implement, PASS, saltar commit.

---

### Task 14: SPA táctil mínimo + KDS

**Files:**
- Create: `ui/index.html`, `ui/vite.config.ts`, `ui/src/main.tsx`, `ui/src/App.tsx`, `ui/src/api.ts`, `ui/src/pantallas/Plano.tsx`, `ui/src/pantallas/Pedido.tsx`, `ui/src/pantallas/Kds.tsx`, `ui/src/pantallas/PinPad.tsx`, `ui/src/styles.css`
- Test: `test/escpos.test.ts` (bytes contienen mesa/mesero) ya cubierto; SPA sin Playwright en este plan. Verificar `vite build` exitoso.

**UI v1 de este plan:**
- Plano de mesas (botones ≥ 48px)
- Pedido: categorías, +cantidad, Enviar / Precuenta / Enviar a caja → PinPad
- KDS: tarjetas por comanda, avanzar etapa
- Complementos: las dos frases
- Layout estrecho apilado; español

`src/http/app.ts` sirve `ui/dist` en `/` si existe.

Vite `base: "./"`. Proxy `/api` → `http://127.0.0.1:8080` en dev.

- [ ] **Step 1:** test `renderComanda` incluye `Mesa 7` y nombre del mesero (si no está en Task 9).
- [ ] **Step 2–4:** UI + `npm run build` exitoso.
- [ ] **Step 5: Commit** — saltar.

---

### Task 15: Resiliencia WAL + sistema de circuito

**Files:**
- Create: `test/wal.test.ts`, `test/circuito.test.ts`
- Test: esos archivos

- [ ] **Step 1: WAL test**

Abrir db, `db.transaction` que inserta pedido y `process.kill` no es portable en el mismo proceso. En su lugar: ejecutar un script hijo `tsx test/fixtures/abort-tx.ts` que abre la BD, `BEGIN IMMEDIATE`, inserta, y `process.exit(1)` **antes** de COMMIT. El test padre reabre y comprueba que no hay pedido a medias (`count pedidos = 0`) y `pragma integrity_check = ok`.

- [ ] **Step 2: circuito.test.ts** — una sola función de negocio de alto nivel `recorridoMesa7(db, printer)` usada también por API: 5 hamburguesas, 2 jugos, 3 aguas; PIN 1234 enviar; PIN 1234 precuenta total 54000; PIN 2222 caja; mesa libre; on_hand coherente.

- [ ] **Step 3–4:** implementar fixture + PASS `npm test`
- [ ] **Step 5: Commit** — saltar.

---

### Task 16: Check de licencias npm

**Files:**
- Create: `scripts/check-licenses.mjs`, `test/licenses.test.ts` (opcional: spawn del script)
- Allowed: `MIT`, `Apache-2.0`, `ISC`, `BSD-2-Clause`, `BSD-3-Clause`, `0BSD`, `Unlicense`, `BlueOak-1.0.0`.

El script lee `node_modules` via `npm ls --json --all` o recorre `package.json` de cada dep directa y falla exit 1 si SPDX no está en la lista. No hace falta un crawler perfecto de transitives en v1: comprobar **dependencias directas** de `package.json` (dependencies + devDependencies).

- [ ] **Step 1–4:** script + `npm run licenses` exit 0
- [ ] **Step 5: Commit** — saltar.

---

## Self-review

**Spec coverage (este plan):**
- Appliance local, SQLite WAL, paths OS, config puerto/nube off: Tasks 1–3
- Licencia por local sin tumbar el salón: Task 4
- PIN Argon2id y PIN en enviar/precuenta/caja: Tasks 5, 9–11
- Inventario 4 cifras, receta un nivel, default reserva→caja: Tasks 6–7
- Salón mesa 7, pedidos, KDS, print queue, precuenta ≠ DTE, caja sin dinero: Tasks 8–12, 15
- Plugins frases vacías: Task 13
- UI táctil español: Task 14
- WAL abort: Task 15
- Licencias npm: Task 16

**Fuera de este plan (spec v1 restante):** instaladores Inno/pkg, WinSW/launchd, extra nube cifrada, portal dueña, updates firmados, transferir/unir/partir, cancelación+merma completa, cursos 2+, modificadores, Playwright, firewall LAN. Siguiente plan: `2026-08-20-empaque-nube-updates.md`.

**Placeholders:** ninguno intencional. `openTestDb` definido en Task 5.

**Tipos:** `PoliticaInventario`, `PrinterPort`, `exigirPin` acciones `"enviar" | "precuenta" | "caja"` usados igual en Tasks 5–12.

---

*Fin del plan. Ejecutar en rama `feat/nucleo-pos-v1`. No commitear salvo pedido explícito.*
