# Núcleo Cuenta → Órdenes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar la cuenta de mesa de sus órdenes, enviar a cocina únicamente cada orden/corrección nueva, guardar borradores en el navegador y mostrar la cuenta agrupada por órdenes.

**Architecture:** SQLite incorpora `cuentas`, `ordenes`, líneas y correcciones inmutables sin eliminar inicialmente las tablas legacy. El backend expone servicios transaccionales e idempotentes y adapta precuenta, caja, KDS e inventario al estado efectivo de la cuenta. React separa `CuentaMesa` de `ConstructorOrden`, persiste borradores en `localStorage` y usa modales para correcciones, PIN y creación de productos.

**Tech Stack:** TypeScript, Node.js, Hono, better-sqlite3, React, Vite, Vitest, lucide-react, SQLite.

## Global Constraints

- Una mesa se ocupa únicamente al enviar la primera orden; navegar o guardar un borrador no crea filas.
- Una cuenta activa pertenece a una mesa y contiene una o varias órdenes.
- Una orden enviada es inmutable; los cambios se guardan como correcciones.
- Editar o anular exige PIN y cocina recibe únicamente diferencias.
- Cualquier empleado con el derecho requerido puede actuar; no hay candado por mesero titular.
- La auditoría y la justificación de anulaciones son configurables y vienen apagadas.
- Los borradores viven únicamente en `localStorage`.
- Crear producto se muestra como modal interno.
- Reservas, bloqueo programado y el item Reservas quedan fuera de este plan.
- No eliminar tablas o endpoints legacy en esta entrega.
- No crear commits salvo solicitud explícita del usuario.

---

## File Map

**Create**

- `src/db/migrations/008_cuentas_ordenes.sql` — esquema paralelo del núcleo.
- `src/modules/cuentas/cuentas.ts` — consulta, apertura y cierre de cuentas.
- `src/modules/cuentas/totales.ts` — versión efectiva y totales.
- `src/modules/ordenes/ordenes.ts` — creación y lectura de órdenes.
- `src/modules/ordenes/correcciones.ts` — diffs, correcciones y anulaciones.
- `src/modules/ordenes/enviar.ts` — transacción de envío e idempotencia.
- `src/modules/migracion/pedidos-a-cuentas.ts` — backfill verificable.
- `src/http/rutas/cuentas.ts` — API de cuentas.
- `src/http/rutas/ordenes.ts` — API de órdenes/correcciones.
- `ui/src/lib/borradores.ts` — persistencia local.
- `ui/src/pantallas/ConstructorOrden.tsx` — captura reutilizable.
- `ui/src/pantallas/CuentaMesa.tsx` — cuenta agrupada.
- `ui/src/pantallas/ModalEditarOrden.tsx` — corrección completa y diferencias.
- `ui/src/pantallas/ModalCrearProducto.tsx` — wrapper modal.
- Tests: `test/cuentas.test.ts`, `test/ordenes.test.ts`, `test/correcciones.test.ts`, `test/migracion-pedidos.test.ts`, `test/borradores-local.test.ts`, `test/cuenta-mesa-ui.test.ts`, `test/modal-crear-producto-ui.test.ts`.

**Modify**

- `src/config.ts`
- `src/http/app.ts`
- `src/modules/kds/kds.ts`
- `src/modules/precuenta/precuenta.ts`
- `src/modules/caja/caja.ts`
- `src/modules/inventario/asientos.ts`
- `src/modules/salon/salon.ts`
- `src/print/types.ts`
- `src/print/escpos.ts`
- `ui/src/App.tsx`
- `ui/src/pantallas/Pedido.tsx` (retirar tras reemplazarlo)
- `ui/src/pantallas/Pedidos.tsx`
- `ui/src/pantallas/Barra.tsx`
- `ui/src/pantallas/Backend.tsx`
- `ui/src/pantallas/Opciones.tsx`
- `ui/src/styles.css`
- Tests de API, salón, envío, precuenta, caja, KDS y UI existentes.

