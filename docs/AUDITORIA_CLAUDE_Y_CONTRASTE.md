# Auditoría funcional independiente y contraste con la auditoría previa

**Fecha:** 2026-08-24
**Auditor:** Claude (a ciegas: el código se revisó antes de leer `AUDITORIA_FUNCIONAL_POR_ROL.md`)
**Alcance:** funcional. No cubre rendimiento, seguridad ni calidad de código salvo cuando un defecto de esas áreas impide operar.
**Base de contraste:** `docs/superpowers/specs/2026-08-19-restaurante-funcionalidades-configuraciones.md`, la matriz v1 de la §18.

---

## 1. Veredicto

**El núcleo transaccional está bien construido; el sistema no es operable todavía.** Cuentas, órdenes, correcciones, libro de inventario por línea, idempotencia y sello de precuenta están razonados con cuidado y resisten los bordes que suelen romper un POS. Los problemas están en la periferia: pantallas que no existen, roles que no llegan a su función, y ocho configuraciones que el back-office promete y el código nunca lee.

Las dos auditorías coinciden en el diagnóstico grueso y divergen en tres cosas que importan:

| | Auditoría previa (ChatGPT) | Esta auditoría |
| --- | --- | --- |
| Contra qué mide | La UI tal como está construida | La matriz v1 de tu propia especificación |
| Qué produce | Inventario de pantallas + recomendaciones | Huecos entre lo especificado y lo implementado |
| Sesgo resultante | Califica "Correcto" lo que existe y funciona, aunque no sea lo que pediste | Ignora aciertos de detalle en la UI que sí importan |

Ninguna de las dos sobra. La previa es un mejor mapa de la interfaz; esta es un mejor mapa de la deuda contra el diseño. **Tres hallazgos de cada lado no aparecen en la otra, y los seis son bloqueantes.**

---

## 2. Lo que la auditoría previa no vio

### 2.1 El rol Caja no puede hacer nada de lo que la auditoría previa dice que hace

La auditoría previa afirma (§2 y §4) que Caja puede *"ver cuentas/órdenes, emitir precuenta y completar el cierre según la configuración"*. **En el servidor sí; en la interfaz no hay ningún camino.**

- `vistaInicial` manda a Caja a la pantalla **Órdenes** (`ui/src/App.tsx:56-61`).
- La barra no le muestra **Mesas**: `puedeMesas = admin || mesero` (`App.tsx:548`, `Barra.tsx:109`).
- En Órdenes, tocar una cuenta abre `ModalOrdenesCuenta`, cuyas únicas acciones son **editar** y **anular** orden (`ModalOrdenesCuenta.tsx:6-8`) — y ambas rutas exigen rol `mesero` (`src/http/app.ts:114-116`). Caja recibe 403.
- **Emitir precuenta** y **Enviar a caja** viven en `CuentaMesa` (vista `pedido`), a la que solo se llega desde el Plano (`App.tsx:707-722`). Caja no llega al Plano.

El backend tiene los permisos correctos (`rolesDeRuta` incluye `caja` en `/api/cuentas` y `/api/precuentas`; `puede()` le concede `precuenta` y `caja` en `empleados.ts:216-218`). Es un hueco de UI, no de dominio: falta el botón, no la lógica. Pero el efecto operativo es que **el rol diseñado para el handoff es el único que no puede ejecutarlo**.

### 2.2 Anular un plato ya preparado devuelve el stock al inventario

Tu especificación (§18): *"Cancelación: libera si no está listo; **merma** si ya está listo/servido."*

`ajustarConsumoDeCorreccion` (`src/modules/inventario/asientos.ts:288-318`) aplica el delta negativo devolviendo primero la reserva y después revirtiendo lo ya firmado a `on_hand`. **Nunca consulta la etapa del KDS.** En la misma transacción, `cancelarLineasDeOrden` (`kds.ts:150-162`) sí la consulta y solo cancela líneas en `por_preparar` o `en_proceso`.

Resultado: anulas una hamburguesa que cocina ya marcó `listo` → la línea del KDS queda en `listo` (correcto) y la carne, el pan y el tomate vuelven al stock teórico (incorrecto). El inventario queda por encima del real en cada anulación tardía, y el error se acumula sin señal. La auditoría previa registra "mermas" como algo que Inventario *no contiene todavía*; no detecta que su ausencia produce **stock fantasma** en un flujo que ya está en producción.

