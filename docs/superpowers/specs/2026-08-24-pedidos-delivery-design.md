# Diseño: pedidos de delivery

**Fecha:** 2026-08-24
**Estado:** borrador — para revisión del dueño del producto
**Alcance:** cuentas sin mesa para pedidos de delivery, prioridad en la pantalla de cocina, carril propio en Órdenes, cierre sin precuenta.
**Depende de:** migración 020 (`confirmar consumo` y cocina). Este diseño usa la nomenclatura nueva.
**Diferido:** integración con la plataforma de delivery (§9), pedido para llevar de mostrador, datos del cliente y dirección.

---

## 1. Problema

El local hace delivery con otra plataforma. Esos pedidos **consumen los mismos insumos** que los del salón, y hoy no pasan por el sistema. El resultado no es un inventario "algo desviado": es un inventario que muestra existencias que no hay, un cálculo de platos armables optimista, y una dueña prometiendo platos que no puede preparar. En una semana los números dejan de servir — que es justo lo que vino a comprar.

Además la cocina recibe trabajo desde dos lados, que es el problema que el sistema venía a eliminar.

Y hay una diferencia operativa que el modelo actual no representa: **un pedido de delivery tiene un repartidor esperando y un reloj corriendo en la plataforma.** Un comensal sentado puede esperar cinco minutos más; un pedido de delivery atrasado cuesta calificación y dinero. La cocina necesita verlo primero.

## 2. Decisiones de dominio

- Una cuenta puede existir **sin mesa**. Se distingue por `tipo`: `salon` o `delivery`.
- **Cada pedido de delivery es su propia cuenta.** No se acumulan órdenes como en una mesa: llega, se prepara, sale.
- La cuenta de delivery guarda la **referencia externa** — el número de pedido de la plataforma. Es lo que permite que quien entrega al repartidor confirme que está despachando el pedido correcto.
- **El delivery no pasa por precuenta.** La plataforma ya cobró y no hay cliente en la mesa a quien mostrarle nada. Se envía a cocina y se confirma cuando sale con el repartidor.
- En la pantalla de cocina, **las tarjetas de delivery van primero**, con distintivo visible y el tiempo transcurrido en grande.
- En Órdenes, el delivery vive en un **carril propio**, separado de las mesas.
- El delivery **no aparece en el plano**. El plano representa el salón físico; un pedido sin mesa no tiene lugar ahí.
- No se guardan nombre, teléfono ni dirección del cliente: esos datos viven en la plataforma y duplicarlos crea una obligación de resguardo sin beneficio operativo.

## 3. Cambios de esquema

Migración **`021_pedidos_delivery.sql`**.

### `cuentas`

- `mesa_id` pasa a **aceptar NULL**.
- Nueva columna `tipo TEXT NOT NULL DEFAULT 'salon' CHECK (tipo IN ('salon','delivery'))`.
- Nueva columna `referencia_externa TEXT NULL` — número de pedido de la plataforma.

Ambos cambios (nulabilidad y `CHECK` nuevo) obligan a reconstruir la tabla con el patrón puente de las migraciones 008 y 011. Es la segunda reconstrucción de `cuentas` en dos migraciones: **conviene evaluar si 020 y 021 se fusionan en una sola** y se reconstruye una vez.

### El índice único

`cuenta_activa_mesa_unica` se redefine como:

```sql
CREATE UNIQUE INDEX cuenta_activa_mesa_unica
ON cuentas(mesa_id)
WHERE estado IN ('abierta','precuenta_emitida') AND mesa_id IS NOT NULL;
```

SQLite ya trata cada NULL como distinto en un índice único, así que en rigor varias cuentas de delivery no colisionarían ni sin el `AND`. Se agrega igual: dejar la regla explícita evita que alguien la lea mal dentro de un año.

### Estados

No hacen falta estados nuevos. Una cuenta de delivery recorre `abierta` → `confirmada`, saltándose `precuenta_emitida`. La etiqueta en pantalla sí cambia: para delivery, "confirmada" se lee **"Entregado al repartidor"**.

## 4. Crear un pedido de delivery

`POST /api/ordenes` acepta hoy `mesaId`. Pasa a aceptar **una de dos formas**:

| Cuerpo | Efecto |
| --- | --- |
| `{ mesaId, lineas, ... }` | Como hoy: resuelve la cuenta activa de esa mesa o la crea. |
| `{ tipo: "delivery", referenciaExterna, lineas, ... }` | Crea **siempre** una cuenta nueva de tipo `delivery` y le cuelga la orden. |

`crearOrdenDeMesa` se generaliza a `crearOrden`, con un resolvedor que devuelve la cuenta destino en vez de un `mesaId`. La clave de idempotencia sigue siendo la única protección contra el doble envío, y funciona igual en los dos casos.

`referenciaExterna` es obligatoria para delivery: sin ella, quien despacha no puede casar el pedido con la plataforma.

## 5. Cocina: prioridad y reloj

**Orden de las tarjetas:** delivery primero, y dentro de cada grupo las más antiguas arriba.

