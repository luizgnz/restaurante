# Diseño: cuentas de mesa, órdenes y correcciones

**Fecha:** 2026-08-22  
**Estado:** aprobado conceptualmente; pendiente de revisión escrita  
**Alcance:** modelo de datos, estados, flujo POS, cocina y borradores.  
**Diferido:** reservas y bloqueo programado quedan especificados como fase posterior; no forman parte del primer plan de implementación del núcleo.

## 1. Decisiones de dominio

Los conceptos `cuenta` y `orden` son entidades diferentes:

- Una **cuenta** representa el consumo acumulado de una mesa desde la primera orden enviada hasta el handoff a caja.
- Una **orden** representa un grupo concreto de productos enviado junto a cocina.
- Una cuenta contiene una o varias órdenes.
- Una orden enviada queda cerrada. Cualquier cambio posterior crea una **corrección inmutable y auditable**.
- Una **comanda** es la salida operativa a cocina de una orden nueva o de una corrección; no es la cuenta.

La mesa no se ocupa al abrir el selector ni al agregar productos. La cuenta nace y la mesa pasa a ocupada únicamente cuando se envía la primera orden a cocina.

## 2. Relaciones objetivo

```text
mesa 1 ── 0..1 cuenta activa
mesa 1 ── N cuentas históricas
cuenta 1 ── 1..N órdenes
orden 1 ── 1..N líneas
orden 1 ── 0..N correcciones
corrección 1 ── 1..N cambios de línea
orden/corrección 1 ── 1..N comandas de cocina
empleado 1 ── N órdenes/correcciones/actos
```

No existe exclusividad mesa↔mesero. El empleado de referencia es informativo. Cualquier empleado con el permiso correspondiente puede tomar, entregar, corregir, anular, emitir precuenta o hacer el handoff a caja. Cada acto registra quién lo realizó.

## 3. Tablas propuestas

### `cuentas`

- `id`
- `mesa_id NOT NULL`
- `estado`: `abierta | precuenta_emitida | en_caja | cancelada`
- `abierta_por_empleado_id`
- `abierta_en`
- `cerrada_en NULL`
- `nota_privada NULL`

Debe existir como máximo una cuenta activa por mesa mediante índice único parcial.

### `ordenes`

- `id`
- `cuenta_id NOT NULL`
- `numero`: consecutivo dentro de la cuenta
- `estado`: `enviada | corregida | anulada`
- `creada_por_empleado_id`
- `creada_en`
- `indicaciones NULL`

Una orden solo se inserta al enviarla. No existe estado `borrador` en SQLite.

### `orden_lineas`

- `id`
- `orden_id NOT NULL`
- `producto_id NOT NULL`
- `cantidad`
- `precio_centavos`
- `nota NULL`

Representa la versión original enviada.

### `orden_correcciones`

- `id`
- `orden_id NOT NULL`
- `numero_version`
- `motivo NULL` (justificación; obligatorio solo si `justificacion_anulacion` está on y el acto es anulación)
- `es_anulacion` (sí si deja la orden o la línea en cero)
- `creada_por_empleado_id`
- `creada_en`

### `auditoria_anulaciones` (solo se escribe si la opción está on)

Copia para consulta posterior. No sustituye la corrección.

- `id`, `cuenta_id`, `orden_id`, `correccion_id`
- `mesa_numero`, `orden_numero`
- `empleado_id`, `en`
- `resumen` (qué se anuló)
- `justificacion NULL`

### `orden_correccion_lineas`

- `id`
- `correccion_id NOT NULL`
- `orden_linea_id NULL`
- `producto_id NOT NULL`
- `cantidad_anterior`
- `cantidad_nueva`
- `nota_anterior NULL`
- `nota_nueva NULL`

La cantidad nueva puede ser cero. La diferencia enviada a cocina se calcula como `cantidad_nueva - cantidad_anterior`. También se informan cambios de nota o indicaciones aunque la cantidad no cambie.

### Comandas

`comandas` debe referenciar el origen:

