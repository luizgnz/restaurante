# Diseño: confirmar consumo, cocina y destino de lo anulado

**Fecha:** 2026-08-24
**Estado:** borrador — para revisión del dueño del producto
**Alcance:** renombre de "caja" y "KDS" en interfaz, código, API y base de datos; eliminación del rol `caja`; decisión de cocina entre descartar y reutilizar un plato anulado.
**Diferido:** informe de merma por producto (§10), estaciones múltiples, todo lo demás del informe de auditoría.

---

## 1. Problema

**Nombres que prometen lo que el producto no hace.** La especificación cierra el alcance en una línea: *"este sistema no cobra, no abre cajón, no recibe dinero, no hace arqueo"*. Sin embargo el código, la interfaz y el esquema dicen "caja" en cuatro lugares distintos, y la palabra carga tres significados ajenos al producto:

1. el lugar físico donde se paga;
2. el acto de cobrar;
3. el **arqueo** del final del día — que en la jerga del oficio es justo lo que significa "cerrar caja".

Ninguno de los tres describe lo que hace `enviarCuentaACaja`. Lo mismo con "boleta" y "COMPROBANTE" en la impresora de precuenta, que sugieren un documento tributario que este sistema no emite.

**KDS es jerga.** La interfaz ya dice "Cocina" y las etapas están en castellano llano; el problema está en el código y la documentación, donde `kds` obliga a explicar una sigla en inglés para leer un módulo.

**Un rol que sobra.** El rol `caja` existe, tiene permisos en el servidor y **no tiene ningún camino en la interfaz** que le permita ejercerlos (auditoría §2.1). La decisión del dueño lo resuelve por eliminación, no por reparación: quien confirma el consumo es el mesero que atendió la mesa.

**Anular un plato preparado miente sobre el inventario.** Hoy `ajustarConsumoDeCorreccion` devuelve los insumos al stock sin mirar en qué etapa está el plato. Anulas una hamburguesa que cocina ya sirvió y la carne "vuelve" a la despensa. El sistema decide solo algo que en un restaurante real decide el cocinero, mirando el plato: **se descarta o se reutiliza.** Una bebida sin abrir vuelve; una hamburguesa mordida, no.

---

## 2. Decisiones de dominio

- El acto de cerrar una mesa se llama **confirmar el consumo**. Congela la cuenta, firma el inventario, libera la mesa y emite el registro hacia quien cobre. No involucra dinero y el nombre no lo insinúa.
- **Lo ejecuta el mesero.** Cualquier mesero, sin permiso adicional. El rol `caja` se elimina y la opción `enviar_a_caja_requiere_avanzado` desaparece con él.
- **La precuenta y la confirmación siguen siendo dos momentos distintos.** La precuenta es una pregunta al cliente (repetible, reversible, no compromete nada); la confirmación es la respuesta (única, irreversible). Este renombre no toca esa separación.
- El módulo de cocina se llama **cocina** en todas las capas. `KDS` desaparece del código, de las rutas y de la documentación.
- Cuando se anula una línea que **cocina ya tocó**, el stock **no se mueve**: queda una decisión pendiente que resuelve cocina en su pantalla, eligiendo **reutilizar** o **descartar**.
- El corte es la etapa: `por_preparar` significa que nadie tocó el plato, así que los insumos vuelven solos y no se pregunta nada. Desde `en_proceso` en adelante, decide cocina.
- **Reutilizar devuelve los insumos, no el plato.** Es una simplificación consciente: equivale a lo real mientras el siguiente pedido sea del mismo producto con la misma receta, que es el caso normal. Un modelo de "plato armado en espera" queda fuera de alcance.
- Confirmar el consumo **no se bloquea** por decisiones pendientes. El plato físico existe aunque la mesa ya se haya ido; la pendiente sobrevive a la cuenta.
- **Cerrar el turno resuelve las pendientes como descartadas.** Si nadie decidió en toda la jornada, el plato no se reutilizó. Es la regla que impide que la cola crezca sin fin.
- Cocina resuelve **sin PIN**, consistente con la decisión de v1 de que la pantalla de estación está abierta y no registra identidad de cocinero.

---

## 3. Renombre: tabla completa

### 3.1 Caja → confirmar consumo

