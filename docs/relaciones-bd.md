# Relaciones del dominio y de la base

**Fecha:** 2026-08-22  
**Fuente:** migraciones en `src/db/migrations/` y reglas de `salon`, `pedidos`, `kds`, `precuenta`, `caja`, `inventario`.  
**Persistencia extra:** identidad del local, PIN y apariencia viven en `config.json`, no en SQLite.

Este documento confirma las reglas que pediste, marca lo que **ya se cumple** frente a lo que **aún no está modelado**, y completa el resto de relaciones.

> **Corrección del modelo (implementada):** una mesa se asocia a una **cuenta** y la cuenta a una o varias **órdenes**. Las tablas `cuentas`, `ordenes`, `orden_lineas`, `orden_correcciones` y comandas por orden están en producción (migraciones 008–012); la ocupación de la mesa se deriva de la cuenta activa. El modelo anterior (`pedidos`, `pedido_lineas`) queda solo como respaldo y adaptador deprecado; se retirará en una migración posterior, no en este despliegue. Diseño: `docs/superpowers/specs/2026-08-22-cuentas-ordenes-design.md`.

---

## 1. Reglas confirmadas (salón y servicio)

| Regla | Estado | Cómo está hoy |
| --- | --- | --- |
| El restaurante donde está instalado el sistema debe tener **al menos un piso** | **Intención de producto.** Seed crea el piso “Salón”. **No hay CHECK** en SQLite que impida un local sin pisos. | `pisos` 1—N `mesas`. El editor no debería dejar el salón vacío; falta constraint de instalación. |
| **1 mesa ocupada** tiene **exactamente una cuenta activa** | **Implementado.** Índice único parcial `cuenta_activa_mesa_unica` y `estadoMesa` derivado de la cuenta activa. | La cuenta nace al enviar la primera orden, no al entrar a la mesa ni al crear un borrador. |
| **1 cuenta** tiene **una o varias órdenes enviadas** | **Implementado.** `enviarOrden` resuelve la cuenta activa por mesa dentro de la transacción. | Cada nuevo pedido del cliente crea `Orden #N`; cocina recibe solamente los productos de esa orden. |
| **1 mesa desocupada** no tiene cuenta activa | **Regla confirmada.** | Puede tener cuentas históricas cerradas. Un borrador en cache no ocupa la mesa. |
| **1 mesero atiende una o más mesas** | **Confirmado.** Lo usual: el mismo mesero sigue la mesa. | Un empleado puede actuar sobre varias cuentas activas. |
| **Otra persona puede tomar, entregar o “cobrar” esa mesa** | **Regla de producto: sin restricción de titular.** | Lo excepcional: el mesero no aparece, está en otro piso, o el cliente llama al más cercano. Ese acto es **momentáneo**. Quien pone el PIN (con el derecho de la acción) opera. No se exige que coincida con el empleado de referencia de la cuenta. |
| **1 mesero atiende una o más órdenes** | **Confirmado.** | Cada orden, corrección, comanda, precuenta y handoff registra al empleado que realizó el acto. |

Los borradores no pertenecen a SQLite: se guardan automáticamente en el cache del navegador. Para enviar se exige seleccionar mesa. Un borrador no ocupa ni reserva una mesa.

Estados de mesa objetivo: `libre` | `reservada` | `bloqueada` | `ocupada`. La fase de la cuenta puede mostrarse adicionalmente como `en cocina` o `precuenta`.

Estados de cuenta objetivo: `abierta` | `precuenta_emitida` | `en_caja` | `cancelada`.  
Estados de orden objetivo: `enviada` | `corregida` | `anulada`.

---

## 2. Impresión (anotado; aún no está en la BD)

Hay **tres modos** de salida. Hoy el código siempre encola `print_jobs` y el puerto real es `ConsolePrinter` (log / “impresora de desarrollo”). La confirmación en pantalla de comanda es `confirmar_comanda` en `config.json`. La sección Impresoras de Opciones está deshabilitada (“configuración más adelante”).

