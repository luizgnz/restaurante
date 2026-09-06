# División del PR #5

Fecha: 2026-09-06.

El [PR #5](https://github.com/luizgnz/restaurante/pull/5) se divide en siete entregas para revisar por separado correctitud, flujos operativos, consistencia, cambios visuales, marca y material histórico. No se ha hecho ningún merge ni despliegue como parte de esta división. Los siete PRs se publican en borrador.

## Referencia y conservación

- Repositorio: `luizgnz/restaurante`.
- Base congelada de `feat/nucleo-pos-v1`: `3e3ac875c6260b68c465f82400f488783ac69d92`.
- Cabeza original de `prototype/ui-responsive`: `b5edd01aacd9aedc44260665d3c20737ef29a64f`.
- La rama original se conserva. Incluye la eliminación más reciente de las barras «Últimos» y «Atrasados», que pasa a la entrega 5.
- La división se preparó en un clon temporal, sin cambiar la rama de trabajo ni los archivos del checkout habitual y sin ejecutar scripts sobre la base de datos del restaurante.
- Antes de agregar este informe y actualizar `TAREAS.md`, el árbol de la entrega 7 (`afeb481`) era idéntico al original: `git diff --exit-code b5edd01aacd9aedc44260665d3c20737ef29a64f afeb481` terminó con código 0. Esto incluye recursos, documentación y eliminaciones; no solo el código.
- Las únicas diferencias deliberadas posteriores con el árbol original son este informe y la actualización de `TAREAS.md` para describir la cadena y el pendiente responsive.

## Orden y dependencias

| Orden | PR y alcance | Rama | Base inicial |
| --- | --- | --- | --- |
| 1 | [#6 — correctitud](https://github.com/luizgnz/restaurante/pull/6): stock, contornos, cancelaciones con PIN/motivo/auditoría y redondeo; migraciones, API, UI necesaria y pruebas juntas | `codex/pr5-01-correctitud` | `feat/nucleo-pos-v1` |
| 2 | [#7 — dinero y precuentas](https://github.com/luizgnz/restaurante/pull/7): importes visibles, formato compartido, reimpresión y permisos | `codex/pr5-02-dinero-precuentas` | `codex/pr5-01-correctitud` |
| 3 | [#8 — consistencia](https://github.com/luizgnz/restaurante/pull/8): estados, modales, alertas, carga y eliminación de código muerto | `codex/pr5-03-consistencia` | `codex/pr5-02-dinero-precuentas` |
| 4 | [#9 — base visual](https://github.com/luizgnz/restaurante/pull/9): tokens, tipografía, carta, salón y consolidación de estilos compartidos | `codex/pr5-04-base-visual-salon` | `codex/pr5-03-consistencia` |
| 5 | [#10 — cocina y órdenes](https://github.com/luizgnz/restaurante/pull/10): tablas operativas, acciones por orden y simplificación de barras del salón | `codex/pr5-05-cocina-ordenes` | `codex/pr5-04-base-visual-salon` |
| 6 | [#11 — marca y demo](https://github.com/luizgnz/restaurante/pull/11): logos, favicon, catálogo de 32 productos, 31 fotos y utilidades de demostración | `codex/pr5-06-marca-demo` | `codex/pr5-05-cocina-ordenes` |
| 7 | [#12 — documentación](https://github.com/luizgnz/restaurante/pull/12): auditorías, instrucciones, capturas históricas, propuesta HTML y esta guía | `codex/pr5-07-documentacion` | `codex/pr5-06-marca-demo` |

Son siete, no seis, porque las capturas y la documentación histórica se separan del código y la marca. La base visual de carta y salón permanece junta: la consolidación modifica las mismas reglas y separarla artificialmente implicaría reescribir CSS, no solo dividir el PR. La parte 6 conserva los recursos y scripts que hacen reproducible la demo.

Cada PR muestra únicamente su incremento respecto a la entrega anterior. No son siete PRs independientes: conservan dependencias reales.

## Validación por etapa

Se ejecutaron `npm run build` y `npm test -- --maxWorkers=2` en cada una de las seis etapas de código. Limitar los workers no reduce la selección de pruebas: se ejecutó la suite completa correspondiente a cada etapa.

| Entrega | Commit validado | Build y tipos | Archivos de prueba | Pruebas aprobadas |
| --- | --- | --- | --- | --- |
| 1 | `0070f5b` | Correcto | 74 | 451 |
| 2 | `a6f6282` | Correcto | 75 | 463 |
| 3 | `7d5980d` | Correcto | 74 | 461 |
| 4 | `15e9e2f` | Correcto | 74 | 461 |
| 5 | `e7e79a0` | Correcto | 73 | 460 |
| 6 | `0eabc18` | Correcto | 73 | 460 |

Las cifras de las entregas 1–3 incluyen la corrección de cancelación añadida después de la primera revisión. Las cifras históricas de las entregas 4–6 corresponden a sus cabezas anteriores a esa corrección y deben sustituirse cuando se propague la cabeza final de #8. La entrega 7 no cambia la aplicación respecto a la 6, pero su documentación debe actualizar las cifras finales. Las diferencias en cantidad de pruebas reflejan los cambios de cada etapa, incluidas eliminaciones de componentes.

El estado operativo, los errores pendientes y los pasos de relevo están en `docs/PLAN_MERGE_PRS_6_12.md`.

Estos resultados no sustituyen una prueba manual de los flujos ni la revisión visual de cada estado intermedio. Las capturas incluidas en el PR de documentación son históricas: no certifican visualmente esta cadena.

## Pendiente conocido: salón móvil

La división conserva el defecto ya observado a 390 px: una regla posterior de `.mesa-odoo` con `position: absolute` prevalece sobre `position: static` del layout móvil, y las mesas se solapan. Eliminar las barras del salón no resuelve esa cascada.

Esta entrega no introduce una biblioteca de layout, no migra a CSS Modules ni implementa la corrección responsive. Se requiere una corrección focalizada, evaluación del aislamiento de estilos y revisión actual con capturas a 390/768/1280 px antes de dar por aprobada la parte visual. Mantener los PRs afectados en borrador hasta resolver y verificar el problema.

## Cómo integrar sin mezclar entregas

1. Revisar y aprobar la entrega 1 sobre `feat/nucleo-pos-v1`. Comprobar también migraciones y flujos de negocio antes de integrar.
2. Integrarla con **merge commit**, manteniendo su rama. Así su historia queda dentro de la rama destino y la siguiente entrega conserva un diff pequeño. No usar squash/rebase sin reacomodar previamente las ramas descendientes.
3. Cambiar la base del siguiente PR de la rama intermedia a `feat/nucleo-pos-v1`; comprobar de nuevo el diff, los conflictos y las pruebas. **No pulsar merge mientras su base siga siendo la rama de la entrega anterior.**
4. Repetir en el orden #6 → #7 → #8 → #9 → #10 → #11 → #12. No integrar la parte visual con el defecto móvil sin resolver. Si un PR anterior recibe cambios durante la revisión, propagarlos a los descendientes y repetir sus comprobaciones antes de continuar.
5. Conservar las ramas hasta terminar la cadena. El cierre del PR #5 como sustituido no elimina su rama ni constituye un merge.

La regla general del proyecto sigue siendo integrar en `feat/nucleo-pos-v1`. Las bases intermedias son una excepción temporal para revisar esta división, no nuevos destinos de integración.