Ojo con esto: hoy la consulta ordena `c.id DESC` (lo más nuevo arriba). Cambiar a "lo más antiguo primero" es lo correcto para una cola de cocina, **pero solo tiene sentido junto con el archivado de comandas terminadas**. Mientras la pantalla acumule todo desde el primer día, ordenar por antigüedad pone arriba las comandas más viejas del sistema. Los dos cambios van juntos o ninguno.

**La tarjeta de delivery muestra:**

- distintivo de delivery, visualmente inconfundible;
- la referencia externa como identificador principal — `Delivery · #A4F2` donde una mesa diría `Mesa #7`;
- el **tiempo transcurrido** desde el envío, en grande.

`referenciaDe` ya contempla el caso sin mesa (devuelve "Sin mesa" para las comandas legacy), así que es una rama más, no una reescritura. El cálculo del tiempo tampoco es código nuevo: `esperaMinutos` y `nivelEspera` en `modules/tiempo.ts` ya lo hacen para las barras del plano y se reutilizan tal cual.

## 6. Órdenes: carril propio

`listarCuentasActivas` agrega `tipo` y `referenciaExterna`, y `mesa` pasa a ser nulable.

La pantalla Órdenes se parte en dos secciones: **Delivery** arriba, **Salón** abajo. Cada tarjeta de delivery lleva su referencia externa y un botón directo de **Entregar al repartidor**, que es la confirmación del consumo. Un pedido de delivery no necesita abrirse para operarlo: se crea, se envía y se despacha.

## 7. Radio de impacto

Todo lo que hoy asume que una cuenta tiene mesa y va a fallar si no se toca:

| Lugar | Qué pasa |
| --- | --- |
| `obtenerCuenta` | `JOIN mesas` pasa a `LEFT JOIN`; `CuentaDetalle.mesa` pasa a nulable |
| `mesaDeCuentaActiva` (rutas/cuentas) | Devuelve el `mesa_id`; con delivery no hay. Debe devolver la cuenta, no la mesa |
| `snapshotCuenta` | Usa `cuenta.mesa.numero` sin protección |
| `ordenParaCorregir` | `JOIN mesas` para `mesa_numero`; pasa a `LEFT JOIN` |
| Ticket de comanda | Imprime `Mesa #N`; necesita la variante `Delivery · #ref` |
| `confirmarConsumoDeCuenta` | `precuenta_obligatoria` no debe aplicar cuando `tipo = 'delivery'` |
| `estadoMesa` / `/api/mesas` | Consultan por `mesa_id`; las filas con NULL nunca calzan. **Sin cambios** |

Esa lista es la razón por la que esto es una semana y no dos días.

## 8. Lo que este diseño no resuelve

**La doble digitación.** Alguien va a escribir cada pedido de delivery dos veces: en la plataforma y acá. Ninguna pantalla arregla eso, y es el riesgo real del proyecto — si el volumen de delivery es alto, el equipo va a dejar de hacerlo en una semana, y entonces el inventario vuelve a mentir **sin que nadie se entere**, que es peor que no tenerlo.

Mitigación mínima mientras tanto: mostrar en la pantalla de inventario **cuándo fue el último pedido de delivery registrado**. Si dice "hace tres días" y el local hace delivery todos los días, la dueña ve sola que las cifras dejaron de ser confiables.

## 9. El camino que sí lo resuelve (diferido)

Averiguar qué plataforma usa el local. Varias entregan el pedido por webhook o lo mandan a una impresora. Leer ese flujo directamente elimina la doble digitación de raíz y probablemente **cuesta menos que la pantalla que este diseño describe**.

Es la primera pregunta que hay que hacer en la visita al local, y su respuesta puede cambiar por completo el orden de este trabajo.

## 10. Criterios de aceptación

1. `POST /api/ordenes` con `{tipo:"delivery", referenciaExterna}` crea una cuenta nueva sin mesa y responde 201.
2. Repetir esa llamada con la misma clave de idempotencia devuelve la misma orden y **no** crea una segunda cuenta.
3. Dos pedidos de delivery simultáneos conviven: el índice único no los bloquea.
4. Enviar una orden de delivery descuenta inventario igual que una de salón.
5. La comanda impresa de un delivery muestra la referencia externa, no un número de mesa.
6. En la pantalla de cocina las tarjetas de delivery aparecen antes que las de salón, con distintivo y tiempo transcurrido.
7. Confirmar una cuenta de delivery funciona **sin precuenta**, aunque `precuenta_obligatoria` esté encendida.
8. Confirmar una cuenta de **salón** sigue exigiendo precuenta cuando la opción está encendida.
9. Una cuenta de delivery nunca aparece en el plano ni afecta el estado de ninguna mesa.
10. La pantalla Órdenes muestra delivery y salón en secciones separadas.
11. Corregir o anular una orden de delivery funciona igual que una de salón.
12. Ninguna consulta lanza excepción por `mesa_id` nulo: cuenta, precuenta, corrección, ticket y listados.