---

### Task 1: Configuración de auditoría

**Files:**
- Modify: `src/config.ts`
- Modify: `src/http/app.ts`
- Modify: `ui/src/pantallas/Opciones.tsx`
- Test: `test/config.test.ts`
- Test: `test/opciones-api.test.ts`
- Test: `test/opciones-ui.test.ts`

**Interfaces:**
- Produces: `AppConfig.auditoria_anulaciones: boolean`
- Produces: `AppConfig.justificacion_anulacion: boolean`

- [x] **Step 1: Write failing config tests**

```typescript
it("desactiva auditoría y justificación por defecto", () => {
  const cfg = defaultConfig();
  expect(cfg.auditoria_anulaciones).toBe(false);
  expect(cfg.justificacion_anulacion).toBe(false);
});

it("no permite justificación activa sin auditoría", () => {
  const cfg = normalizarConfig({
    ...defaultConfig(),
    auditoria_anulaciones: false,
    justificacion_anulacion: true,
  });
  expect(cfg.justificacion_anulacion).toBe(false);
});
```

- [x] **Step 2: Run the focused tests and verify failure**

Run:

```bash
~/commands/bin/logged npx vitest run test/config.test.ts test/opciones-api.test.ts test/opciones-ui.test.ts
```

Expected: TypeScript/test failure because the new config fields and UI labels do not exist.

- [x] **Step 3: Add fields and normalization**

```typescript
export type AppConfig = {
  // existing fields
  auditoria_anulaciones: boolean;
  justificacion_anulacion: boolean;
};

export function normalizarConfig(cfg: AppConfig): AppConfig {
  return {
    ...sincronizarPinEnviar(cfg),
    justificacion_anulacion: cfg.auditoria_anulaciones && cfg.justificacion_anulacion,
  };
}
```

Defaults:

```typescript
auditoria_anulaciones: false,
justificacion_anulacion: false,
```

Expose both fields in `GET/POST /api/config`. Add two checkboxes to Seguridad; hide the second unless the first is active and force it false when audit is disabled.

- [x] **Step 4: Run focused tests**

Expected: all three test files pass.

- [x] **Step 5: Run typecheck**

```bash
~/commands/bin/logged npx tsc -p tsconfig.json --noEmit
```

Expected: exit 0.

---

### Task 2: Esquema paralelo Cuenta → Órdenes → Correcciones

**Files:**
- Create: `src/db/migrations/008_cuentas_ordenes.sql`
- Test: `test/db.test.ts`
- Test: `test/cuentas.test.ts`

**Interfaces:**
- Produces tables: `cuentas`, `ordenes`, `orden_lineas`, `orden_correcciones`, `orden_correccion_lineas`, `auditoria_anulaciones`
- Produces indexes: `cuenta_activa_mesa_unica`, `orden_numero_cuenta_unico`, `orden_idempotencia_unica`

- [x] **Step 1: Write failing schema tests**

```typescript
it("crea el esquema de cuentas y órdenes", () => {
  const db = openTestDb();
  const tablas = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table'"
  ).all() as { name: string }[];
  expect(tablas.map((x) => x.name)).toEqual(
    expect.arrayContaining([
      "cuentas",
      "ordenes",
      "orden_lineas",
      "orden_correcciones",
      "orden_correccion_lineas",
      "auditoria_anulaciones",
    ]),
  );
});
```

- [x] **Step 2: Verify the test fails**

```bash
~/commands/bin/logged npx vitest run test/db.test.ts test/cuentas.test.ts
```

Expected: missing table.

- [x] **Step 3: Create migration 008**

Use this schema:

```sql
CREATE TABLE cuentas (
  id INTEGER PRIMARY KEY,
  mesa_id INTEGER NOT NULL REFERENCES mesas(id),
  estado TEXT NOT NULL CHECK (estado IN ('abierta','precuenta_emitida','en_caja','cancelada')),
  abierta_por_empleado_id INTEGER REFERENCES empleados(id),
  abierta_en TEXT NOT NULL,
  cerrada_en TEXT,
  nota_privada TEXT
);

CREATE UNIQUE INDEX cuenta_activa_mesa_unica
ON cuentas(mesa_id)
WHERE estado IN ('abierta','precuenta_emitida');

CREATE TABLE ordenes (
  id INTEGER PRIMARY KEY,
  cuenta_id INTEGER NOT NULL REFERENCES cuentas(id),
  numero INTEGER NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('enviada','corregida','anulada')),
  indicaciones TEXT,
  creada_por_empleado_id INTEGER NOT NULL REFERENCES empleados(id),
  creada_en TEXT NOT NULL,
  clave_idempotencia TEXT NOT NULL UNIQUE,
  UNIQUE(cuenta_id, numero)
);

CREATE TABLE orden_lineas (
  id INTEGER PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES ordenes(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad REAL NOT NULL CHECK(cantidad > 0),
  precio_centavos INTEGER NOT NULL,
  nota TEXT
);

CREATE TABLE orden_correcciones (
  id INTEGER PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES ordenes(id),
  numero_version INTEGER NOT NULL,
  motivo TEXT,
  es_anulacion INTEGER NOT NULL DEFAULT 0,
  creada_por_empleado_id INTEGER NOT NULL REFERENCES empleados(id),
  creada_en TEXT NOT NULL,
  UNIQUE(orden_id, numero_version)
);

CREATE TABLE orden_correccion_lineas (
  id INTEGER PRIMARY KEY,
  correccion_id INTEGER NOT NULL REFERENCES orden_correcciones(id),
  orden_linea_id INTEGER REFERENCES orden_lineas(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad_anterior REAL NOT NULL,
  cantidad_nueva REAL NOT NULL CHECK(cantidad_nueva >= 0),
  nota_anterior TEXT,
  nota_nueva TEXT
);

CREATE TABLE auditoria_anulaciones (
  id INTEGER PRIMARY KEY,
  cuenta_id INTEGER NOT NULL REFERENCES cuentas(id),
  orden_id INTEGER NOT NULL REFERENCES ordenes(id),
  correccion_id INTEGER NOT NULL REFERENCES orden_correcciones(id),
  mesa_numero INTEGER NOT NULL,
  orden_numero INTEGER NOT NULL,
  empleado_id INTEGER NOT NULL REFERENCES empleados(id),
  resumen TEXT NOT NULL,
  justificacion TEXT,
  creada_en TEXT NOT NULL
);
```

Extend `comandas`, `precuentas` and `caja_handoffs` with nullable `orden_id`, `correccion_id`, `tipo`, or `cuenta_id`. Keep existing `pedido_id` columns intact during compatibility.

- [x] **Step 4: Test constraints**

Add tests proving:

- two active accounts for one table fail;
- a closed historical account plus one active account succeeds;
- duplicate order number in one account fails;
- duplicate idempotency key fails.

- [x] **Step 5: Run schema tests**

Expected: pass.

---

### Task 3: Servicios de cuentas, órdenes y estado efectivo

**Files:**
- Create: `src/modules/cuentas/cuentas.ts`
- Create: `src/modules/cuentas/totales.ts`
- Create: `src/modules/ordenes/ordenes.ts`
- Test: `test/cuentas.test.ts`
- Test: `test/ordenes.test.ts`

**Interfaces:**