| Hoy | Nuevo |
| --- | --- |
| `src/modules/caja/caja.ts` | `src/modules/consumo/confirmar.ts` |
| `enviarCuentaACaja()` | `confirmarConsumoDeCuenta()` |
| `enviarACaja()` (legacy) | `confirmarConsumoDePedido()` |
| `quienCobra()` | `quienConfirma()` |
| `CajaError` / `CodigoCaja` | `ConfirmacionError` / `CodigoConfirmacion` |
| `POST /api/cuentas/:id/enviar-caja` | `POST /api/cuentas/:id/confirmar` |
| `POST /api/pedidos/:id/enviar-caja` | se mantiene, ya está marcada deprecada |
| tabla `caja_handoffs` | `consumos_confirmados` |
| `cuentas.estado = 'en_caja'` | `'confirmada'` |
| `pedidos.estado = 'en_caja'` | `'confirmada'` |
| `EstadoMesa = 'en_caja'` | se elimina del tipo (nunca se emite: al confirmar, la mesa queda `libre`) |
| rol `caja` | **eliminado** |
| `AccionPin = "caja"` | `"confirmar"` |
| `firmar(..., momento: "caja")` | `momento: "confirmar"` |
| `firmaReservaEn(politica, "caja")` | `"confirmar"` |
| `PoliticaInventario: "reserva_al_enviar_firme_al_enviar_caja"` | `"reserva_al_enviar_firme_al_confirmar"` |
| config `precuenta_obligatoria_antes_de_caja` | `precuenta_obligatoria` |
| config `enviar_a_caja_requiere_avanzado` | **eliminada** |
| config `impresora_boleta` | `impresora_precuenta` |
| config `plantilla_boleta`, título `"COMPROBANTE"` | `plantilla_precuenta`, título `"PRECUENTA"` |
| `ConfirmarCierreCuenta.tsx` | `ConfirmarConsumo.tsx` |
| Textos: "Enviar a caja", "Cerrar cuenta" | **"Confirmar consumo"** |

### 3.2 KDS → cocina

| Hoy | Nuevo |
| --- | --- |
| `src/modules/kds/kds.ts` | `src/modules/cocina/comandas.ts` |
| `src/modules/kds/incidencias.ts` | `src/modules/cocina/incidencias.ts` |
| `KdsError` | `CocinaError` |
| `tarjetasKds()` / `TarjetaKds` | `tarjetasCocina()` / `TarjetaCocina` |
| `GET /api/kds` | `GET /api/cocina/comandas` |
| `POST /api/kds/lineas/:id/etapa` | `POST /api/cocina/lineas/:id/etapa` |
| `POST /api/lineas/:id/en-proceso` (legacy) | se mantiene, ya está deprecada |
| `ui/src/pantallas/Kds.tsx` | `ui/src/pantallas/Cocina.tsx` |
| `TarjetaKdsUi` | `TarjetaCocinaUi` |
| vista `"kds"` en `Destino` | `"cocina"` |
| clases CSS `.kds`, `.kds-*` | `.cocina`, `.cocina-*` |
| `test/kds.test.ts` | `test/cocina.test.ts` |

### 3.3 No tocar — falsos positivos

Las clases CSS **`modal-caja`** y **`pin-caja`** usan "caja" en su sentido de recipiente, no de cobro. Un reemplazo global las rompería. Igual `almacenable`, `cajón` u otros usos incidentales: la sustitución se hace por identificador, no con `sed` sobre la palabra.

---

## 4. Eliminación del rol `caja`

**Catálogo.** `ROLES` en `empleados.ts` pasa de cinco a cuatro: `administrador`, `mesero`, `cocina`, `inventario`.

**Permisos.** En `rolesDeRuta`, donde hoy dice `["mesero", "caja", "administrador"]` queda `["mesero", "administrador"]`. En `puede()`, la acción `"confirmar"` (antes `"caja"`) la concede `roles.includes("mesero")`, igual que `"enviar"` y `"anular"`.

**`derechoPorRoles`.** Deja de mencionar `caja`. Nota: esta función sigue derivando el derecho del rol, lo que colapsa los tres niveles de la especificación (auditoría §4.5). **Este diseño no lo corrige** — al desaparecer la única opción que consultaba el nivel avanzado, el problema pierde urgencia pero sigue ahí, y merece su propia decisión.

**Migración de personas.** Los empleados que hoy tienen el rol `caja`:

- si además tienen otro rol → se les quita `caja` y se quedan con lo demás;
- si `caja` es su **único** rol → pasan a `mesero`, que es quien hereda la función.

**`vistaInicial`.** Se elimina la rama de `caja`. El orden queda: administrador o mesero → Mesas; cocina → Cocina; resto → Inventario.

---

## 5. Destino de lo anulado

### 5.1 Cuándo se pregunta

En `corregirOrden`, cada línea con delta negativo se reparte según la etapa de sus líneas de comanda:

| Etapa al anular | Qué pasa |
| --- | --- |
| `por_preparar` | Cocina no lo tocó. **Los insumos vuelven al stock de inmediato**, como hoy. No se pregunta. |
| `en_proceso`, `listo`, `servido` | **El stock no se mueve.** Se crea una decisión pendiente para cocina. |
| `cancelado`, `aviso` | No aplica: no hay unidades vivas que anular. |

Una misma anulación puede generar las dos cosas si la línea abarca comandas en etapas distintas.