- `orden_id NOT NULL`
- `correccion_id NULL`
- `tipo`: `orden | correccion | anulacion`
- empleado y fecha del acto

Las líneas de comanda contienen únicamente lo que cocina debe procesar en ese evento.

## 4. Estados de mesa

La disponibilidad de una mesa es independiente de las cuentas:

- `libre`: sin cuenta activa, reserva ni bloqueo.
- `reservada`: apartada; debe liberarse explícitamente o confirmarse la llegada.
- `bloqueada`: no utilizable hasta liberación explícita.
- `ocupada`: tiene una cuenta activa.

Datos adicionales propuestos en `mesas`:

- `disponibilidad`: `libre | reservada | bloqueada`
- `motivo_bloqueo NULL`
- `bloqueada_por_mesa_id NULL`

`ocupada` se deriva de la cuenta activa y no se guarda en `disponibilidad`.

Para unir mesas, una queda como principal y aloja la cuenta. Las demás quedan `bloqueada`, con `bloqueada_por_mesa_id` apuntando a la principal. No se duplican cuentas.

### Reservas

> **Fase posterior:** esta sección queda documentada, pero se excluye de la implementación del núcleo hasta que Cuenta → Órdenes → Correcciones esté estable.

Las reservas se guardan en una tabla propia para poder listarlas, editarlas, eliminarlas y conservar una separación clara respecto de la mesa:

### `reservas`

- `id`
- `mesa_id NOT NULL`
- `fecha_hora NOT NULL`
- `nombre NULL`
- `rut NULL`
- `contacto NULL`
- `creada_por_empleado_id NULL`
- `creada_en`
- `actualizada_en`

Reglas:

- La fecha y hora son obligatorias y deben estar en el futuro.
- El máximo permitido es exactamente 12 meses desde el momento de creación o edición.
- Nombre, RUT y contacto son datos opcionales. Cada campo se puede habilitar u ocultar independientemente en **Opciones**.
- Ocultar un campo no borra un valor ya guardado; simplemente deja de pedirlo en nuevas ediciones.
- Una mesa puede tener como máximo una reserva activa para la misma fecha y hora. Una mesa puede tener varias reservas futuras si no se superponen.
- Una reserva no crea una cuenta.
- Para usar una mesa reservada se confirma la llegada o se libera la reserva explícitamente.

Configuración en `config.json`:

| Clave | Default | Uso |
| --- | --- | --- |
| `reserva_campo_nombre` | `true` | Muestra el campo opcional Nombre. |
| `reserva_campo_rut` | `false` | Muestra el campo opcional RUT. |
| `reserva_campo_contacto` | `false` | Muestra el campo opcional Contacto. |

No se valida formato de RUT ni contacto en esta entrega; solo se recorta texto y se limita su longitud.

## 5. Borradores

Los borradores se guardan automáticamente en `localStorage`, no en SQLite:

- Constructor general: una clave de borrador temporal.
- Constructor desde mesa libre: clave por mesa.
- Nueva orden desde cuenta abierta: clave por cuenta.
- Incluyen productos, cantidades, notas e indicaciones.
- Se restauran al volver al mismo contexto.
- Se eliminan después de un envío exitoso.
- Si la mesa cambia a reservada, bloqueada u ocupada por otra sesión, se conserva el borrador pero no se permite enviar hasta resolver el conflicto.

El servidor vuelve a validar mesa y cuenta dentro de una transacción; el cache del navegador nunca es fuente de verdad.

## 6. Flujos POS

### Nueva orden desde el menú general

1. Abrir `Nueva orden`.
2. Seleccionar una mesa obligatoriamente.
3. Seleccionar productos y cantidades.
4. Agregar notas por línea e indicaciones generales.
5. Enviar.
6. Si la mesa está libre: crear cuenta + orden + comanda atómicamente.
7. Si la mesa está ocupada: agregar la orden a su cuenta activa.
8. Si está reservada o bloqueada: rechazar hasta liberación explícita.

### Desde una mesa libre