### 2.3 Una cuenta con todas sus órdenes anuladas deja la mesa ocupada para siempre

Con la configuración por defecto (`precuenta_obligatoria_antes_de_caja: true`):

1. Anulas todas las órdenes de la mesa 7. Cada orden queda `anulada`; la cuenta vuelve a `abierta` (`correcciones.ts:369-372`).
2. Emitir precuenta falla: `snapshotCuenta` omite las órdenes cuyas líneas quedaron en cero, así que `base.ordenes.length === 0` → `cuenta_sin_consumo` (`precuenta.ts:174-176`).
3. Enviar a caja falla: no hay precuenta → `precuenta_requerida` (`caja.ts:171-173`).
4. La UI ni siquiera ofrece el botón: `puedeCerrar = !precuentaObligatoria || estado === 'precuenta_emitida'` → `false` (`App.tsx:754`).
5. `cuentaActivaPorMesa` sigue devolviendo la cuenta → `estadoMesa` = `en_cocina` → **la mesa nunca vuelve a estar libre**.

El estado `cancelada` existe en el CHECK de la migración (`008_cuentas_ordenes.sql:4`) y en los tipos, y **ninguna ruta lo escribe jamás** (`grep "UPDATE cuentas SET estado"` da tres resultados: `precuenta_emitida`, `en_caja`, `abierta`).

Salida de emergencia actual: un administrador apaga `precuenta_obligatoria_antes_de_caja` en Opciones, cierra la cuenta generando un handoff vacío hacia caja, y la vuelve a encender. Eso ensucia el registro de entregas a caja con documentos falsos.

---

## 3. Lo que la auditoría previa vio y yo no

Reconocimiento honesto: mi pasada a ciegas se concentró en el dominio y perdió tres cosas de la superficie. Las tres son correctas y las verifiqué.

### 3.1 El KDS nunca archiva nada

`tarjetasKds` (`kds.ts:290+`) consulta `FROM comandas ... ORDER BY c.id DESC` **sin filtro de etapa y sin `LIMIT`**. Toda comanda creada desde el primer día del sistema sigue en pantalla. Es la prioridad nº 1 de la auditoría previa y está bien puesta: a la semana de servicio la pantalla de cocina es inusable.

### 3.2 No existe editar ni desactivar un producto

`grep "app.put\|app.delete"` sobre `src/http/app.ts` devuelve cuatro rutas: `/productos/:id/slots`, `/productos/:id/receta`, `/usuarios/:id` y `/plano`. **No hay `PUT /api/productos/:id` ni forma de desactivarlo.** Un precio mal tipeado al crear el producto es permanente. La auditoría previa lo registra como "listado general para editar/desactivar productos" en recomendaciones; merece estar entre los bloqueantes.

### 3.3 "Entregado" está a un botón de distancia

Matiz sobre su hallazgo: el estado `servido` **ya existe** en el backend (`ETAPAS_DESTINO` en `kds.ts:41`) y la UI **ya tiene su etiqueta** ("Entregado", `Kds.tsx:81`). Lo único que falta es el botón: `onCambiarEtapa` está tipado como `"en_proceso" | "listo"` (`Kds.tsx:58`). No es una funcionalidad por diseñar, es una línea por escribir.

---

## 4. Hallazgos adicionales de esta auditoría

Todos verificados contra el código. Ordenados por costo operativo.