```typescript
export type EstadoCuenta = "abierta" | "precuenta_emitida" | "en_caja" | "cancelada";
export type NuevaLineaOrden = {
  productoId: number;
  cantidad: number;
  nota?: string | null;
};
export type NuevaOrden = {
  mesaId: number;
  lineas: NuevaLineaOrden[];
  indicaciones?: string | null;
  claveIdempotencia: string;
  empleadoId: number;
};
export function cuentaActivaPorMesa(db, mesaId: number): { id: number; estado: EstadoCuenta } | null;
export function obtenerCuenta(db, cuentaId: number): CuentaDetalle;
export function versionEfectivaOrden(db, ordenId: number): LineaEfectiva[];
export function totalEfectivoCuenta(db, cuentaId: number): number;
```

- [x] **Step 1: Write tests for account lookup and effective lines**

Test account with `Orden #1` original quantity 2 and a correction to quantity 1. Assert effective quantity 1 and total uses 1.

- [x] **Step 2: Verify failure**

```bash
~/commands/bin/logged npx vitest run test/cuentas.test.ts test/ordenes.test.ts
```

- [x] **Step 3: Implement account readers**

`obtenerCuenta` must return:

```typescript
type CuentaDetalle = {
  id: number;
  mesa: { id: number; numero: number };
  estado: EstadoCuenta;
  notaPrivada: string | null;
  ordenes: Array<{
    id: number;
    numero: number;
    estado: "enviada" | "corregida" | "anulada";
    indicaciones: string | null;
    creadaEn: string;
    empleado: string;
    lineas: LineaEfectiva[];
  }>;
};
```

- [x] **Step 4: Implement effective version calculation**

Start with original `orden_lineas`; apply corrections ordered by `numero_version`, replacing quantity and note for each original line/product. Keep zero-quantity lines in account history but exclude them from totals.

- [x] **Step 5: Run focused tests**

Expected: pass.

---

### Task 4: Envío transaccional e idempotente

**Files:**
- Create: `src/modules/ordenes/enviar.ts`
- Modify: `src/modules/kds/kds.ts`
- Modify: `src/modules/inventario/asientos.ts`
- Modify: `src/print/types.ts`
- Modify: `src/print/escpos.ts`
- Test: `test/enviar.test.ts`
- Test: `test/enviar-doble.test.ts`
- Test: `test/ordenes.test.ts`

**Interfaces:**

```typescript
export async function enviarOrden(
  db: Database.Database,
  input: NuevaOrden,
  printer: PrinterPort,
  cfg: AppConfig,
): Promise<{ cuentaId: number; ordenId: number; comandaId: number; repetida: boolean }>;
```

- [x] **Step 1: Write failing behavior tests**

Cover:

1. First send to free table creates one account and `Orden #1`.
2. Second send creates `Orden #2` in the same account.
3. Second comanda contains only lines from `Orden #2`.
4. Repeating the same `claveIdempotencia` returns the first result and creates no rows/jobs.
5. Empty lines fail with `orden_sin_productos`.

- [x] **Step 2: Verify failure**

```bash
~/commands/bin/logged npx vitest run test/ordenes.test.ts test/enviar.test.ts test/enviar-doble.test.ts
```

- [x] **Step 3: Implement one transaction**

Inside `db.transaction()`:

1. Return existing order by idempotency key if present.
2. Validate employee and all quantities `> 0`.
3. Find active account by table; insert one if absent.
4. Compute `numero = max(numero) + 1`.
5. Insert order and lines using current product prices.
6. Invalidate active precuenta for that account.
7. Reserve inventory only for these new lines.
8. Create comanda with `tipo='orden'` and `orden_id`.
9. Enqueue one print job.

Dispatch printer after commit.

- [x] **Step 4: Update ticket text**

Ticket header:

```text
COMANDA
Mesa 7 · Orden 2
Mesero: Ana
```

- [x] **Step 5: Run focused tests and typecheck**

Expected: pass and exit 0.

---

### Task 5: Correcciones, anulación y auditoría opcional

**Files:**
- Create: `src/modules/ordenes/correcciones.ts`
- Modify: `src/modules/kds/kds.ts`
- Modify: `src/modules/inventario/asientos.ts`
- Modify: `src/print/escpos.ts`
- Test: `test/correcciones.test.ts`
- Modify: `test/pedidos-editar.test.ts`
- Modify: `test/escpos.test.ts`

