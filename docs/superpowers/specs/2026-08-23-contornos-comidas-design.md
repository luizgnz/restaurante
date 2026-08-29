# Diseño: contornos y variantes de comidas

**Fecha:** 2026-08-23  
**Estado:** aprobado — listo para planificar  
**Alcance:** configuración de contornos por plato, selección al pedir, extras, comanda y precios.  
**Diferido:** inventario por variante y cambio de contornos vía corrección (ver §8).

## 1. Problema

Una comida (p. ej. “Menú del día”) se sirve con contornos que elige el cliente:

- **Proteína** (1): pollo, carne, longaniza.
- **Carbohidrato** (1): papas fritas, arroz, puré.
- **Segundo contorno** (1): carbohidrato o ensalada (ensalada rusa, ensalada rallada).

Reglas dadas por el negocio:

1. Cada **tipo de contorno** (proteína, carbohidrato, ensalada) tiene una o más **variantes**.
2. Los contornos **no proteína** son intercambiables: el cliente puede llevar dos carbohidratos o dos ensaladas (slot 2 y slot 3 aceptan ambos grupos, configurable por plato).
3. La **proteína no se intercambia** (es más cara).
4. Una porción adicional de proteína (o de lo que el plato permita) es un **extra** con precio propio.

## 2. Decisiones de dominio

- Los **grupos de contorno** son globales y administrables: `Proteína`, `Carbohidrato`, `Ensalada` por defecto; el admin crea los que necesite.
- Cada **variante** pertenece a un grupo: nombre, **suplemento configurable** (0 = incluida en el precio del plato) y **precio de extra definido por variante** (el admin decide cuánto cuesta una porción adicional de cada una).
- La estructura de contornos se configura **por plato**: cada plato define sus **slots** (posición, nombre, grupos que acepta, si permite extra). Un plato sin slots se pide como hoy.
- La selección de contornos es **por línea de orden** (todas las porciones de la línea comparten la selección). Selección por unidad queda diferido.
- Las selecciones se guardan como **snapshot** en la línea (nombre y precio al momento), igual que el precio de la línea: si el admin cambia variantes después, las órdenes históricas no cambian.
- La selección es **obligatoria** para todos los slots antes de enviar (no hay “sin contorno” salvo que el slot se configure como opcional — decisión pendiente, por defecto obligatorios).

## 3. Tablas propuestas

### `contorno_grupos`

- `id`
- `nombre TEXT NOT NULL UNIQUE` — “Proteína”, “Carbohidrato”, “Ensalada”.

### `contorno_variantes`

- `id`
- `grupo_id NOT NULL REFERENCES contorno_grupos(id)`
- `nombre TEXT NOT NULL` — “Pollo”, “Papas fritas”, …
- `suplemento_centavos INTEGER NOT NULL DEFAULT 0` — sobreprecio por elegirla (0 = incluida).
- `extra_centavos INTEGER NOT NULL DEFAULT 0` — precio de una porción extra; `0` = sin extra definido.
- `producto_id INTEGER NULL REFERENCES productos(id)` — enlace opcional a producto (para inventario, fase diferida).
- `activo INTEGER NOT NULL DEFAULT 1`
- `UNIQUE(grupo_id, nombre)`

### `plato_slots`

- `id`
- `producto_id NOT NULL REFERENCES productos(id)` — el plato configurable.
- `posicion INTEGER NOT NULL` — 1, 2, 3…
- `nombre TEXT NOT NULL` — “Proteína”, “Contorno”, “Segundo contorno”.
- `permite_extra INTEGER NOT NULL DEFAULT 0`
- `UNIQUE(producto_id, posicion)`

### `plato_slot_grupos`

- `slot_id NOT NULL REFERENCES plato_slots(id) ON DELETE CASCADE`
- `grupo_id NOT NULL REFERENCES contorno_grupos(id)`
- `PRIMARY KEY (slot_id, grupo_id)`

Slot con un solo grupo = fijo (proteína). Slot con varios grupos = intercambiable (carbohidrato/ensalada).

### `orden_linea_contornos`

- `id`
- `orden_linea_id NOT NULL REFERENCES orden_lineas(id)`
- `slot_posicion INTEGER NOT NULL` — el slot del plato al momento del envío.
- `slot_nombre TEXT NOT NULL` — snapshot.
- `variante_nombre TEXT NOT NULL` — snapshot.
- `precio_centavos INTEGER NOT NULL` — suplemento o precio de extra, snapshot al envío.
- `es_extra INTEGER NOT NULL DEFAULT 0`
- `UNIQUE(orden_linea_id, slot_posicion, es_extra)` — una selección por slot; los extras repiten posición con `es_extra = 1, 2, …`

