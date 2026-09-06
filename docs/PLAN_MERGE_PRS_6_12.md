# Plan de corrección e integración de los PR #6–#12

Última actualización: 2026-09-06.

Este documento es el relevo operativo para continuar la revisión y el merge de la división del PR #5. Debe mantenerse actualizado: marcar una tarea como hecha solo cuando cumpla su criterio de salida, y registrar el nuevo SHA cuando cambie una rama.

## Objetivo y límites

- Destino final único: `feat/nucleo-pos-v1`.
- Orden obligatorio: **#6 → #7 → #8 → #9 → #10 → #11 → #12**.
- Usar merge commits. No usar squash ni rebase mientras existan ramas descendientes.
- No borrar ninguna rama hasta integrar y verificar el PR #12.
- No ejecutar scripts contra la base SQLite real del restaurante. Usar datos temporales para pruebas manuales.
- Esta cadena **no implementa efectivo, tarjetas, pagos, caja fiscal ni boletas**. `totalCentavos` es el valor vigente del consumo para pantalla y auditoría, no un pago.
- Preparar y revisar no autoriza el merge final. Antes del bloque M se necesita autorización explícita del usuario.
- Los PR fueron creados por `luizgnz`; esa cuenta no puede aprobar sus propios PR. La aprobación formal debe hacerla otra cuenta de GitHub.

## Estado confirmado