| Modo | Qué cubre | Destino típico |
| --- | --- | --- |
| **Por pantalla** | Confirmación de pedido (vista previa de comanda) y/o precuenta en UI | POS / KDS |
| **Por impresora** | Ticket ESC/POS de `comanda`, `precuenta` o `anulacion` vía `print_jobs` | Cocina / barra / precuenta |
| **Ambas** | Mismo evento: preview o KDS **y** job de impresora | Salón + cocina |

Tipos de job ya existentes (`print_jobs.kind`): `comanda` | `precuenta` | `anulacion`.  
`print_jobs` **no** tiene FK a pedido: el vínculo va en el JSON del `payload`.

Cuando se configure, el modo (pantalla / impresora / ambas) debería vivir en `config.json` (o más tarde en tablas de impresoras por estación). No hay que mezclarlo con ocupación de mesas.

---

## 3. Cardinalidades (resto del modelo)

Notación: **1** un lado, **N** muchos, **0..1** opcional.

### 3.1 Local y salón

```
restaurante (instalación)  1 ── 1+  pisos     [producto; no CHECK]
piso                       1 ── N   mesas     (mesa.piso_id NOT NULL)
piso                       1 ── 0..1 fondo    (columnas fondo_* en pisos)
mesa                       1 ── 0..1 estilo   (fondo_color / fondo_data en mesas)
```

Unicidad (aplicación, no índice UNIQUE en SQL): **número de mesa** único entre mesas activas; **nombre de piso** único entre pisos activos.

### 3.2 Cuenta, orden, mesa y mesero

```
mesa            1 ── 0..1  cuenta activa
mesa            1 ── N     cuentas históricas
cuenta          1 ── 1..N  órdenes
orden           1 ── 1..N  líneas
orden           1 ── 0..N  correcciones
empleado        1 ── N     actos: órdenes / correcciones / precuentas / handoffs
sesion_pos      N ── 1     empleado administrador
```

**Titular vs acto.** La cuenta puede mostrar un empleado de referencia, pero **no** significa “solo este empleado puede tocar la mesa”. Cada orden, corrección, precuenta y handoff registra quién hizo ese acto. No se modela una tabla N:N mesa↔empleado: no hace falta para permitir relevos y no debe usarse para bloquearlos.

`sesiones_pos`: un avanzado abre el salón; no está ligada a una cuenta u orden.

### 3.3 Órdenes, cocina, precuenta y caja

```
cuenta          1 ── 1..N  ordenes
orden           1 ── N     orden_lineas
orden_linea     N ── 1     producto
orden           1 ── 0..N  correcciones
orden/corrección 1 ── N    comandas
comanda         1 ── N     comanda_lineas
cuenta          1 ── N     precuentas        (una vigente: vigente = 1)
cuenta          1 ── N     caja_handoffs
caja_handoff    N ── 1     precuenta
```

Ciclo de una cuenta con mesa:

1. Preparar productos → borrador en cache; la mesa sigue libre.  
2. Primer envío → cuenta `abierta` + `Orden #1` + comanda; la mesa queda ocupada.  
3. Segundo pedido del cliente → `Orden #2`; cocina recibe solo sus productos.  
4. Editar una orden enviada → corrección con PIN; cocina recibe solo diferencias.  
5. Precuenta → foto de todas las versiones efectivas de las órdenes.  
6. Enviar a caja → cuenta `en_caja` y mesa libre.

Este producto **no cobra**; caja es handoff.

### 3.4 Carta e inventario

```
categoria_pos   1 ── N     productos         (producto.categoria_id nullable)
producto        1 ── 0..1  stock             (PK = producto_id)
producto kit    1 ── N     receta_lineas     → ingredientes (otros productos)
producto        1 ── N     orden_lineas
```

