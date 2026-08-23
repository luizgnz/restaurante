# Contornos de comidas Implementation Plan

Spec: `docs/superpowers/specs/2026-08-23-contornos-comidas-design.md` (aprobado 2026-08-23).

## Global Constraints

- TDD: cada tarea escribe tests primero y los ve fallar antes de implementar.
- Las selecciones de contornos son snapshots: nombre y precio se copian al enviar; cambios de configuración posteriores no alteran órdenes históricas.
- Platos sin slots se piden igual que hoy; nada de lo existente cambia de comportamiento.
- Errores de dominio nunca son 500: `contornos_incompletos`, `variante_inexistente`, `variante_no_permitida`, `extra_no_permitido` (400/409 según corresponda).
- Inventario no se toca: las variantes son descriptivas en esta fase.

## File Map

**Create**

- `src/db/migrations/014_contornos.sql` — tablas del modelo.
- `src/modules/contornos/contornos.ts` — grupos, variantes, slots y validación de selecciones.
- `src/http/rutas/contornos.ts` — API de configuración.
- `ui/src/pantallas/ModalArmadoPlato.tsx` — selección de contornos al pedir.
- `ui/src/pantallas/Contornos.tsx` — administración de grupos/variantes/slots.
- Tests: `test/contornos.test.ts`, `test/contornos-api.test.ts`, `test/contornos-ui.test.ts`, `test/armado-plato-ui.test.ts`.

**Modify**

- `src/modules/ordenes/enviar.ts` — valida y guarda contornos; snapshot de precios.
- `src/modules/cuentas/totales.ts` — suplementos/extras entran al total efectivo.
- `src/modules/cuentas/cuentas.ts` — el detalle de cuenta expone contornos por línea.
- `src/modules/kds/kds.ts` — tarjetas incluyen las selecciones.
- `src/http/rutas/ordenes.ts`, `src/http/app.ts` — body con contornos; montaje de rutas; carta expone si el plato es configurable.
- `ui/src/pantallas/ConstructorOrden.tsx`, `ui/src/App.tsx`, `ui/src/lib/borradores.ts` — armado, borrador con contornos.
- `ui/src/pantallas/CuentaMesa.tsx`, `ui/src/pantallas/Backend.tsx` — mostrar selecciones; atajo Contornos.
- `src/modules/productos/seed.ts` — Menú del día de ejemplo con sus slots y variantes.

---

### Task 1: Esquema y módulo de contornos

**Files:**
- Create: `src/db/migrations/014_contornos.sql`
- Create: `src/modules/contornos/contornos.ts`
- Test: `test/contornos.test.ts`

**Interfaces:**

```typescript
type GrupoContorno = { id: number; nombre: string };
type VarianteContorno = {
  id: number; grupoId: number; nombre: string;
  suplementoCentavos: number; extraCentavos: number; activo: boolean;
};
type SlotPlato = {
  posicion: number; nombre: string; permiteExtra: boolean;
  grupos: { id: number; nombre: string }[];
};

crearGrupo(db, { nombre }): { id, nombre }                     // duplicado → grupo_duplicado
crearVariante(db, { grupoId, nombre, suplementoCentavos?, extraCentavos? }): { id }
listarContornos(db): { grupos: (GrupoContorno & { variantes: VarianteContorno[] })[] }
configurarSlots(db, productoId, slots: { posicion, nombre, permiteExtra, grupoIds }[]): void
slotsDeProducto(db, productoId): SlotPlato[]
validarSelecciones(db, productoId, selecciones: { slotPosicion, varianteId }[]): SelectionOk[]
// SelectionOk = { slotPosicion, slotNombre, varianteNombre, precioCentavos, esExtra, ordenExtra }
// errores: contornos_incompletos | variante_inexistente | variante_no_permitida | extra_no_permitido
```

- [ ] **Step 1: Tests del módulo** — grupos/variantes únicos, slots por plato, validación de selecciones completas/incompletas/grupo equivocado/extras permitidos y no.
- [ ] **Step 2: Verificar fallo.**
- [ ] **Step 3: Migración 014** — tablas del spec §3 (`contorno_grupos`, `contorno_variantes`, `plato_slots`, `plato_slot_grupos`, `orden_linea_contornos`).
- [ ] **Step 4: Implementar módulo.**
- [ ] **Step 5: Tests verdes + typecheck.**

---

### Task 2: API de configuración de contornos

**Files:**
- Create: `src/http/rutas/contornos.ts`
- Create: `test/contornos-api.test.ts`
- Modify: `src/http/app.ts`

**Interfaces:**

```text
GET  /api/contornos                  → { grupos: [{ id, nombre, variantes: [...] }] }
POST /api/contornos/grupos           → 201 { id, nombre }      (grupo_duplicado → 400)
POST /api/contornos/variantes        → 201 { id }               (variante_duplicada → 400)
GET  /api/productos/:id/slots        → { slots: [...] }
PUT  /api/productos/:id/slots        → { slots: [...] }
```

- [ ] **Step 1: Tests de contrato HTTP.**
- [ ] **Step 2: Verificar fallo.**
- [ ] **Step 3: Montar rutas en app.ts.**
- [ ] **Step 4: Tests verdes.**

---

### Task 3: Envío de órdenes con contornos