| PR | Rama y cabeza actual | Base actual | Estado técnico | Bloqueo antes de merge |
| --- | --- | --- | --- | --- |
| [#6](https://github.com/luizgnz/restaurante/pull/6) | `codex/pr5-01-correctitud` · `0070f5b` | `feat/nucleo-pos-v1` | Corregido; 451/451 pruebas y build verdes | Revisión externa del arreglo y aprobación formal |
| [#7](https://github.com/luizgnz/restaurante/pull/7) | `codex/pr5-02-dinero-precuentas` · `a6f6282` | `codex/pr5-01-correctitud` | Incluye el arreglo de #6; 463/463 pruebas y build verdes | El diálogo de cancelar muestra `$8900` en vez de `$8.900` |
| [#8](https://github.com/luizgnz/restaurante/pull/8) | `codex/pr5-03-consistencia` · `7d5980d` | `codex/pr5-02-dinero-precuentas` | Revisión técnica favorable; 461/461 pruebas y build verdes | Repetir validación después del arreglo futuro de #7; aprobación formal externa |
| [#9](https://github.com/luizgnz/restaurante/pull/9) | `codex/pr5-04-base-visual-salon` · `15e9e2f` | `codex/pr5-03-consistencia` | Sin revisión final | No contiene las últimas correcciones de #8; mesas solapadas a 390 px |
| [#10](https://github.com/luizgnz/restaurante/pull/10) | `codex/pr5-05-cocina-ordenes` · `e7e79a0` | `codex/pr5-04-base-visual-salon` | Sin revisión final | Propagación de #9 y revisión funcional/visual |
| [#11](https://github.com/luizgnz/restaurante/pull/11) | `codex/pr5-06-marca-demo` · `0eabc18` | `codex/pr5-05-cocina-ordenes` | Sin revisión final | Propagación de #10; revisar recursos, licencias y scripts de demo |
| [#12](https://github.com/luizgnz/restaurante/pull/12) | `codex/pr5-07-documentacion` · se actualizará con este plan | `codex/pr5-06-marca-demo` | Sin revisión final | Propagación de #11; actualizar documentos y cifras de validación |

Todos siguen en borrador y GitHub no tiene checks automáticos configurados. Por eso las verificaciones locales documentadas son obligatorias.

## Trabajo ya realizado

- [x] **H01** Cerrar el PR #5 sin fusionarlo y conservar `prototype/ui-responsive` como referencia congelada en `b5edd01`.
- [x] **H02** Dividir el PR #5 en siete PR encadenados, #6–#12.
- [x] **H03** Revisar técnicamente #6, #7 y #8.
- [x] **H04** Reproducir el error de #6: una orden de 2 hamburguesas corregida a 1 guardaba $17.800 al cancelar.
- [x] **H05** Corregir #6 para registrar el total vigente, añadir la regresión 2 → 1 y renombrar la terminología interna de “efectivo” a “vigente”. Commit `0070f5b`.
- [x] **H06** Verificar #6: `npm test` 451/451, `npm run build` correcto y `git diff --check` limpio.
- [x] **H07** Propagar el arreglo de #6 a #7 (`a6f6282`) y #8 (`7d5980d`).
- [x] **H08** Verificar las ramas propagadas: #7 463/463 y #8 461/461; ambos builds correctos.
- [x] **H09** Publicar en #6 el comentario con el arreglo y la evidencia de pruebas.
- [x] **H10** Confirmar que “vigente” no introduce ningún medio de pago.

## Pendientes pequeños y deterministas

### A. Corregir el PR #7

- [ ] **A01 — Sincronizar la rama.** Cambiar a `codex/pr5-02-dinero-precuentas`, hacer `git fetch origin` y confirmar que `HEAD` sea `a6f6282` o un descendiente. Salida: `git status --short` solo puede mostrar el enlace local `node_modules` ya conocido.
- [ ] **A02 — Consultar guía frontend.** Leer la skill `modern-web-guidance` y consultar la guía aplicable antes de editar React. Salida: registrar en el comentario de trabajo qué criterio se aplicó.
- [ ] **A03 — Formatear el importe.** En `ui/src/pantallas/ConfirmarCancelarCuenta.tsx`, importar `dinero` desde `../../../src/modules/formato.ts` y cambiar `(${totalCentavos})` por `(${dinero(totalCentavos)})`. Salida: no queda interpolación monetaria cruda en ese componente.
- [ ] **A04 — Añadir regresión UI.** Crear una prueba que renderice el diálogo con `totalCentavos={8900}`. Salida: el texto contiene `$8.900` y no contiene `$8900`.
- [ ] **A05 — Verificar #7.** Ejecutar `npm test`, `npm run build` y `git diff --check codex/pr5-01-correctitud..HEAD`. Salida: todo en verde; registrar cantidades exactas.
- [ ] **A06 — Revisar visualmente #7.** Ejecutar la skill `revision-ui` y abrir el diálogo a 390 px con datos temporales. Salida: importe legible, foco contenido, botones visibles y sin scroll horizontal.
- [ ] **A07 — Publicar #7.** Commit sugerido: `fix: formatea el total al cancelar una cuenta`. Hacer push y comentar el PR con SHA y verificaciones. Salida: el nuevo SHA aparece en GitHub.

### B. Revalidar el PR #8 y preparar #9

- [ ] **B01 — Propagar #7 a #8.** En `codex/pr5-03-consistencia`, fusionar `codex/pr5-02-dinero-precuentas` con merge commit. Mensaje sugerido: `merge: incorporar corrección del pr 7`. Salida: `git merge-base --is-ancestor codex/pr5-02-dinero-precuentas HEAD` termina en 0.
- [ ] **B02 — Verificar #8.** Ejecutar suite completa, build y `git diff --check codex/pr5-02-dinero-precuentas..HEAD`. Salida: todo en verde y cifras anotadas.
- [ ] **B03 — Revisión corta de #8.** Confirmar que estados, carga, alertas y diálogos siguen correctos después de B01. Ejecutar `revision-ui` porque el diff contiene UI. Salida: comentario de revisión actualizado en #8.
- [ ] **B04 — Propagar #8 a #9.** En `codex/pr5-04-base-visual-salon`, fusionar la cabeza actualizada de #8. Mensaje sugerido: `merge: incorporar correcciones del pr 8`. Salida: #9 contiene el SHA final de #8 y no hay conflictos pendientes.

### C. Corregir el salón móvil en el PR #9

- [ ] **C01 — Fijar el contrato responsive.** Documentar en el código: desde 768 px el salón conserva el plano espacial con mesas absolutas; por debajo de 768 px muestra las mismas mesas en una grilla de dos columnas, sin usar coordenadas. Salida: un único breakpoint y ninguna ambigüedad entre plano operativo y editor.
- [ ] **C02 — Consultar guía frontend.** Ejecutar primero `modern-web-guidance` para layout responsive, media/container queries y targets táctiles. Salida: decisión registrada antes de editar.
- [ ] **C03 — Separar el plano operativo del editor.** Añadir un modificador exclusivo al salón, por ejemplo `plano-mapa--operativo` y `mesa-odoo--operativa`. No aplicar el modificador en `EditarMapa.tsx`. Salida: el editor continúa usando coordenadas absolutas.
- [ ] **C04 — Consolidar la cascada.** Colocar la regla móvil del modificador después de la regla base de `.mesa-odoo`, o aislarla con especificidad explícita del contenedor. En móvil debe establecer `position: static`, `inset: auto`, ancho completo y altura táctil; el contenedor debe usar CSS Grid. Salida: ninguna regla general posterior puede devolver las mesas operativas a `position: absolute`.
- [ ] **C05 — No añadir una biblioteca de layout.** Resolver este caso con React y CSS Grid nativo. Una dependencia de drag-and-drop solo se evaluará aparte para el editor si aparece un requisito de arrastre real. Salida: `package.json` y lockfile no cambian por esta corrección.
- [ ] **C06 — Añadir pruebas estructurales.** Cubrir que `Plano` lleva el modificador operativo y que `EditarMapa` no lo lleva. Salida: la suite falla si ambos contextos vuelven a compartir el comportamiento móvil.
- [ ] **C07 — Medir 390 px.** Con datos temporales, medir los rectángulos de todas las mesas visibles. Salida: cero intersecciones entre mesas, cero desbordamiento horizontal, todas dentro del viewport y targets de al menos 44 × 44 px.
- [ ] **C08 — Medir 768 px.** Salida: plano espacial visible, controles accesibles y sin cortes ni desbordamiento horizontal.
- [ ] **C09 — Medir 1280 px.** Salida: posiciones del plano conservadas y ninguna regresión de filtros, estados o apertura de mesa.
- [ ] **C10 — Recorrer flujo móvil.** A 390 px: filtrar, abrir mesa, iniciar orden, volver al salón y cambiar de piso. Salida: flujo completo sin bloqueo ni scroll horizontal.
- [ ] **C11 — Ejecutar revisión visual.** Usar obligatoriamente `revision-ui`; guardar capturas actuales de 390/768/1280 y su `manifest.json`. Salida: la revisión no reporta solapes ni elementos cortados.
- [ ] **C12 — Verificar #9.** Ejecutar suite completa, build y diff-check. Salida: todo verde.
- [ ] **C13 — Publicar #9.** Commit sugerido: `fix: separar el plano móvil del mapa espacial`. Hacer push y comentar el PR con capturas, SHA y verificaciones.

### D. Propagar y revisar #10–#12

- [ ] **D01 — Propagar #9 a #10.** Fusionar la cabeza final de #9 en `codex/pr5-05-cocina-ordenes`. Salida: #10 contiene el arreglo responsive.
- [ ] **D02 — Revisar #10 funcionalmente.** Verificar tabla de Cocina, tabla de Órdenes, detalle por orden, cambio de estado y eliminación de barras del salón. Salida: no hay bloqueo funcional ni visual.
- [ ] **D03 — Validar #10.** Suite completa, build, diff-check y `revision-ui` a 390/768/1280. Salida: evidencia publicada en #10.
- [ ] **D04 — Propagar #10 a #11.** Fusionar la cabeza final de #10 en `codex/pr5-06-marca-demo`. Salida: #11 contiene toda la cadena anterior.
- [ ] **D05 — Revisar #11.** Comprobar logos, favicon, catálogo de 32 productos, 31 fotos y `assets/fotos-carta/manifest.json`. No ejecutar scripts de demo sobre datos reales. Salida: archivos atribuibles y aplicación inicia con datos temporales.
- [ ] **D06 — Validar #11.** Suite completa, build, `npm run licenses`, diff-check y revisión visual de login/carta. Salida: evidencia publicada en #11.
- [ ] **D07 — Propagar #11 a #12.** Fusionar la cabeza final de #11 en `codex/pr5-07-documentacion`. Salida: #12 contiene todos los SHAs finales anteriores y conserva este documento.
- [ ] **D08 — Actualizar documentación.** Actualizar `docs/DIVISION_PR_5.md`, `TAREAS.md` y la tabla “Estado confirmado” de este archivo con SHAs y cantidades reales. Salida: no quedan cifras anteriores presentadas como vigentes.
- [ ] **D09 — Revisar #12.** Confirmar enlaces, manifests de capturas, README, AGENTS y ausencia de binarios temporales, SQLite, builds, ZIP o `node_modules`. Salida: `git status` limpio y diff documental aprobado.

### E. Puerta de aprobación

- [ ] **E01 — Quitar borrador solo a PR aprobables.** Un PR puede pasar a “Ready for review” únicamente si sus tareas anteriores están completas y su base sigue siendo la rama esperada.
- [ ] **E02 — Obtener aprobación externa.** Otra cuenta revisa cada PR. Salida: `reviewDecision` es `APPROVED`; un comentario del autor no cuenta como aprobación formal.
- [ ] **E03 — Comprobar estado antes de merge.** Para cada PR: `isDraft=false`, `mergeable=MERGEABLE`, `mergeStateStatus=CLEAN`, diff esperado y pruebas verdes.
- [ ] **E04 — Solicitar autorización final.** Presentar al usuario el estado de los siete PR y pedir autorización explícita para ejecutar el bloque M.

## Bloque M — Merge final, uno por uno

No iniciar este bloque solo porque el plan exista. Ejecutarlo únicamente después de E04.

- [ ] **M01 — Integrar #6.** Confirmar base `feat/nucleo-pos-v1`; hacer merge commit sin borrar la rama. Salida: #6 figura `MERGED` y el target contiene `0070f5b`.
- [ ] **M02 — Cambiar la base administrativa de #7.** Cambiar la base del PR #7 a `feat/nucleo-pos-v1`; no rebasear commits. Confirmar que el diff muestre solo la entrega 2. Salida: #7 limpio y aprobable.
- [ ] **M03 — Integrar #7.** Merge commit sin borrar rama. Salida: #7 `MERGED`.
- [ ] **M04 — Retarget e integrar #8.** Cambiar base a `feat/nucleo-pos-v1`, comprobar diff, hacer merge commit. Salida: #8 `MERGED`.
- [ ] **M05 — Retarget e integrar #9.** Repetir el procedimiento; volver a mirar las capturas responsive antes del merge. Salida: #9 `MERGED` sin el bloqueo móvil.
- [ ] **M06 — Retarget e integrar #10.** Comprobar que Cocina/Órdenes constituyan el único incremento. Salida: #10 `MERGED`.
- [ ] **M07 — Retarget e integrar #11.** Comprobar recursos y licencias. Salida: #11 `MERGED`.
- [ ] **M08 — Retarget e integrar #12.** Comprobar que el incremento sea documental. Salida: #12 `MERGED`.
- [ ] **M09 — Verificación final del target.** Desde `feat/nucleo-pos-v1`, ejecutar `npm test`, `npm run build`, `npm run licenses` y humo GUI a 390/768/1280. Salida: todo verde y capturas finales.
- [ ] **M10 — Comprobar árbol final.** Comparar el árbol del target con la cabeza final de #12 y explicar cualquier diferencia. Salida esperada: sin diferencias de aplicación no documentadas.
- [ ] **M11 — Cerrar el seguimiento.** Actualizar `TAREAS.md`, marcar esta lista, publicar resumen final y solo entonces decidir si se eliminan las ramas.

## Comandos de control

Usar estos comandos como plantilla, sustituyendo `N` y la rama correspondiente:

```bash
gh pr view N --json state,isDraft,baseRefName,headRefName,headRefOid,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup
git status --short --branch
git log -1 --oneline
npm test
npm run build
git diff --check BASE..HEAD
```

Para retargetear, únicamente después de que la entrega anterior esté integrada:

```bash
gh pr edit N --base feat/nucleo-pos-v1
```

Para el merge final, únicamente con autorización y aprobación:

```bash
gh pr merge N --merge
```

No usar `--delete-branch` durante la cadena.

## Registro de continuidad

Cuando otro agente tome el trabajo debe:

1. Leer este archivo y `docs/DIVISION_PR_5.md` completos.
2. Consultar GitHub porque SHAs, bases y estados pueden haber cambiado.
3. Encontrar la primera casilla pendiente cuyos prerrequisitos estén completos.
4. Trabajar solo esa tarea o su grupo mínimo; no saltar al merge.
5. Actualizar aquí checkbox, SHA, pruebas y observaciones antes de terminar.

Último punto seguro conocido: #6 está corregido y propagado hasta #8. La siguiente acción de código es **A01**, y el siguiente error que se debe cerrar es el formato `$8900` del PR #7.
