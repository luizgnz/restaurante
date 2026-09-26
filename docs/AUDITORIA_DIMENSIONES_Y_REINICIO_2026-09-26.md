# Auditoría de dimensiones y reinicio · 2026-09-26

Base inicial: `origin/main` en `47a61f0`; después se incorporó `main` `98295b4` con la PR #23 del instalador. Trabajo en `codex/auditoria-responsive`, dentro de `.worktrees/auditoria-responsive`. El checkout principal y la instalación de Windows no se modificaron. La interfaz se probó contra un servidor Go temporal en `127.0.0.1:18080`, con una SQLite nueva y aislada.

## Plan y alcance

1. Revisar navegación, salón, editor de mapa, controles de entrada y ajustes en móvil, tablet y monitor.
2. Contrastar reglas CSS con medidas calculadas en el navegador a 320, 390, 767, 768, 1024, 1280 y 1440 px.
3. Rastrear el botón de reinicio desde Opciones hasta la tarea programada de Windows, sus permisos y la recuperación de configuración.
4. Corregir en esta rama los defectos confirmados y verificar con pruebas y compilación.

## Hallazgos y correcciones de esta rama

| Prioridad | Hallazgo comprobado | Cambio |
| --- | --- | --- |
| P1 | A 390 px aparecía `Restaurante` dos veces; la copia de la barra inferior se cortaba. Una regla tardía anulaba el `display: none` móvil. | Se oculta la identidad de la barra inferior bajo 768 px. La marca permanece en el encabezado. |
| P1 | A 1280 px las mesas medían unos 101 × 101 px dentro de un plano de 1232 px. La escala máxima era 1,05. | La escala llega hasta 1,5 según el ancho, comprueba separaciones y agranda la altura mínima del plano para que las filas no choquen. En la misma vista las mesas pasan a unos 139 × 139 px. |
| P1 | Un viewport de 767,2 px no activaba reglas `max-width: 767px` ni `min-width: 768px`; mostraba el plano de escritorio en un ancho móvil. | Los doce cortes móviles usan `width < 768px`. |
| P2 | Agrandar/Reducir en el editor no mostraba la altura nueva bajo 768 px por una regla de 98 px con `!important`; además un máximo general de 160 px ocultaba los tamaños mayores. | Ambas restricciones se limitan al salón operativo. El editor muestra la medida configurada hasta 220 px. |
| P2 | El editor permitía arrastrar o agrandar mesas hasta fuera del lienzo. | Los límites de posición descuentan el tamaño real de la mesa y un margen de 8 px. |
| P2 | Campos de 14 px podían provocar zoom al enfocarlos en iPhone; el contenido superior no seguía el área segura; el botón de menú medía 42 px de ancho. | Campos móviles de al menos 16 px, desplazamientos con `safe-area-inset-top` y menú táctil de al menos 48 px. |
| P2 | Opciones a 320 px tenía 2 px de desplazamiento horizontal: el campo de archivo oculto heredaba ancho completo. | El campo oculto conserva 1 × 1 px; el ancho de documento volvió a 320 px. |
| P1 | `config.json` se sobrescribía directamente: un corte durante el reinicio podía dejar JSON truncado e impedir el siguiente arranque. Los cambios rápidos podían llegar fuera de orden. | Escritura temporal, sincronización y reemplazo; el frontend envía los cambios en secuencia y espera los pendientes antes de reiniciar; el backend serializa guardados y reinicio. |
| P2 | La UI trataba cualquier respuesta saludable posterior como reinicio exitoso, aunque fuera el proceso anterior. | Cada instancia publica un identificador de arranque. La UI recarga únicamente cuando detecta otro identificador. El script espera a que la tarea se detenga antes de iniciarla. |
| P1 | Al refrescar una sesión vigente aparecía brevemente el login: `null` significaba tanto «consultando» como «sin sesión». | El login se muestra solo tras confirmar una sesión cerrada. Durante la consulta aparece un estado neutro; si falla, ofrece reintentar. La vista inicial del rol se fija antes de mostrar la sesión. |
| P1 | Las mesas de mapas antiguos con coordenadas fuera de 0–100 podían desaparecer del plano; al editar, no había una recuperación clara. | El salón limita solo la posición visual de esas mesas y conserva sus coordenadas guardadas. El editor muestra cada mesa fuera del plano y ofrece traerla dentro mediante una acción explícita que se guarda con los demás cambios. |
| P1 | «Auto» distribuía siempre cuatro columnas: con diez mesas y un mapa estrecho varias quedaban fuera del borde. | El cálculo de columnas recibe el ancho real del mapa y reduce columnas cuando hace falta; conserva la distribución anterior en el ancho habitual. |
| P2 | En móvil, el editor podía superponer mesas y comprimir el lienzo hasta casi desaparecer. | El editor mantiene un lienzo útil de 560 px y permite desplazarlo horizontalmente dentro de su región; la página completa permanece ajustada al viewport. La altura automática responde a las filas calculadas. |
| P2 | «Compacto» y «Grande» cambiaban la raíz tipográfica, pero el cuerpo seguía fijo en 15 px; en 320 px algunos filtros de Inventario recortaban su texto. | El cuerpo usa `1rem`, los controles crecen en «Grande» y los filtros se ordenan en una columna bajo 360 px. |