`tipo_consumo`: `no_almacenable` | `almacenable_unitario` | `receta_kit`.  
`rastrear_inventario` fuerza tracking aunque el tipo no sea almacenable.  
Asientos de stock son **cálculos** sobre `stock`, no una tabla de movimientos.

Código de producto único si no está vacío (`productos_codigo_unico`).

### 3.5 Empleados

```
empleado.derecho ∈ { minimo, basico, avanzado }
usuario único si no es NULL
PIN / password en hash; el PIN identifica **quién hace este acto** (enviar, precuenta, caja, anular, …), no “dueño exclusivo de la mesa”. Cualquier empleado con el derecho de esa acción puede operarla.
```

---

## 4. Diagrama compacto

```text
empleados ─┬─ sesiones_pos
           ├─ ordenes/correcciones ── cuentas ── mesas ── pisos
           ├─ comandas
           ├─ precuentas
           └─ caja_handoffs ── precuentas

mesas ── cuentas ── ordenes ── orden_lineas ── productos ── categorias_pos
                       ├─ correcciones              ├─ receta_lineas
                       └─ comandas                  └─ stock

print_jobs  (payload JSON; sin FK)
config.json (nombre_local, logo, PIN, tipografía, confirmar_comanda, auditoría/justificación de anulaciones, …)
```

---

## 5. Huecos a no olvidar (si se endurece el modelo)

1. Constraint “al menos un piso activo” al arrancar o al borrar el último piso.  
2. Índice UNIQUE de `mesas.numero` (hoy solo validación en `guardarPlano`).  
3. ~~Migrar `pedidos` a `cuentas` + `ordenes` + `correcciones`, conservando historial.~~ **Hecho** (migraciones 008–012 + `migrarPedidosACuentas` al arranque).  
4. Tabla o config de **modo de impresión** (`pantalla` | `impresora` | `ambas`) y, más adelante, impresoras por estación (`categorias_pos.estacion`).  
5. FK de `print_jobs` a orden/corrección/precuenta si se quiere auditoría relacional.
6. ~~Cuenta activa única por mesa mediante índice UNIQUE parcial.~~ **Hecho** (`cuenta_activa_mesa_unica`).
7. **No** añadir candado mesa↔mesero: cada acto registra al empleado que realmente lo hizo.

---

## 5.1 Legado pendiente de retiro

Lo que queda del modelo anterior y su condición de retiro:

- **Tablas:** `pedidos`, `pedido_lineas` y las FK legacy de `precuentas`/`caja_handoffs`. Tras la conversión del arranque quedan como respaldo; se retiran en una migración posterior, nunca en el mismo despliegue que la conversión.
- **Funciones de salón:** `abrirMesa`, `abrirTab`, `asignarMesa`, `borradorSinMesa`, `limpiarPedidosSinMesa`, `pedidoIdAbierto`, `liberarMesa`. Solo las llaman los adaptadores legacy; ninguna ruta nueva ni la UI las usa.
- **Rutas HTTP:** `GET /api/pedidos`, `GET /api/pedidos/:id`, `GET /api/pedidos/:id/comanda-preview` (lecturas sin aviso) y las mutaciones `POST /api/pedidos…`, `POST /api/mesas/:id/abrir`, `POST /api/lineas/:id/…` (responden `Deprecation: true` + `Link` al sucesor). La UI ya no las llama; el circuito nuevo usa `/api/ordenes`, `/api/cuentas` y `/api/kds`.
- **Condición de retiro:** retirar cuando no queden instalaciones con datos sin convertir (el arranque convierte y lanza si algo falla) y el adaptador `en-proceso` deje de usarse en tablets de cocina antiguas.

---

## 6. Resumen en una frase

Un **piso** tiene **mesas**; una mesa ocupada tiene exactamente **una cuenta activa**; la cuenta agrupa **una o varias órdenes**; cada envío nuevo llega separado a cocina; las correcciones conservan historial; cualquier mesero autorizado puede actuar sin candado; la impresión será pantalla, papel o ambas.