**Interfaces:**

```typescript
export type CambioOrdenInput = {
  productoId: number;
  ordenLineaId?: number;
  cantidad: number;
  nota?: string | null;
};

export async function corregirOrden(
  db: Database.Database,
  input: {
    ordenId: number;
    lineas: CambioOrdenInput[];
    indicaciones?: string | null;
    motivo?: string | null;
    pin: string;
  },
  printer: PrinterPort,
  cfg: AppConfig,
): Promise<{ correccionId: number; comandaId: number }>;
```

- [x] **Step 1: Write failing correction tests**

Assert:

- original rows never change;
- quantity `2 → 1` prints `- 1 Producto`;
- quantity `1 → 3` prints `+ 2 Producto`;
- quantity `1 → 0` marks the line cancelled;
- all effective quantities zero sets order `anulada`;
- later correction compares with latest effective version;
- wrong PIN leaves database and inventory unchanged;
- `justificacion_anulacion=true` rejects blank reason;
- audit row exists only when `auditoria_anulaciones=true`.

- [x] **Step 2: Verify failure**

```bash
~/commands/bin/logged npx vitest run test/correcciones.test.ts test/pedidos-editar.test.ts test/escpos.test.ts
```

- [x] **Step 3: Implement diff calculation as a pure function**

```typescript
export type DiferenciaCocina = {
  productoId: number;
  nombre: string;
  delta: number;
  notaAnterior: string | null;
  notaNueva: string | null;
};

export function calcularDiferencias(
  actuales: LineaEfectiva[],
  nuevas: CambioOrdenInput[],
): DiferenciaCocina[];
```

Reject a correction with no quantity/note/indication change.

- [x] **Step 4: Persist correction atomically**

Authenticate PIN before transaction. During transaction:

- insert correction and changed lines;
- update order state;
- adjust only inventory delta;
- invalidate precuenta;
- insert audit snapshot if enabled;
- create correction/anulation comanda and print job.

- [x] **Step 5: Run focused tests**

Expected: pass.

---

### Task 6: Precuenta y caja por cuenta

**Files:**
- Modify: `src/modules/precuenta/precuenta.ts`
- Modify: `src/modules/caja/caja.ts`
- Modify: `src/modules/cuentas/totales.ts`
- Test: `test/precuenta.test.ts`
- Test: `test/caja.test.ts`
- Test: `test/circuito.test.ts`

**Interfaces:**

```typescript
export async function emitirPrecuentaCuenta(
  db,
  cuentaId: number,
  pin: string,
  printer: PrinterPort,
  cfg: AppConfig,
): Promise<{ precuentaId: number; numero: number; totalCentavos: number }>;

export async function enviarCuentaACaja(
  db,
  cuentaId: number,
  pin: string,
  cfg: AppConfig,
): Promise<{ handoffId: number }>;
```

- [x] **Step 1: Rewrite circuit tests around account IDs**

Build `Orden #1`, `Orden #2`, then correct one line. Assert precuenta total equals effective lines across both orders.

- [x] **Step 2: Verify tests fail**

```bash
~/commands/bin/logged npx vitest run test/precuenta.test.ts test/caja.test.ts test/circuito.test.ts
```

- [x] **Step 3: Implement account snapshots**

Snapshot JSON must include:

```typescript
{
  cuentaId,
  mesaNumero,
  ordenes: [{ numero, lineas: [{ productoId, nombre, cantidad, precioCentavos }] }],
  totalCentavos
}
```

- [x] **Step 4: Close account and release table**

`enviarCuentaACaja` validates a current precuenta and no unreflected order/correction, inserts `caja_handoffs.cuenta_id`, changes account to `en_caja`, and sets `cerrada_en`.

- [x] **Step 5: Run focused tests**

Expected: pass.

---