El botón **Opciones → Red local → Reiniciar Restaurante** ya existía en la base auditada, restringido a administradores. La revisión previa en este Windows documentó un reinicio real con cambio de PID, salud recuperada y dato SQLite conservado en `docs/REVISION_INSTALACION_STACK_2026-09-25.md`. Los cambios de esta rama aún no están instalados ni probados mediante la tarea programada real.

## Verificación y límites

- Navegador local: el error de la marca se reprodujo a 390 px y desapareció tras el cambio. Se inspeccionaron 767 y 768 px; a 767 px el plano usa la cuadrícula móvil y no presenta desplazamiento horizontal. En el editor móvil la mesa conserva 96 × 96 px y ya no tiene un máximo CSS de 160 px.
- Matriz de 45 combinaciones en el servidor temporal: Salón, Órdenes, Inventario, Editar mapa y Opciones × 390/768/1280 px × Compacto/Normal/Grande. Todas sin desplazamiento horizontal del documento ni mesas superpuestas o fuera del lienzo. Se revisaron además los bordes 320, 767, 768 y 1440 px en Grande, incluidos Salón, editor y Opciones. A 320 px Grande se corrigió y volvió a medir el texto de los filtros de Inventario.
- A 1280 px, la medida de mesa pasó de aproximadamente 101 × 101 a 139 × 139 px, sin intersecciones entre las diez mesas iniciales. Las posiciones personalizadas muy juntas limitan la escala.
- Las pruebas nuevas cubren distribución de 10 y 24 mesas en ancho estrecho, posición visible de mesas antiguas y su recuperación explícita desde el editor. `npm test`: **528/528 en 88 archivos**; `npm run test:go`, `npm run build` y `npm run licenses` aprobados.
- La recarga autenticada se comprobó en el navegador contra la base aislada. Tres pruebas de interfaz cubren la espera, la sesión cerrada y el error de conexión; durante la espera no se renderiza el login.
- Quedan por validar en un iPhone físico el área segura y el enfoque de campos, los recorridos completos con teclado/tacto físico y el reinicio de la nueva compilación instalada en un Windows de prueba. Las capturas históricas no prueban esta rama.

## Seguimiento

- Completar recorridos manuales con teclado, tacto y lector de pantalla en dispositivos físicos; la matriz de tamaños y anchos del navegador ya se midió.
- Verificar en una instalación de prueba de Windows que la nueva señal de arranque cambia, que el botón informa fallo si la tarea no reinicia y que `config.json` sigue legible ante interrupciones controladas.
- Probar con datos reales de un local las mesas antiguas fuera del borde y el guardado explícito de su nueva posición.