El título indica `Nueva orden · Mesa #X`. La mesa ya está fijada y no se solicita de nuevo. Si se abandona la pantalla, el borrador queda en el navegador; la mesa sigue libre.

Desde la mesa libre también se puede pulsar `Reservar`. Se abre un modal interno con fecha, hora y los campos de persona habilitados en Opciones.

### Desde una mesa ocupada

La pantalla se titula `Cuenta de mesa #X` y muestra:

- Datos generales y estado de la cuenta.
- `Orden #1`, `Orden #2`, etc., cada una con fecha, empleado y estado.
- Productos agrupados dentro de la orden que los originó.
- Botones con iconos y tooltip para `Editar orden` y `Anular orden`.
- Botón principal `Nueva orden`.

No aparece `Enviar` en una orden ya enviada.

`Nueva orden` abre el mismo constructor, con `Mesa #X` fijada. Al enviar, se crea la siguiente orden correlativa y cocina recibe solo sus productos.

### Pantalla Reservas

El menú hamburguesa incorpora el item `Reservas`.

La pantalla muestra las reservas futuras ordenadas por fecha y hora, con mesa, nombre/RUT/contacto disponibles y acciones con iconos para:

- Editar: abre el mismo modal precargado.
- Eliminar: pide confirmación y libera la reserva; no elimina cuentas ni órdenes.
- Confirmar llegada: libera la reserva y abre el constructor `Nueva orden · Mesa #X`. La cuenta solo nace al enviar.

Las reservas vencidas no bloquean una mesa. Se muestran separadas como vencidas hasta eliminarlas o archivarlas.

### Modales de captura

- **Reserva:** los datos de la persona y la fecha/hora se capturan en un modal del sistema (`aria-modal`), no en una pantalla completa.
- **Crear producto:** `CrearProducto` se presenta en un modal sobre la pantalla actual. Guardar cierra el modal y actualiza la carta; cancelar cierra sin cambios.
- Solo puede existir un modal de captura abierto a la vez. Escape cierra, salvo que haya cambios sin guardar; en ese caso se pide confirmación.

## 7. Corrección y anulación

`Editar orden`:

1. Solicita PIN.
2. Abre la orden completa con sus cantidades y notas efectivas.
3. Permite agregar productos, aumentar o reducir cantidades, cambiar notas y dejar una línea en cero.
4. Muestra una vista previa de diferencias.
5. Al confirmar, inserta una corrección; nunca sobrescribe la versión original.
6. Cocina recibe solo las diferencias.

Ejemplos:

```text
CORRECCIÓN · Mesa 7 · Orden 2
- 1 Hamburguesa
+ 2 Jugos
ANULADO: 1 Café
NOTA CAMBIADA: Pizza sin cebolla
```

`Anular orden` es una corrección que deja todas las cantidades efectivas en cero. Siempre exige PIN y genera aviso de anulación a cocina.

Si una corrección posterior vuelve a editar la orden, se compara contra la última versión efectiva, no contra la original.

## 7.1 Auditoría de anulaciones (opcional)

En **Opciones**, sección Seguridad, hay dos interruptores. Ambos vienen **apagados**. No forman parte del flujo diario si el local no los quiere.

| Clave `config.json` | Default | Qué hace |
| --- | --- | --- |
| `auditoria_anulaciones` | `false` | Si está on, cada anulación (orden completa o producto en cero) deja un **registro de auditoría** consultable después: mesa, orden, qué se anuló, quién (PIN), cuándo. |
| `justificacion_anulacion` | `false` | Solo se muestra si la auditoría está on. Si está on, al anular **hay que escribir por qué**. Sin texto no se confirma. El texto queda en el registro. |

Sin auditoría: se anula igual (PIN + cocina + totales). No se pide motivo y no se arma un archivo aparte para revisar después. La corrección operativa sigue existiendo porque la cuenta la necesita.

Con auditoría y sin justificación: se guarda el registro; el motivo puede ir vacío.

Con ambas: registro + motivo obligatorio.

El registro no borra la orden: la orden queda `anulada` y se puede ver en la cuenta y en un listado de auditoría posterior (no hace falta esa pantalla en esta entrega; basta persistir los datos).