### Task 7: API nueva y adaptador temporal

**Files:**
- Create: `src/http/rutas/cuentas.ts`
- Create: `src/http/rutas/ordenes.ts`
- Modify: `src/http/app.ts`
- Test: `test/api.test.ts`
- Test: `test/opciones-api.test.ts`

**Interfaces:**

```text
POST /api/ordenes
GET  /api/cuentas/:id
POST /api/cuentas/:id/ordenes
POST /api/ordenes/:id/correcciones
POST /api/ordenes/:id/anular
POST /api/cuentas/:id/precuenta
POST /api/cuentas/:id/enviar-caja
```

- [x] **Step 1: Write API contract tests**

Example first order:

```typescript
const res = await app.request("/api/ordenes", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    mesaId,
    claveIdempotencia: "browser-uuid-1",
    pin: "1234",
    lineas: [{ productoId, cantidad: 2, nota: "sin cebolla" }],
    indicaciones: "primero bebidas",
  }),
});
expect(res.status).toBe(201);
expect(await res.json()).toMatchObject({ ordenNumero: 1 });
```

- [x] **Step 2: Verify tests fail**

- [x] **Step 3: Mount route modules**

Keep `createApp` as composition root. Route modules receive `{ db, config, printer }` and do not import global state.

- [x] **Step 4: Add legacy adapters**

Existing read routes may map account detail back to the old response while the UI transition occurs. Legacy mutation routes must return a deprecation header and delegate to new services; they must not dual-write.

- [x] **Step 5: Run API tests**

Expected: pass.

---

### Task 8: Backfill verificable de pedidos existentes

**Files:**
- Create: `src/modules/migracion/pedidos-a-cuentas.ts`
- Test: `test/migracion-pedidos.test.ts`
- Modify: `src/index.ts`

**Interfaces:**

```typescript
export type ResultadoMigracion = {
  cuentas: number;
  ordenes: number;
  lineas: number;
  borradoresExportados: number;
  errores: string[];
};

export function migrarPedidosACuentas(
  db: Database.Database,
  exportDir: string,
): ResultadoMigracion;
```

- [x] **Step 1: Write migration fixture test**

Fixture must include:

- one pedido with two `envio_n`;
- one precuenta;
- one handoff;
- one pending `pedido_lineas.estado='nueva'`;
- one cancelled line.

Assert two orders are reconstructed and pending lines are exported to JSON, not treated as sent.

- [x] **Step 2: Verify failure**

- [x] **Step 3: Implement idempotent migration**

Use a migration marker table or detect `cuentas.legacy_pedido_id` (add unique nullable column in migration 008). Re-running returns zero new rows.

Export pending lines to:

```text
<dataDir>/migration/pedido-<id>-borrador.json
```

The JSON contains table, employee, products, notes and timestamp.

- [x] **Step 4: Add integrity report**

Before commit, compare:

- effective totals legacy vs new;
- active table count;
- precuenta snapshots;
- count of command lines.

Any mismatch rolls back and reports an error.

- [x] **Step 5: Run migration and circuit tests**

Expected: pass without changing test fixtures on second run.

---

### Task 9: Borradores en localStorage

**Files:**
- Create: `ui/src/lib/borradores.ts`
- Test: `test/borradores-local.test.ts`

**Interfaces:**

```typescript
export type BorradorOrden = {
  version: 1;
  mesaId?: number;
  cuentaId?: number;
  claveIdempotencia: string;
  lineas: Array<{ productoId: number; cantidad: number; nota: string }>;
  indicaciones: string;
  actualizadoEn: string;
};

export function claveBorrador(contexto:
  | { tipo: "general" }
  | { tipo: "mesa"; mesaId: number }
  | { tipo: "cuenta"; cuentaId: number }
): string;
export function cargarBorrador(storage: Storage, clave: string): BorradorOrden | null;
export function guardarBorrador(storage: Storage, clave: string, value: BorradorOrden): void;
export function eliminarBorrador(storage: Storage, clave: string): void;
```