| # | Hallazgo | Evidencia | Estado en la spec |
| --- | --- | --- | --- |
| 1 | **No existe pedido sin mesa, barra ni Para llevar.** `enviarOrden` resuelve la cuenta por `mesaId` y falla sin ella; "Nueva orden" abre el constructor con selector de mesa obligatorio. `abrirTab` (sin mesa) es legacy y está marcado deprecado. | `ordenes/enviar.ts:61-72`; `app.ts:827-831` | **v1** (§18: "pedido con/sin mesa"; "Presets Salón y Para llevar") |
| 2 | **Transferir, unir y partir consumo: cero implementación.** Ni ruta, ni módulo, ni UI. `asignarMesa` solo mueve un pedido del modelo legacy. | `grep` sin resultados en `src/` | **v1** (§11 y §18) |
| 3 | **Cursos/tiempos: cero implementación.** | sin ocurrencias de `curso` en `src/` | **v1** (§18: "Cursos con disparo del primero al enviar") |
| 4 | **Aviso o bloqueo por armable: no existe.** `bloqueo_sin_stock` (default `"avisar"`) tiene **0 usos** fuera de `config.ts`. `armableDeProducto` se calcula, viaja en `/api/carta` y la UI lo declara en el tipo (`ConstructorOrden.tsx:14`) **sin renderizarlo nunca**. | `config.ts:33`; `ConstructorOrden.tsx:14` | **v1** (§18) |
| 5 | **Los niveles mínimo/básico/avanzado ya no son asignables.** `derechoPorRoles` los deriva del rol: admin→avanzado, mesero/caja/inventario→básico, resto→mínimo. No existe el "mesero avanzado" (capitán de sala) que la spec describe como quien hace el handoff. Con `enviar_a_caja_requiere_avanzado` encendida, en la práctica **solo el administrador cierra cuentas** (porque el rol Caja no llega a la pantalla, §2.1). | `empleados/empleados.ts:50-54`; `caja.ts:43` | **v1** (§12) |
| 6 | **Ocho configuraciones muertas.** `bloqueo_sin_stock`, `pin_al_emitir_precuenta`, `pin_al_enviar_caja`, `liberar_mesa_cuando`, `bloqueo_inactividad_seg`, `extra_nube`, `acceso_directo`, `url_updates` tienen **0 referencias** fuera de `config.ts`. Además `politica_inventario` sí se usa pero **no es editable**: no aparece en `configPublica` ni en `POST /api/config`, así que la política de inventario está congelada en el default. | `src/config.ts` vs. `grep -r` | mezcla v1/posterior |
| 7 | **El PIN se controla con un solo interruptor.** La spec pide tres momentos independientes (enviar, precuenta, caja); la UI usa `pin_habilitado` para los tres. Y `corregirOrden` **siempre** exige PIN, aunque `pin_habilitado` esté apagado y aunque la corrección solo agregue un producto — usa el derecho `"anular"` para toda corrección. `pin_al_anular` es config muerta. | `correcciones.ts:239`; `App.tsx:433,456,508` | **v1** (§12) |
| 8 | **Colisión de PIN atribuye la orden al empleado equivocado.** `probarPin` recorre todos los empleados activos y devuelve **el primero cuyo hash calce**. No hay unicidad de PIN. Con dos meseros con PIN `1234`, la orden, la precuenta y la auditoría de anulaciones quedan a nombre del que tenga el `id` más bajo. | `empleados.ts:199-207` | rompe v1 ("mesero grabado en el pedido") |
| 9 | **Cubiertos se perdieron en el modelo nuevo.** La tabla `cuentas` no los guarda y el ticket omite la línea; está documentado como decisión (`precuenta.ts:198`), pero la spec los pide en v1 y el modelo legacy sí los tenía. | `precuenta.ts:198`; `print/types.ts:48-52` | **v1** (§18) |
| 10 | **Reimprimir precuenta: backend listo, UI ausente.** `POST /api/precuentas/:id/reimprimir` existe y funciona; **ninguna pantalla la llama**. | `app.ts:958`; `grep reimprimir ui/src` vacío | **v1** (§13.1) |
| 11 | **Sin bloqueo por inactividad ni cambio de empleado en caliente.** El único "lock" es cerrar sesión. `bloqueo_inactividad_seg: 60` es decorativo. | `config.ts:41` | **v1** (§12) |
| 12 | **Estaciones sin enrutamiento.** `categorias_pos.estacion` existe y el seed pone incluso "Bebida" → `cocina`. Nada enruta comandas por estación: un solo KDS, una sola impresora de comanda. | `seed.ts:39-42`; `print/queue.ts` | **v1** (§18: "Bar como segunda estación") |
| 13 | **Descuentos: cero.** Ni % ni cortesía ni precio 0. | sin ocurrencias en `src/` | **v1 mínimo** (§13.2) |
| 14 | **`lineas_sin_enviar_al_enviar_caja` no aplica al modelo nuevo.** En cuentas la orden nace enviada; el borrador vive en `localStorage` del dispositivo. Un borrador sin enviar en la tablet A no bloquea ni avisa al cerrar la cuenta desde la tablet B. | `ui/src/lib/borradores.ts` | **v1** (§13.2) |
| 15 | **Informes v1: cero.** La spec lista cuatro (mesas abiertas, tiempo KDS, armable y quiebres, precuentas emitidas vs. enviadas a caja). Solo hay listas operativas. | §17 | **v1** |
| 16 | **Nomenclatura contradictoria.** `impresora_boleta` / plantilla "COMPROBANTE" en un producto cuya spec dice explícitamente que la precuenta **no es boleta ni factura**. Induce al dueño a configurarla como si emitiera documento tributario. La auditoría previa lo señala en el texto (§Impresión) y acierta. | `config.ts:97-113` | §13.1 |