## 4. Precios

- Precio efectivo de la línea = `cantidad × precio_centavos` (del producto) **más** la suma de `orden_linea_contornos.precio_centavos × cantidad` (suplementos y extras escalan con la cantidad, porque la selección es por línea).
- `versionEfectivaOrden` / `totalEfectivoCuenta` incorporan el adicional en `LineaEfectiva.precioCentavos` o en un campo `adicionalCentavos` nuevo (implementación elige; los totales de precuenta y cuenta deben reflejarlo).
- Ejemplo: Menú $8.900 + extra pollo $1.500, cantidad 2 → línea cobra 2 × (8.900 + 1.500).

## 5. Flujo de pedido (UI)

1. En el constructor, tocar un plato **con slots** abre el modal **Armado del plato** (los platos sin slots se agregan directo como hoy).
2. El modal lista los slots en orden; cada slot muestra las variantes de sus grupos permitidos (agrupadas si hay varios grupos) para elegir una.
3. Si el slot `permite_extra`, ofrece “+ Extra <variante>” con su precio; cada extra suma una selección adicional.
4. No se puede confirmar sin completar todos los slots obligatorios.
5. La línea queda en la orden como `1 × Menú del día (Pollo · Papas fritas · Ensalada rusa · + Extra Pollo)`.
6. La **Cuenta de mesa** muestra las selecciones debajo de la línea.

### Producto independiente “extra”

Además de los extras ligados a un plato, existe un producto llamado **“extra”** que se agrega como un **item propio** de la orden. Al tocarlo se abre el mismo modal de armado como **submenú** con un único slot (“Tipo de extra”) cuyas variantes son los tipos disponibles (p. ej. Pollo, Carne, Longaniza); el precio del item lo aporta el suplemento de la variante elegida. Así el cliente puede sumar una porción extra sin asociarla a un plato concreto.

## 6. Comanda y cocina

La comanda de la orden imprime/muestra debajo de la línea:

```text
1 x Menu del dia
   Proteina: Pollo
   Contorno: Papas fritas
   2do contorno: Ensalada rusa
   EXTRA: Pollo
```

`GET /api/kds` incluye las selecciones en la tarjeta de la línea (mismo formato texto).

## 7. API

```text
GET    /api/contornos                      → grupos + variantes activas
POST   /api/contornos/grupos               → crear grupo
POST   /api/contornos/variantes            → crear variante
GET    /api/productos/:id/slots            → slots del plato
PUT    /api/productos/:id/slots            → configurar slots del plato
POST   /api/ordenes (existente)            → body.lineas[].contornos: [{slotPosicion, varianteId, extra?}]
```

Validaciones del envío: el plato tiene slots y están todos cubiertos, la variante existe y está activa, pertenece a un grupo permitido por el slot, y los extras solo si el slot `permite_extra`. Errores de dominio: `contornos_incompletos`, `variante_inexistente`, `variante_no_permitida`, `extra_no_permitido`.

## 8. Diferido

- **Inventario por variante**: descontar stock según la variante elegida vía `producto_id` (las variantes quedan **descriptivas** en esta fase).
- **Corrección de contornos**: editar selecciones de una orden enviada. En esta fase, cambiar contornos = **anular la línea y pedir de nuevo** con el flujo existente.
- **Selección por unidad**: contornos distintos para cada porción de una misma línea.
- **Slots opcionales** (“sin contorno” permitida).

## 9. Criterios de aceptación

- El admin crea grupos y variantes; el seed deja Proteína/Carbohidrato/Ensalada con las variantes del negocio.
- Un plato configurable no se puede enviar sin elegir todos sus slots.
- Slot de proteína solo acepta proteínas; los otros slots aceptan los grupos configurados (dos carbohidratos o dos ensaladas es posible si ambos slots lo permiten).
- Extra de proteína suma su precio al total de la línea y aparece en la comanda.
- Precuenta y cuenta incluyen suplementos y extras en el total.
- Un plato sin slots se pide igual que hoy (nada cambia para la carta simple).

## 10. Decisiones aprobadas (2026-08-23)

1. **Suplementos**: configurables por variante (el admin define sobreprecio; 0 = incluida).
2. **Extras**: precio por variante, definido por el admin.
3. **Inventario**: las variantes quedan descriptivas; el descuento por variante va en fase 2.
4. **Cambios posteriores**: anular la línea y pedir de nuevo; la corrección de contornos va en fase 2.