### 5.2 Qué hace cada destino

- **Reutilizar** → exactamente lo que el sistema hace hoy de forma automática: devuelve primero la reserva y después revierte lo firmado al `on_hand`, contra el libro de inventario de esa línea.
- **Descartar** → los insumos se consumieron sin cobrarse. Se **firma** lo que el libro tenga reservado para esa línea: sale de la reserva y del `on_hand` en firme. El registro queda con `destino = 'descartado'`, que es lo que después alimentará el informe de merma.

La clave: en ambos casos el movimiento sale del **libro** (`orden_linea_inventario`), no de la receta vigente. Si la receta cambió entre el envío y la decisión, se devuelve o se firma exactamente lo que se había apartado. Es la misma regla que ya gobierna las correcciones.

### 5.3 Bordes

- **Cuenta confirmada con pendientes:** se permite. La mesa se libera; la pendiente sigue viva en Cocina.
- **Cierre de turno:** las pendientes sin resolver se marcan `descartado` automáticamente, con `decidida_en` sellado y sin empleado. Impide que la cola crezca entre jornadas.
- **Confirmar el consumo mientras hay pendientes** no altera el total cobrado: la línea anulada ya salió del snapshot, se reutilice o se descarte. El destino solo mueve inventario.
- **Doble decisión:** resolver una pendiente ya resuelta responde `409 pendiente_resuelta`. La ruta es idempotente respecto al stock.

---

## 6. Tablas y migración

Migración **`020_confirmar_consumo_y_merma.sql`**.

### Nueva tabla `anulaciones_pendientes`

- `id INTEGER PRIMARY KEY`
- `orden_id NOT NULL REFERENCES ordenes(id)`
- `correccion_id NOT NULL REFERENCES orden_correcciones(id)`
- `linea_clave TEXT NOT NULL`
- `producto_id NOT NULL REFERENCES productos(id)`
- `cantidad INTEGER NOT NULL` — unidades anuladas pendientes de destino.
- `etapa_al_anular TEXT NOT NULL` — `en_proceso` | `listo` | `servido`. Queda para el informe: no es lo mismo perder algo a medio cocinar que ya servido.
- `destino TEXT NULL CHECK (destino IN ('reutilizado','descartado'))` — `NULL` mientras esté pendiente.
- `decidida_por_empleado_id INTEGER NULL REFERENCES empleados(id)` — `NULL` cuando la resolvió el cierre de turno.
- `creada_en TEXT NOT NULL`
- `decidida_en TEXT NULL`
- `UNIQUE(correccion_id, linea_clave)`
- `CREATE INDEX anulacion_pendiente ON anulaciones_pendientes(destino) WHERE destino IS NULL`

### Renombres de esquema

- `ALTER TABLE caja_handoffs RENAME TO consumos_confirmados` — SQLite ≥ 3.25 conserva índices y actualiza las referencias de clave foránea. Verificar que `legacy_alter_table` esté apagado.
- Renombrar los índices asociados: `handoff_cuenta_unico` → `consumo_confirmado_cuenta_unico`, `handoff_pedido` → `consumo_confirmado_pedido`.

### Cambios de estado

`cuentas.estado` y `pedidos.estado` tienen una restricción `CHECK` con el literal `'en_caja'`. SQLite **no permite alterar un `CHECK`**, así que hace falta reconstruir la tabla con el patrón puente que ya usan las migraciones 008 y 011:

1. crear `cuentas_puente` con el `CHECK` nuevo (`'confirmada'` en lugar de `'en_caja'`);
2. copiar traduciendo el literal;
3. `DROP TABLE cuentas` y renombrar el puente;
4. recrear `cuenta_activa_mesa_unica` y las claves foráneas que apuntaban a `cuentas`.

Mismo procedimiento para `pedidos`. **Es la parte más delicada de la migración** y la que más merece una prueba de ida y vuelta sobre una base con datos.

### Roles

```sql
UPDATE empleado_roles SET rol_clave = 'mesero'
WHERE rol_clave = 'caja'
  AND empleado_id NOT IN (SELECT empleado_id FROM empleado_roles WHERE rol_clave <> 'caja');
DELETE FROM empleado_roles WHERE rol_clave = 'caja';
DELETE FROM roles WHERE clave = 'caja';
```

### Configuración

`loadConfig` ya fusiona con `defaultConfig()`, así que las claves viejas de un `config.json` existente se ignoran solas. Conviene aun así una normalización explícita que traduzca `precuenta_obligatoria_antes_de_caja` → `precuenta_obligatoria` en el primer arranque, para no perder la preferencia del dueño.

---

## 7. API

### Rutas nuevas