**Files:**
- Modify: `src/modules/ordenes/enviar.ts`
- Modify: `src/http/rutas/ordenes.ts`
- Modify: `src/modules/cuentas/totales.ts`
- Test: agregar a `test/enviar.test.ts` + `test/cuentas.test.ts`

**Reglas:**

- `lineas[].contornos: [{ slotPosicion, varianteId }]` opcional; si el plato tiene slots y la línea no trae contornos → `contornos_incompletos`.
- Repetir `slotPosicion` = extra: solo si el slot `permite_extra`; la primera selección paga `suplemento_centavos`, las siguientes `extra_centavos`.
- Snapshot en `orden_linea_contornos` (nombres + precios al envío).
- Total efectivo de la línea = `cantidad × precio + cantidad × Σ(contornos)`; precuenta, cuenta y tickets lo reflejan.

- [ ] **Step 1: Tests de envío con contornos** — válido, incompleto, grupo equivocado, extra permitido/no permitido, total con suplemento y extra, idempotencia conserva contornos.
- [ ] **Step 2: Verificar fallo.**
- [ ] **Step 3: Implementar validación + snapshot en enviar.ts.**
- [ ] **Step 4: Totales efectivos incorporan contornos.**
- [ ] **Step 5: Tests verdes.**

---

### Task 4: Comanda y cocina con contornos

**Files:**
- Modify: `src/modules/kds/kds.ts`
- Modify: `src/print/escpos.ts` (texto de comanda)
- Test: `test/kds.test.ts`

- [ ] **Step 1: Tests** — tarjeta KDS y texto de comanda incluyen las selecciones (`Proteína: Pollo`, `EXTRA: Pollo`).
- [ ] **Step 2: Verificar fallo.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Tests verdes.**

---

### Task 5: UI del constructor — armado del plato

**Files:**
- Create: `ui/src/pantallas/ModalArmadoPlato.tsx`
- Create: `test/armado-plato-ui.test.ts`
- Modify: `ui/src/pantallas/ConstructorOrden.tsx`, `ui/src/App.tsx`, `ui/src/lib/borradores.ts`
- Modify: `src/http/app.ts` (`/api/carta` expone `configurable` por plato)

**Comportamiento:**

- Tocar un plato configurable abre el modal con sus slots; cada slot lista las variantes de sus grupos permitidos; slots con varios grupos muestran las variantes agrupadas.
- Slots con `permite_extra` ofrecen “+ Extra” por variante con su precio.
- Confirmar exige todos los slots cubiertos; la selección queda en el borrador (`lineas[].contornos`) y viaja en el envío.
- El panel de la orden resume la selección: `1 × Menú del día (Pollo · Papas fritas · Ensalada rusa)`.

- [ ] **Step 1: Tests SSR del modal y del resumen en el constructor.**
- [ ] **Step 2: Verificar fallo.**
- [ ] **Step 3: Implementar modal + integración en App/borrador.**
- [ ] **Step 4: Cuenta de mesa muestra las selecciones por línea.**
- [ ] **Step 5: Tests verdes + build.**

---

### Task 6: Administración de contornos (Backend)

**Files:**
- Create: `ui/src/pantallas/Contornos.tsx`
- Create: `test/contornos-ui.test.ts`
- Modify: `ui/src/pantallas/Backend.tsx`, `ui/src/App.tsx`, `ui/src/pantallas/Barra.tsx`

**Comportamiento:**

- Pantalla Backend → “Contornos”: lista grupos con sus variantes; formulario crea grupos y variantes (nombre, suplemento, precio extra).
- Editor de slots por plato: elegir plato, definir posición/nombre/grupos permitidos/permite extra.

- [ ] **Step 1: Tests SSR de la pantalla.**
- [ ] **Step 2: Verificar fallo.**
- [ ] **Step 3: Implementar pantalla + cableado.**
- [ ] **Step 4: Tests verdes + build.**

---

### Task 7: Seed de ejemplo y documentación

**Files:**
- Modify: `src/modules/productos/seed.ts`
- Modify: `docs/relaciones-bd.md`

- [ ] **Step 1: Seed** — “Menú del día” con slots Proteína (Pollo/Carne/Longaniza), Contorno (Papas fritas/Arroz/Puré), Segundo contorno (carbohidratos + Ensalada rusa/Ensalada rallada, permite extra). Además, producto independiente **“extra”** con un único slot “Tipo de extra” (submenú) cuyas variantes son Pollo/Carne/Longaniza y el precio lo aporta el suplemento de la variante elegida.
- [ ] **Step 2: Test del seed** — el menú queda configurable y pedible con contornos; el item “extra” se pide eligiendo tipo en el submenú.
- [ ] **Step 3: Actualizar docs al estado real.**
- [ ] **Step 4: Suite completa + build.**

---

## Execution Order and Review Gates

1. Tasks 1–2: modelo y API de configuración. Gate: la configuración es CRUD-complete sin tocar el circuito de órdenes.
2. Tasks 3–4: envío, totales y cocina. Gate: una orden con contornos cobra bien y cocina ve las selecciones; los platos sin slots no cambian.
3. Tasks 5–6: UI de pedido y administración. Gate: flujo completo desde el constructor.
4. Task 7: seed y docs. Gate: suite completa verde.