- [x] **Step 1: Write tests with an in-memory Storage implementation**

Cover save/load, malformed JSON, version mismatch, separate keys, and clear after send.

- [x] **Step 2: Verify failure**

- [x] **Step 3: Implement defensive parsing**

Malformed or incompatible values return `null` and are removed. Preserve idempotency key across reloads.

- [x] **Step 4: Run focused tests**

Expected: pass.

---

### Task 10: Constructor de orden y pantalla Cuenta de mesa

**Files:**
- Create: `ui/src/pantallas/ConstructorOrden.tsx`
- Create: `ui/src/pantallas/CuentaMesa.tsx`
- Create: `ui/src/pantallas/ModalEditarOrden.tsx`
- Modify: `ui/src/App.tsx`
- Modify: `ui/src/pantallas/Pedidos.tsx`
- Modify: `ui/src/styles.css`
- Test: `test/cuenta-mesa-ui.test.ts`
- Modify: `test/pedido-ticket-ui.test.ts`
- Modify: `test/pedidos-ui.test.ts`

**Interfaces:**

```typescript
type ConstructorOrdenProps = {
  mesaFija?: { id: number; numero: number };
  cuentaId?: number;
  mesasSeleccionables?: Array<{ id: number; numero: number; estado: "libre" | "ocupada" }>;
  productos: ProductoCarta[];
  borrador: BorradorOrden;
  onCambiar: (borrador: BorradorOrden) => void;
  onEnviar: (borrador: BorradorOrden) => Promise<void>;
  onCancelar: () => void;
};
```

- [x] **Step 1: Write SSR UI tests**

Assert:

- general constructor requires table selector;
- table context says `Nueva orden · Mesa #7` and has no selector;
- account title says `Cuenta de mesa #7`;
- products appear under `Orden #1` and `Orden #2`;
- sent order has icon buttons titled `Editar orden` and `Anular orden`;
- sent order does not render an `Enviar` button;
- `Nueva orden` opens constructor with fixed table.

- [x] **Step 2: Verify failure**

```bash
~/commands/bin/logged npx vitest run test/cuenta-mesa-ui.test.ts test/pedido-ticket-ui.test.ts test/pedidos-ui.test.ts
```

- [x] **Step 3: Extract constructor from Pedido**

Use lucide icons (`Pencil`, `Trash2`, `Plus`, `Send`). Quantity controls exist only in the active constructor/modal, never permanently beside sent lines.

- [x] **Step 4: Integrate App state**

Replace `pedidoId`-centric state with:

```typescript
const [cuentaId, setCuentaId] = useState<number | null>(null);
const [contextoOrden, setContextoOrden] = useState<
  | { tipo: "general" }
  | { tipo: "mesa"; mesaId: number; mesaNumero: number }
  | { tipo: "cuenta"; cuentaId: number; mesaId: number; mesaNumero: number }
  | null
>(null);
```

Save draft on each change. Remove it only after 2xx response.

- [x] **Step 5: Implement correction modal**

Open full effective order, request PIN before submit, show textual diff preview, request justification only when configured and an effective quantity reaches zero.

- [x] **Step 6: Run UI tests and lints**

Expected: pass and no new lints.

---

### Task 11: Crear producto como modal

**Files:**
- Create: `ui/src/pantallas/ModalCrearProducto.tsx`
- Modify: `ui/src/pantallas/CrearProducto.tsx`
- Modify: `ui/src/App.tsx`
- Modify: `ui/src/pantallas/Barra.tsx`
- Modify: `ui/src/pantallas/Backend.tsx`
- Modify: `ui/src/styles.css`
- Test: `test/modal-crear-producto-ui.test.ts`
- Modify: `test/barra-ui.test.ts`
- Modify: `test/modulo-restaurante-ui.test.ts`

**Interfaces:**

