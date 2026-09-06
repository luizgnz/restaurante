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

Tabla histórica de la ronda de correcciones. Desde el 2026-09-06 los siete PR están **MERGED** en `feat/nucleo-pos-v1` con merge commits, en el orden #6 → #12:

| PR | Rama integrada | Merge commit en el target | Verificación previa al merge |
| --- | --- | --- | --- |
| [#6](https://github.com/luizgnz/restaurante/pull/6) | `codex/pr5-01-correctitud` · `0070f5b` | `fb7a7e2` | 451/451 pruebas y build verdes |
| [#7](https://github.com/luizgnz/restaurante/pull/7) | `codex/pr5-02-dinero-precuentas` · `686f192` | `2d2d6a2` | 464/464 pruebas, build y revisión visual a 390 px |
| [#8](https://github.com/luizgnz/restaurante/pull/8) | `codex/pr5-03-consistencia` · `f7a8da4` | `7435fd4` | 462/462 en dos corridas, build y revisión visual |
| [#9](https://github.com/luizgnz/restaurante/pull/9) | `codex/pr5-04-base-visual-salon` · `26a9f50` | `a94afde` | Salón móvil medido (0 solapes), 464/464, build y revisión visual |
| [#10](https://github.com/luizgnz/restaurante/pull/10) | `codex/pr5-05-cocina-ordenes` · `9b6fc1b` | `54f4399` | Cocina y Órdenes revisados en funcionamiento, 463/463 |
| [#11](https://github.com/luizgnz/restaurante/pull/11) | `codex/pr5-06-marca-demo` · `16bd1bf` | `809da85` | Marca, catálogo y 31 fotos revisados; licenses y 463/463 |
| [#12](https://github.com/luizgnz/restaurante/pull/12) | `codex/pr5-07-documentacion` · `1994498` | `320b256` | Documentación y capturas de la ronda; verificación final del target en M09 |

GitHub no tiene checks automáticos ni protección de rama configurados; por eso las verificaciones locales documentadas fueron obligatorias y la aprobación formal externa (E02) no se ejecutó: el propietario autorizó el bloque M sin ella.

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
- [x] **I01** Corregir el importe del diálogo de cancelar en #7 (`686f192`) con `dinero()` y regresión UI; 464/464 pruebas, build y revisión visual a 390 px (importe legible, foco contenido, sin scroll horizontal).
- [x] **I02** Propagar #7 a #8 (`f7a8da4`) y revalidar: 462/462 en dos corridas completas consecutivas (la primera tuvo un fallo inestable de `sesion-roles-api` que no se reprodujo), build y revisión visual con capturas de salón y cuenta.
- [x] **I03** Propagar #8 a #9 y separar el plano móvil del editor (`26a9f50`): modificadores `plano-mapa--operativo`/`mesa-odoo--operativa`, contrato responsive de un solo breakpoint documentado en CSS, prueba estructural `test/plano-movil.test.ts`; mediciones con 0 solapes y 0 desbordes a 390/768/1280 y flujo móvil completo.
- [x] **I04** Estabilizar la suite bajo carga paralela (`4bca1f5`, timeout de 20 s en `sesion-roles-api` con el patrón de `test/empleados.test.ts`) y limpiar el whitespace de la licencia OFL (`f61a191`) que rompía `git diff --check`.
- [x] **I05** Propagar #9 a #10 (`9b6fc1b`, con resolución de dos conflictos: `LineaVigente` + campos nuevos en `listar.ts`, y descarte de la grilla móvil antigua y las reglas muertas `pisos-der` en `styles.css`), #10 a #11 (`002dd31`) y #11 a #12.
- [x] **I06** Hacer que `scripts/cargar-fotos-carta.ts` respete `RESTAURANTE_DATA_DIR` (`16bd1bf`). Incidencia: antes del fix el script llegó a ejecutarse una vez contra la base real; se verificó contra su propio respaldo que no hubo cambio efectivo (33 fotos antes y después, hashes MD5 de `foto_data` idénticos).
- [x] **I07** Publicar comentarios de revisión con evidencia en #7, #8, #9, #10 y #11.

## Pendientes pequeños y deterministas

### A. Corregir el PR #7

- [x] **A01 — Sincronizar la rama.** Cambiar a `codex/pr5-02-dinero-precuentas`, hacer `git fetch origin` y confirmar que `HEAD` sea `a6f6282` o un descendiente. Salida: `git status --short` solo puede mostrar el enlace local `node_modules` ya conocido.
- [x] **A02 — Consultar guía frontend.** Leer la skill `modern-web-guidance` y consultar la guía aplicable antes de editar React. Salida: registrar en el comentario de trabajo qué criterio se aplicó.
- [x] **A03 — Formatear el importe.** En `ui/src/pantallas/ConfirmarCancelarCuenta.tsx`, importar `dinero` desde `../../../src/modules/formato.ts` y cambiar `(${totalCentavos})` por `(${dinero(totalCentavos)})`. Salida: no queda interpolación monetaria cruda en ese componente.
- [x] **A04 — Añadir regresión UI.** Crear una prueba que renderice el diálogo con `totalCentavos={8900}`. Salida: el texto contiene `$8.900` y no contiene `$8900`.
- [x] **A05 — Verificar #7.** Ejecutar `npm test`, `npm run build` y `git diff --check codex/pr5-01-correctitud..HEAD`. Salida: todo en verde; registrar cantidades exactas.
- [x] **A06 — Revisar visualmente #7.** Ejecutar la skill `revision-ui` y abrir el diálogo a 390 px con datos temporales. Salida: importe legible, foco contenido, botones visibles y sin scroll horizontal.
- [x] **A07 — Publicar #7.** Commit sugerido: `fix: formatea el total al cancelar una cuenta`. Hacer push y comentar el PR con SHA y verificaciones. Salida: el nuevo SHA aparece en GitHub.

### B. Revalidar el PR #8 y preparar #9

- [x] **B01 — Propagar #7 a #8.** En `codex/pr5-03-consistencia`, fusionar `codex/pr5-02-dinero-precuentas` con merge commit. Mensaje sugerido: `merge: incorporar corrección del pr 7`. Salida: `git merge-base --is-ancestor codex/pr5-02-dinero-precuentas HEAD` termina en 0.
- [x] **B02 — Verificar #8.** Ejecutar suite completa, build y `git diff --check codex/pr5-02-dinero-precuentas..HEAD`. Salida: todo en verde y cifras anotadas.
- [x] **B03 — Revisión corta de #8.** Confirmar que estados, carga, alertas y diálogos siguen correctos después de B01. Ejecutar `revision-ui` porque el diff contiene UI. Salida: comentario de revisión actualizado en #8.
- [x] **B04 — Propagar #8 a #9.** En `codex/pr5-04-base-visual-salon`, fusionar la cabeza actualizada de #8. Mensaje sugerido: `merge: incorporar correcciones del pr 8`. Salida: #9 contiene el SHA final de #8 y no hay conflictos pendientes.

### C. Corregir el salón móvil en el PR #9

- [x] **C01 — Fijar el contrato responsive.** Documentar en el código: desde 768 px el salón conserva el plano espacial con mesas absolutas; por debajo de 768 px muestra las mismas mesas en una grilla de dos columnas, sin usar coordenadas. Salida: un único breakpoint y ninguna ambigüedad entre plano operativo y editor.
- [x] **C02 — Consultar guía frontend.** Ejecutar primero `modern-web-guidance` para layout responsive, media/container queries y targets táctiles. Salida: decisión registrada antes de editar.
- [x] **C03 — Separar el plano operativo del editor.** Añadir un modificador exclusivo al salón, por ejemplo `plano-mapa--operativo` y `mesa-odoo--operativa`. No aplicar el modificador en `EditarMapa.tsx`. Salida: el editor continúa usando coordenadas absolutas.
- [x] **C04 — Consolidar la cascada.** Colocar la regla móvil del modificador después de la regla base de `.mesa-odoo`, o aislarla con especificidad explícita del contenedor. En móvil debe establecer `position: static`, `inset: auto`, ancho completo y altura táctil; el contenedor debe usar CSS Grid. Salida: ninguna regla general posterior puede devolver las mesas operativas a `position: absolute`.
- [x] **C05 — No añadir una biblioteca de layout.** Resolver este caso con React y CSS Grid nativo. Una dependencia de drag-and-drop solo se evaluará aparte para el editor si aparece un requisito de arrastre real. Salida: `package.json` y lockfile no cambian por esta corrección.
- [x] **C06 — Añadir pruebas estructurales.** Cubrir que `Plano` lleva el modificador operativo y que `EditarMapa` no lo lleva. Salida: la suite falla si ambos contextos vuelven a compartir el comportamiento móvil.
- [x] **C07 — Medir 390 px.** Con datos temporales, medir los rectángulos de todas las mesas visibles. Salida: cero intersecciones entre mesas, cero desbordamiento horizontal, todas dentro del viewport y targets de al menos 44 × 44 px.
- [x] **C08 — Medir 768 px.** Salida: plano espacial visible, controles accesibles y sin cortes ni desbordamiento horizontal.
- [x] **C09 — Medir 1280 px.** Salida: posiciones del plano conservadas y ninguna regresión de filtros, estados o apertura de mesa.
- [x] **C10 — Recorrer flujo móvil.** A 390 px: filtrar, abrir mesa, iniciar orden, volver al salón y cambiar de piso. Salida: flujo completo sin bloqueo ni scroll horizontal.
- [x] **C11 — Ejecutar revisión visual.** Usar obligatoriamente `revision-ui`; guardar capturas actuales de 390/768/1280 y su `manifest.json`. Salida: la revisión no reporta solapes ni elementos cortados.
- [x] **C12 — Verificar #9.** Ejecutar suite completa, build y diff-check. Salida: todo verde.
- [x] **C13 — Publicar #9.** Commit sugerido: `fix: separar el plano móvil del mapa espacial`. Hacer push y comentar el PR con capturas, SHA y verificaciones.

### D. Propagar y revisar #10–#12

- [x] **D01 — Propagar #9 a #10.** Fusionar la cabeza final de #9 en `codex/pr5-05-cocina-ordenes`. Salida: #10 contiene el arreglo responsive.
- [x] **D02 — Revisar #10 funcionalmente.** Verificar tabla de Cocina, tabla de Órdenes, detalle por orden, cambio de estado y eliminación de barras del salón. Salida: no hay bloqueo funcional ni visual.
- [x] **D03 — Validar #10.** Suite completa, build, diff-check y `revision-ui` a 390/768/1280. Salida: evidencia publicada en #10.
- [x] **D04 — Propagar #10 a #11.** Fusionar la cabeza final de #10 en `codex/pr5-06-marca-demo`. Salida: #11 contiene toda la cadena anterior.
- [x] **D05 — Revisar #11.** Comprobar logos, favicon, catálogo de 32 productos, 31 fotos y `assets/fotos-carta/manifest.json`. No ejecutar scripts de demo sobre datos reales. Salida: archivos atribuibles y aplicación inicia con datos temporales.
- [x] **D06 — Validar #11.** Suite completa, build, `npm run licenses`, diff-check y revisión visual de login/carta. Salida: evidencia publicada en #11.
- [x] **D07 — Propagar #11 a #12.** Fusionar la cabeza final de #11 en `codex/pr5-07-documentacion`. Salida: #12 contiene todos los SHAs finales anteriores y conserva este documento.
- [x] **D08 — Actualizar documentación.** Actualizar `docs/DIVISION_PR_5.md`, `TAREAS.md` y la tabla “Estado confirmado” de este archivo con SHAs y cantidades reales. Salida: no quedan cifras anteriores presentadas como vigentes.
- [x] **D09 — Revisar #12.** Confirmar enlaces, manifests de capturas, README, AGENTS y ausencia de binarios temporales, SQLite, builds, ZIP o `node_modules`. Salida: `git status` limpio y diff documental aprobado.

### E. Puerta de aprobación

- [x] **E01 — Quitar borrador solo a PR aprobables.** Un PR puede pasar a “Ready for review” únicamente si sus tareas anteriores están completas y su base sigue siendo la rama esperada.
- [ ] **E02 — Obtener aprobación externa.** Otra cuenta revisa cada PR. Salida: `reviewDecision` es `APPROVED`; un comentario del autor no cuenta como aprobación formal. **No ejecutada, por decisión del propietario (2026-09-06):** `feat/nucleo-pos-v1` no tiene protección de rama que la exija y el dueño autorizó el bloque M sin aprobación formal externa. Queda como deuda de proceso documentada, no como bloqueo técnico.
- [x] **E03 — Comprobar estado antes de merge.** Para cada PR: `isDraft=false`, `mergeable=MERGEABLE`, `mergeStateStatus=CLEAN`, diff esperado y pruebas verdes.
- [x] **E04 — Solicitar autorización final.** Presentar al usuario el estado de los siete PR y pedir autorización explícita para ejecutar el bloque M. Autorización recibida el 2026-09-06 y ejecutada ese mismo día.

## Bloque M — Merge final, uno por uno

No iniciar este bloque solo porque el plan exista. Ejecutarlo únicamente después de E04.

- [x] **M01 — Integrar #6.** Base `feat/nucleo-pos-v1` confirmada; merge commit sin borrar la rama. Salida: #6 `MERGED`, merge commit `fb7a7e2`, el target contiene `0070f5b`.
- [x] **M02 — Cambiar la base administrativa de #7.** Base cambiada a `feat/nucleo-pos-v1` sin rebasear; diff y estado `MERGEABLE/CLEAN` confirmados antes del merge.
- [x] **M03 — Integrar #7.** Merge commit `2d2d6a2`. Salida: #7 `MERGED`.
- [x] **M04 — Retarget e integrar #8.** Retarget y merge commit `7435fd4`. Salida: #8 `MERGED`.
- [x] **M05 — Retarget e integrar #9.** Retarget y merge commit `a94afde`; capturas responsive de la ronda C revisadas antes. Salida: #9 `MERGED` sin el bloqueo móvil.
- [x] **M06 — Retarget e integrar #10.** Retarget y merge commit `54f4399`; el incremento verificado es Cocina/Órdenes. Salida: #10 `MERGED`.
- [x] **M07 — Retarget e integrar #11.** Retarget y merge commit `809da85`; recursos, fotos y licencias ya revisados en D05/D06. Salida: #11 `MERGED`.
- [x] **M08 — Retarget e integrar #12.** Retarget y merge commit `320b256`; el incremento es documental y de capturas. Salida: #12 `MERGED`, cadena completa integrada.
- [x] **M09 — Verificación final del target.** Sobre `feat/nucleo-pos-v1` en `320b256`: `npm test` 464/464 (75 archivos), `npm run build` sin errores de tipos, `npm run licenses` 24 dependencias OK y humo GUI con datos temporales: salón medido a 390/768/1280 (grilla de 2 columnas bajo 768, plano espacial desde 768; 0 solapes, 0 desbordes, targets ≥ 44 px, sin scroll horizontal) y vista Cocina a 390. Capturas en `capturas/2026-09-06_target-integrado/` con su manifest.
- [x] **M10 — Comprobar árbol final.** `git diff 1994498 320b256` muestra solo dos archivos: `ui/src/pantallas/ConfirmarCancelarCuenta.tsx` y `test/cancelar-cuenta-ui.test.ts`. Explicación: el arreglo final de #7 (`686f192`) no quedó dentro de las ramas #8–#12 (esas ramas conservaban la versión previa del diálogo y no tenían el test), pero como ninguna de ellas modificó esos archivos, el merge de tres vías contra el target —que sí contenía el arreglo por el merge de #7— conservó la versión corregida. El árbol integrado es, por tanto, el árbol de #12 más el arreglo de #7: no hay diferencias de aplicación no documentadas.
- [x] **M11 — Cerrar el seguimiento.** `TAREAS.md` y este plan actualizados con los merge commits y esta verificación. Decisión sobre las ramas: se conservaron hasta verificar el target y luego, por orden del propietario (2026-09-06), se eliminaron remotas y locales (`codex/pr5-01` … `codex/pr5-07` y `prototype/ui-responsive`); sus cabezas siguen accesibles en `refs/pull/5..12/head`. Ese mismo día se creó `main` como rama por defecto protegida (PRs solo a `main`, con al menos una aprobación obligatoria).

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

Último punto seguro conocido (2026-09-06): **cadena completa integrada**. Los siete PR están `MERGED` en `feat/nucleo-pos-v1` (merge commits `fb7a7e2`, `2d2d6a2`, `7435fd4`, `a94afde`, `54f4399`, `809da85` y `320b256`), el target pasó la verificación final (M09) y el árbol quedó explicado contra la cabeza de #12 (M10). Este plan queda cerrado como relevo operativo. Lo único abierto es la deuda de proceso E02 (aprobación formal externa, omitida por decisión del propietario), ahora mitigada estructuralmente: `main` es rama por defecto protegida y exige al menos una aprobación por PR, de modo que la próxima integración no podrá saltarse esa puerta por ausencia de configuración. Las ramas integradas ya fueron eliminadas. No hay errores funcionales abiertos en ninguna entrega.