## 8. Precuenta y caja

La precuenta se emite sobre la suma efectiva de todas las órdenes y correcciones de la cuenta.

Si se crea una orden o corrección después de una precuenta:

- La precuenta vigente se invalida.
- Se exige emitir una nueva antes del handoff a caja, y esto **no** depende de la configuración: `precuenta_obligatoria_antes_de_caja` decide solo si hace falta una **primera** precuenta. Caja mira la última precuenta de la cuenta sin filtrar por la bandera `vigente` y compara el sello del snapshot con el sello recalculado desde las órdenes; si no coinciden, falla con `precuenta_desactualizada` incluso con la configuración apagada. Cobrar en silencio un total distinto del que el cliente ya vio es peor que pedir una reemisión.
- Sin ninguna precuenta emitida, el error es `precuenta_requerida` y solo aparece cuando la configuración la exige; si no, el handoff genera el snapshot al vuelo.

Quién puede hacer el handoff lo decide `enviar_a_caja_requiere_avanzado`:

- Encendida (default): el PIN necesita derecho avanzado (acción `caja`).
- Apagada: el PIN necesita el mismo derecho que emite la precuenta (acción `precuenta`, básico o avanzado). El derecho `minimo` no alcanza en ningún caso.
- Sin PIN se usa el administrador de la sesión abierta, que siempre es avanzado; ese camino no cambia con la configuración.

El handoff a caja cierra la cuenta y libera la mesa principal y todas las mesas bloqueadas por unión.

El ticket de precuenta de una cuenta no imprime la línea `Cubiertos:` —los cubiertos son del pedido legacy y una cuenta no los guarda— e incluye la nota de cada línea, porque una orden puede llevar dos veces el mismo producto y el nombre solo no las distingue.

## 9. Cocina e impresión

- Orden nueva: cocina recibe solo las líneas de esa orden.
- Corrección: cocina recibe solo diferencias.
- Anulación: cocina recibe el aviso y las líneas anuladas.
- Pantalla KDS agrupa por evento y conserva la referencia `Mesa #X · Orden #N`.
- Los modos siguen siendo `pantalla | impresora | ambas`.

Etapas de `comanda_lineas`:

- Tareas: `por_preparar` y `en_proceso`. Son las únicas que una cancelación puede pisar.
- Terminales: `listo`, `servido`, `cancelado`. No se reescriben nunca: son el dato que dice si hubo merma o si se le cobra al cliente.
- `aviso`: el evento de una corrección que no genera trabajo nuevo (una baja, una anulación, un cambio de nota). La pantalla lo muestra y no lo cuenta como tarea. Una corrección de solo indicaciones no tiene líneas: la comanda de corrección **es** el aviso.

Las cantidades y notas vigentes que muestra la pantalla salen de la versión efectiva de la orden; `comanda_lineas` aporta el avance de cocina y el evento, no el estado del pedido.

`GET /api/kds` lista un evento por tarjeta y mezcla los dos modelos en la misma forma: comandas legacy, órdenes, correcciones y anulaciones. Cocina no tiene por qué saber de qué modelo viene lo que está mirando. La referencia es `Mesa #X · Orden #N`, más `· Corrección #V` o `· Anulación #V` cuando el evento es una corrección; en una comanda legacy el `N` es su `envio_n`, que es el mismo número que la migración usa para reconstruir órdenes (§11.3). La corrección muestra su `delta` además de la cantidad nueva: es la diferencia lo que cocina tiene que atender.

`POST /api/kds/lineas/:id/etapa` solo avanza **tareas**: el origen tiene que ser `por_preparar` o `en_proceso` y el destino `en_proceso`, `listo` o `servido`. `por_preparar` no es destino —volver atrás no es avanzar— y `cancelado` tampoco: lo decide una corrección, no cocina. Un toque en la pantalla no puede pisar un `aviso` ni algo terminal; el intento falla con `etapa_no_avanzable`.

## 9.1 Firmeza de inventario