```typescript
type ModalCrearProductoProps = {
  abierto: boolean;
  categorias: Categoria[];
  error?: string;
  onGuardar: CrearProductoProps["onGuardar"];
  onCerrar: () => void;
};
```

- [x] **Step 1: Write modal tests**

Assert `role="dialog"`, `aria-modal="true"`, title `Crear producto`, cancel action, and that the underlying route remains unchanged.

- [x] **Step 2: Verify failure**

- [x] **Step 3: Make CrearProducto presentational**

Keep all form fields and validation in `CrearProducto`; remove assumptions about full-page navigation. Wrap it in `ModalCrearProducto`.

- [x] **Step 4: Replace destination with overlay state**

Remove `"producto-nuevo"` from `Destino`. In `App`:

```typescript
const [crearProductoAbierto, setCrearProductoAbierto] = useState(false);
```

Bar and Backend call `setCrearProductoAbierto(true)`. Successful save refreshes products and closes. Escape/click outside ask confirmation only if the form is dirty.

- [x] **Step 5: Run focused UI tests**

Expected: pass.

---

### Task 12: Cutover, regression suite and documentation

**Files:**
- Modify: `src/modules/salon/salon.ts`
- Modify: `test/salon.test.ts`
- Modify: `test/pedidos-sin-mesa.test.ts`
- Modify: `test/asignar-mesa.test.ts`
- Modify: `docs/relaciones-bd.md`
- Modify: `docs/superpowers/specs/2026-08-22-cuentas-ordenes-design.md`

**Interfaces:**
- `estadoMesa(db, mesaId)` derives occupation from active `cuentas`.
- `pedidoIdAbierto`, `abrirMesa`, `abrirTab`, `borradorSinMesa`, and `limpiarPedidosSinMesa` become legacy-only and are not called by new routes/UI.

- [x] **Step 1: Rewrite salon behavior tests**

Assert:

- clicking/free-table navigation creates no database row;
- first successful send makes table occupied;
- closing account makes table free;
- one table cannot have two active accounts.

- [x] **Step 2: Remove UI calls to legacy draft endpoints**

Search:

```bash
~/commands/bin/logged rg "abrirTab|abrirMesa|/api/pedidos|pedidoId" ui/src src/http
```

Expected after cutover: matches only in explicitly marked legacy adapters/tests.

- [x] **Step 3: Run all verification**

```bash
~/commands/bin/logged npm test
~/commands/bin/logged npm run build
```

Expected:

- all tests pass;
- TypeScript exits 0;
- Vite build exits 0.

- [x] **Step 4: Exercise the real data migration on a copy**

Copy the current dev database to a temporary path, run migration, and verify:

```sql
SELECT mesa_id, count(*)
FROM cuentas
WHERE estado IN ('abierta','precuenta_emitida')
GROUP BY mesa_id
HAVING count(*) > 1;
```

Expected: zero rows.

Compare counts and totals from the migration report. Do not run destructive cleanup on the live file in this task.

Executed 2026-08-23. No dev database existed on this machine, so the exercise ran on a file-based temp DB seeded with representative legacy data (enviado, precuenta emitida, borrador sin mesa, cancelado). Invariant returned zero rows, totals matched the legacy lines, `foreign_key_check` was clean and the second run converted nothing.

- [x] **Step 5: Update docs to actual state**

Mark implemented sections accurately. Keep reservations explicitly deferred. Record legacy endpoints/tables that remain and the later removal condition.

---

## Execution Order and Review Gates

1. Tasks 1–3: schema and read model. Review gate: no production behavior changed.
2. Tasks 4–7: write model and API. Review gate: backend supports full account circuit.
3. Task 8: migration. Review gate: verified against copied real data.
4. Tasks 9–11: UI and browser drafts. Review gate: complete user flow.
5. Task 12: cutover and full regression.

Do not combine migration and legacy-table removal in one release. Reservations begin only after Task 12 is accepted.