---

## 5. Dónde las dos auditorías se contradicen

| Punto | Auditoría previa | Esta auditoría | Quién tiene razón |
| --- | --- | --- | --- |
| Caja emite precuenta y cierra | "Sí / Esencial" (matriz §3) | Imposible desde la UI | **Esta.** Verificable: no hay componente que exponga la acción a un usuario sin rol mesero. La previa describió el permiso del servidor, no el camino del usuario. |
| Navegación "Correcto y filtrado" | Correcto | Correcto | **Ambas.** El filtrado por rol existe en cliente y servidor, y está bien hecho. |
| "El cierre libera la mesa" | Correcto | Correcto | **Ambas** — salvo el caso de la cuenta totalmente anulada (§2.3), donde no hay cierre posible. |
| Transferir/unir/partir, cubiertos, armable, estaciones, descuentos | "Recomendado después" | Deuda **v1** | **Esta**, por la fuente: tu propia §18 los marca v1. No es un desacuerdo de observación sino de prioridad. |
| Merma en inventario | "No contiene todavía" (funcionalidad faltante) | Defecto activo que corrompe el stock | **Esta.** No es una función pendiente: es una función existente que se comporta mal. |

---

## 6. Cómo se hizo esta auditoría, y qué no cubre

**Método:** el repositorio se copió al entorno de trabajo con `docs/AUDITORIA_FUNCIONAL_POR_ROL.md` **eliminado**, para auditar sin sesgo de anclaje. Los hallazgos se registraron antes de leer el documento previo. Lectura completa de `src/http/`, `src/modules/`, `src/config.ts`, las 19 migraciones y `ui/src/`; verificación cruzada contra la especificación funcional.

**Limitación que debes conocer:** **no pude ejecutar la suite de tests.** El entorno de la nube no puede compilar `better-sqlite3` (los headers de Node están bloqueados) y el `node_modules` de tu máquina está compilado para macOS-arm64, incompatible con el Linux del puente. Todos los hallazgos son de lectura estática. Ninguno depende de comportamiento en tiempo de ejecución que no se pueda seguir en el código, pero **conviene que ejecutes `npm test` localmente** y me digas si algo sale rojo: los 60 archivos de test podrían contradecir alguna de mis lecturas.

**Un dato del que deberías desconfiar:** de los ~60 archivos de test, **uno solo** (`test/sesion-roles-api.test.ts`) construye la app con `exigirAutenticacion: true`. Los demás corren con el middleware de roles efectivamente desactivado (`app.ts:329`: `if (!deps.exigirAutenticacion && !sesion) return next()`). Producción sí lo activa (`index.ts:45`), así que no es un agujero real — pero significa que **el control de acceso por rol está casi sin cobertura de pruebas**, y es justo donde encontré el hueco de §2.1.

---

## 7. Qué haría yo, en orden

**Criterio decisivo: primero lo que impide operar un turno completo, después lo que impide confiar en los números, y al final lo que falta contra la spec.**

**Bloqueantes de operación (antes de cualquier piloto)**

1. Archivar comandas terminadas en el KDS + botón "Entregado". *(§3.1, §3.3 — la pantalla de cocina es hoy la más frágil.)*
2. Dar salida a la cuenta anulada: ruta `POST /api/cuentas/:id/cancelar` que escriba el estado `cancelada` que ya existe. *(§2.3)*
3. Editar y desactivar productos. *(§3.2)*
4. Camino de UI para Caja: exponer precuenta y enviar-a-caja desde la pantalla Órdenes. La lógica ya está; falta el botón. *(§2.1)*

**Integridad de datos**

5. Merma al anular preparado: consultar la etapa del KDS antes de devolver stock. *(§2.2)*
6. Unicidad de PIN por empleado, con validación al crear y editar. *(§4.8)*

**Deuda v1 declarada**

7. Aviso/bloqueo por armable en el constructor — el dato ya viaja, falta pintarlo. *(§4.4)*
8. Botón de reimprimir precuenta — el endpoint ya existe. *(§4.10)*
9. Pedido sin mesa y preset Para llevar. *(§4.1)*
10. Transferir / unir / partir. *(§4.2)*