La firmeza del consumo es un hecho registrado, no derivado del estado de la cuenta: `enviarOrden` y `corregirOrden` devuelven la cuenta a `abierta` a propósito, así que `precuenta_emitida` no sirve como marca de «ya se descontó».

`orden_linea_inventario` guarda, por línea de orden y por insumo, la cantidad por unidad, cuánto sigue reservado y cuánto ya se firmó:

- Envío: `descuento_al_enviar` anota firmado; las políticas de reserva anotan reservado.
- Corrección positiva: unidades nuevas entran reservadas (o firmadas con `descuento_al_enviar`), aunque la línea ya tenga cantidad firmada.
- Corrección negativa: devuelve primero lo reservado y solo después revierte lo firmado al `on_hand`. Nunca devuelve más de lo que el libro registra.
- Precuenta y caja firman **solo lo que sigue reservado**, así que una segunda precuenta sobre una cuenta reabierta no vuelve a descontar lo de la primera ronda.

**Las proporciones son las del envío.** Una línea que ya existía se mueve con el `cantidad_por_unidad` que el libro guardó; solo una línea que **nace** en la corrección expande la receta vigente y crea sus renglones. Si la receta cambia entre el envío y la corrección, la corrección devuelve exactamente lo que se había apartado, incluidos los insumos que la receta nueva ya no usa: si no, esa reserva quedaría colgada para siempre.

**Una línea con insumos y sin renglones no se corrige.** `corregirOrden` falla con `inventario_sin_trazabilidad` antes de escribir nada. Un producto sin inventario rastreado no tiene renglones y eso es normal; una línea que sí consume insumos y no los tiene es trazabilidad perdida, y moverla a ciegas dejaría la reserva previa sin ruta que la libere ni que la firme. Es también el comportamiento para cualquier orden anterior a la migración 010, que no tiene renglones porque el 010 no hace backfill.

**El *cuándo* es del llamador; el *qué* es del libro.** `firmarReservadoDeCuenta` firma todo lo que el libro declara reservado, sin mirar la configuración: deducir el momento de la política **vigente** dejaría reserva colgada para siempre si la política cambia entre el envío y el cobro. Quien llama decide el momento, y para eso existe `firmaReservaEn(politica, momento)`.

**Task 6 sustituye, no suma.** `precuenta.ts` y `caja.ts` pasan a `firmarReservadoDeCuenta` **en lugar de** `firmar` para las unidades del modelo de cuentas. Llamar a las dos descuenta el stock dos veces, y las dos rutas son correctas por separado, así que nada lo delata. El `firmar` legacy sobrevive solo mientras sobreviva el flujo de `pedidos`.

La confirmación de comanda, si está habilitada, muestra exactamente el evento que se enviará: orden nueva o corrección.

## 10. API

Implementada:

```text
POST /api/ordenes
GET  /api/cuentas/:id
POST /api/cuentas/:id/ordenes
POST /api/ordenes/:id/correcciones
POST /api/ordenes/:id/anular
POST /api/cuentas/:id/precuenta
POST /api/cuentas/:id/enviar-caja
GET  /api/kds
POST /api/kds/lineas/:id/etapa
```

Fase posterior (reservas y bloqueos):

```text
POST /api/mesas/:id/reservar
POST /api/mesas/:id/bloquear
POST /api/mesas/:id/liberar
GET  /api/reservas
PUT  /api/reservas/:id
DELETE /api/reservas/:id
POST /api/reservas/:id/confirmar-llegada
```

Las operaciones de creación, corrección y anulación son transaccionales e idempotentes mediante una clave generada por el cliente, para impedir dobles envíos. Un envío nuevo responde `201`; repetir la clave responde `200` con `repetida: true` y los mismos ids, nunca un error: el cliente que reintenta por un timeout no puede distinguir su propio reintento de un fallo real.

`anular` es azúcar sobre `correcciones`: el servidor arma la corrección que deja en cero la versión **vigente** de la orden, repitiendo las notas para no borrarlas de la historia.

### Errores