| Método | Ruta | Roles | Qué hace |
| --- | --- | --- | --- |
| `POST` | `/api/cuentas/:id/confirmar` | mesero, administrador | Confirma el consumo. Sustituye a `enviar-caja`. |
| `GET` | `/api/cocina/comandas` | cocina, administrador | Sustituye a `GET /api/kds`. |
| `POST` | `/api/cocina/lineas/:id/etapa` | cocina, administrador | Sustituye a `POST /api/kds/lineas/:id/etapa`. |
| `GET` | `/api/cocina/pendientes` | cocina, administrador | Anulaciones esperando destino. |
| `POST` | `/api/cocina/pendientes/:id` | cocina, administrador | Cuerpo `{ destino: "reutilizado" \| "descartado" }`. |

### Códigos de error

- `pendiente_inexistente` → 404
- `pendiente_resuelta` → 409
- `destino_invalido` → 400

Se agregan a `CODIGOS_404` y `CODIGOS_409` en `app.ts`.

### Compatibilidad

Las rutas viejas del modelo de cuentas (`/enviar-caja`, `/api/kds`) **se retiran**, no se marcan deprecadas: no hay clientes externos y la única interfaz se actualiza en el mismo cambio. Las rutas del flujo legacy de `pedidos` que ya llevan encabezado `Deprecation` se quedan como están.

---

## 8. Interfaz

**Cuenta de mesa.** El botón "Cerrar cuenta" pasa a **"Confirmar consumo"**. El modal `ConfirmarCierreCuenta` se renombra a `ConfirmarConsumo` y su texto deja de sugerir cobro: dice qué va a pasar — la mesa se libera y el consumo queda firme.

**Opciones.** Desaparece "Pedir permiso avanzado para cerrar la cuenta". "Pedir precuenta antes de cerrar la cuenta" pasa a "Pedir precuenta antes de confirmar el consumo". El bloque de impresoras deja de hablar de "caja": son **impresora de cocina** e **impresora de precuenta**.

**Cocina.** Nueva sección **"Por resolver"**, arriba de las comandas, con una tarjeta por decisión pendiente: producto, cantidad, mesa, en qué etapa estaba, y dos botones — **Reutilizar** y **Descartar**. Sin PIN. La sección se oculta cuando no hay pendientes.

**Órdenes / plano.** La etiqueta de estado `en_caja` → "Confirmada" donde aparezca. En la práctica casi nunca se ve: una cuenta confirmada sale de las listas activas.

---

## 9. Criterios de aceptación

1. `grep -rn "\bcaja\b" src ui/src --include=*.ts --include=*.tsx --include=*.sql` no devuelve nada fuera de las clases CSS `modal-caja` y `pin-caja` y de comentarios que expliquen el renombre histórico.
2. `grep -rni "kds" src ui/src test` no devuelve nada.
3. `npm run build` (que incluye `tsc --noEmit`) pasa limpio.
4. `npm test` pasa completo, con los tests de `kds.test.ts` migrados a `cocina.test.ts` y los de caja a `confirmar.test.ts`.
5. Una base con datos previos migra sin pérdida: cuentas en `en_caja` quedan en `confirmada`, los handoffs siguen consultables como `consumos_confirmados`, y ningún empleado se queda sin rol.
6. Un empleado que solo tenía rol `caja` puede iniciar sesión, ve Mesas y puede confirmar el consumo de una cuenta.
7. Anular una línea en `por_preparar` devuelve el stock de inmediato y **no** crea pendiente.
8. Anular una línea en `listo` **no mueve stock** y crea exactamente una pendiente.
9. Resolver esa pendiente como `reutilizado` deja el stock idéntico al que había antes de enviar la orden.
10. Resolverla como `descartado` deja `reserved_real` en cero para esos insumos y `on_hand_real` descontado en firme.
11. Resolver dos veces la misma pendiente responde 409 y **no** mueve stock la segunda vez.
12. Cerrar el turno con pendientes las deja todas en `descartado`.
13. Confirmar el consumo de una cuenta con pendientes abiertas funciona, libera la mesa, y la pendiente sigue viva.

---

## 10. Lo que este cambio no hace

No toca ningún otro hallazgo del informe de auditoría. Siguen abiertos y sin fecha:

- el KDS que nunca archiva comandas terminadas;
- la imposibilidad de editar o desactivar un producto;
- la cuenta totalmente anulada que deja la mesa ocupada para siempre;
- la colisión de PIN entre empleados;
- los tres niveles de derecho colapsados en el rol;
- las configuraciones muertas restantes;
- pedido sin mesa, para llevar, transferir/unir/partir, cursos, descuentos, informes.

Tampoco agrega el **informe de merma**, aunque a partir de esta migración los datos para construirlo existen (`anulaciones_pendientes` con `destino`, `etapa_al_anular`, producto y cantidad). Es el siguiente paso natural y probablemente el más barato que vas a tener disponible después de esto.