**Higiene de configuración**

11. Decidir por cada una de las ocho configuraciones muertas: implementar o borrar. Una opción que el dueño puede tocar y no hace nada es peor que no ofrecerla. *(§4.6)*

**Alternativa si tu prioridad es distinta:** si vas a hacer un piloto en un local real antes de completar v1, invierte el orden y haz 1-6 y nada más; el resto (7-11) es deuda que no impide un servicio de prueba, y el piloto te va a reordenar la lista mejor que cualquier auditoría.

---

## 8. Qué auditar después, cuando la funcionalidad esté completa

En orden de retorno para un POS local que maneja inventario y dinero indirectamente.

**1. Integridad de datos y concurrencia — la más rentable, hazla primero.**
Es donde vive el bug caro de un POS: dos tablets sobre la misma mesa. Aquí el esquema ya te protege bien — verifiqué y `cuenta_activa_mesa_unica` es un índice único parcial sobre `cuentas(mesa_id)` para los estados activos (`008_cuentas_ordenes.sql:11`), igual que las claves de idempotencia y la precuenta vigente. Lo que queda por auditar: transacciones que abarcan un `await` (hay defensas explícitas en `precuenta.ts:170` y `caja.ts:164`, pero conviene verificarlas todas); comportamiento del WAL ante corte de luz; y **una prueba de restauración desde backup, que no vi por ningún lado** — es el hueco más grande de esta categoría.
*Método:* pruebas de carrera con dos clientes concurrentes, más un `fuzz` de secuencias de órdenes/correcciones verificando invariantes (`reservada_real >= 0`, total efectivo = suma del libro).

**2. Seguridad y control de acceso.**
Ya tengo una señal: `asegurarCuentaAdmin` siembra usuario `admin` / contraseña `admin` y el arranque la imprime en consola (`index.ts:56`). Sumado a que el servidor escucha en `0.0.0.0` cuando la red está habilitada, cualquiera en el wifi del local entra como administrador si nadie cambió la contraseña. Qué más auditar: rotación y expiración de tokens de sesión (hoy `maxAge` 12 h sin refresh ni revocación por dispositivo), rate limiting en el PIN (`probarPin` no tiene ninguno — un PIN de 4 dígitos se rompe por fuerza bruta en minutos), y el `logo_data` / `fondo_data` como vector de subida.

**3. Auditoría de recuperación ante fallos.**
Específica de este producto porque hay hardware de por medio. Ya tengo dos señales concretas de `print/queue.ts`: `despacharJobs` reintenta los trabajos `queued`/`failed` **solo cuando algo más dispara un despacho** — no hay temporizador ni espera creciente. Si la impresora está apagada durante el almuerzo, las comandas se acumulan y **la siguiente orden imprime todo el atraso de golpe**; y si nadie manda otra orden, no se imprime nunca. Además `attempts` no tiene tope. Qué más probar: caída del servidor con una comanda a medio imprimir, y pérdida de wifi en la tablet con un borrador cargado (el `localStorage` te salva, pero el reingreso no está probado).

**4. Cobertura y calidad de tests.**
Tienes ~60 archivos, que es mucho, pero la señal de §6 (un solo test con autenticación activa) sugiere que la cobertura es ancha y poco profunda en los caminos de permisos. Vale medir cobertura real por rama y, sobre todo, escribir tests de **flujo completo por rol** — que es exactamente lo que habría detectado el hueco de Caja.

**5. Usabilidad con operadores reales.**
La más barata y la que más te va a sorprender. Un mesero real, un turno real, tomando notas de cada vez que duda. No necesita instrumentación: necesita dos horas y un cuaderno.

**6. Rendimiento — la última, y probablemente innecesaria.**
SQLite local con un restaurante de una sucursal no va a tener problemas de rendimiento salvo por el KDS que acumula comandas sin archivar (§3.1), que ya está en la lista de bloqueantes. Auditar rendimiento antes de arreglar eso sería medir el síntoma equivocado.

**Lo que *no* recomiendo auditar todavía:** arquitectura y deuda técnica. El código está mejor razonado de lo que suele estar a esta altura — los comentarios explican el *por qué* de cada decisión difícil, que es lo que hace mantenible un sistema. Una auditoría de arquitectura ahora te daría opiniones de estilo, no defectos.