Un error de dominio nunca es `500`. El código del dominio decide el status:

| Status | Cuándo | Ejemplos |
| --- | --- | --- |
| `400` | El cuerpo o la operación no son válidos | `json_invalido`, `clave_idempotencia_requerida`, `cantidad_invalida`, `orden_sin_productos`, `precuenta_requerida`, `justificacion_requerida` |
| `403` | Credenciales o derecho insuficiente | `pin_invalido`, `sin_derecho`, `credenciales_invalidas` |
| `404` | El recurso nombrado no existe | `cuenta_inexistente`, `orden_inexistente`, `mesa_inexistente`, `producto_inexistente` |
| `409` | Existe, pero su estado no admite la operación | `cuenta_cerrada`, `orden_anulada`, `precuenta_desactualizada`, `etapa_no_avanzable` |

**La autorización va antes que el estado del dominio.** `emitirPrecuentaCuenta` y `enviarCuentaACaja` validan la cuenta antes que el PIN —lo necesitan para releerla dentro de la transacción—, así que la capa HTTP comprueba la autorización antes de dejar salir un error que no sea de credenciales. Sin eso, recorrer ids sin PIN alcanzaba para aprender cuáles existen y en qué estado están por la diferencia entre un `404`, un `409` y un `201`. En el camino feliz no se paga ningún hash extra.

### Rutas del modelo anterior

Las rutas de `pedidos` siguen operativas mientras la UI migra. Cada **mutación** legacy responde con `Deprecation: true` y un `Link: <sucesor>; rel="successor-version"`, y sigue escribiendo **solo** en el modelo anterior: no hay doble escritura que reconciliar después. Las lecturas no llevan aviso.

`POST /api/lineas/:id/en-proceso` es un adaptador de verdad: traduce el id de línea de pedido al de comanda y delega en la misma transición protegida que usa la pantalla nueva. `precuenta` y `enviar-caja` de `pedidos` no pueden delegar en los servicios de cuenta —un pedido legacy no tiene cuenta hasta que la migración de datos lo convierta—, así que siguen sobre el servicio legacy con el encabezado que apunta al sucesor.

## 11. Migración

1. Crear las tablas nuevas sin eliminar las actuales.
2. Convertir cada `pedidos` activo o histórico en una `cuenta`.
3. Agrupar las líneas existentes usando `comandas.envio_n` para reconstruir órdenes enviadas.
4. Convertir líneas todavía `nueva` en borrador local solo si hay un navegador activo; de lo contrario, exportarlas para revisión y no inventar una orden enviada.
5. Migrar precuentas y handoffs a `cuenta_id`.
6. Verificar totales, mesas activas y trazabilidad.
7. Cambiar API/UI.
8. Retirar el modelo anterior en una migración posterior, no en el mismo despliegue.

## 12. Criterios de aceptación

- Una mesa libre no se ocupa por navegar o agregar productos.
- Enviar la primera orden crea exactamente una cuenta y una orden.
- Enviar otra vez desde la cuenta crea `Orden #2`; no modifica `Orden #1`.
- Cocina recibe solo la orden nueva.
- La cuenta muestra productos agrupados por orden.
- Una orden enviada no muestra `Enviar`.
- Editar/anular exige PIN, conserva historial y comunica diferencias.
- Auditoría y justificación de anulaciones están apagadas por defecto; si se encienden, el registro y el motivo (si aplica) quedan guardados.
- Una orden puede quedar completamente en cero mediante corrección.
- La precuenta suma la versión efectiva de todas las órdenes.
- Una mesa reservada o bloqueada no acepta órdenes hasta liberación explícita.
- Una reserva exige fecha/hora futura y no admite más de 12 meses.
- Nombre, RUT y contacto son opcionales y aparecen solo si su opción está habilitada.
- Reservas permite listar, editar, eliminar y confirmar llegada.
- Reserva y Crear producto se muestran como modales internos.
- El borrador sobrevive a recarga en el mismo navegador y no crea filas en SQLite.
- Ningún mesero queda bloqueado por no ser el titular de la mesa.
