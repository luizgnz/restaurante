# Tareas pendientes

Lista viva del proyecto. Marcar con `[x]` al completar; agregar nuevos pendientes al final con fecha.

## Ahora

- [x] Decidido: se integran al repo `capturas/` (auditoría, fase 2 y fase 3 del 05-09 + carpeta del 29-08, cada una con su `manifest.json`; el zip queda fuera por `.gitignore`) y `propuestas/cocina-kds-v2.html` (mockup del KDS de cocina: por comenzar / en preparación / listas para salir).
- [x] Revisar la auditoría funcional/UX y el plan de trabajo: `docs/AUDITORIA_FUNCIONAL_UX_2026-09-05.md` y `docs/PLAN_TRABAJO_UI_2026-09-05.md`.
- [x] Fase 0 del plan (correctitud) — COMPLETADA y verificada en GUI: armado multi-grupo (0.1), cancelar cuenta con motivo/PIN (0.2), merma o devolución de insumos configurable (0.3), guarda de etapa + auditoría (0.4), stock al vender (0.5), redondeo (0.6).
- [x] 2.5 del plan — COMPLETADA: limpieza de código muerto (Pedido.tsx, Complementos.tsx, table.tsx, ramas uiVersion, imports al pie).
- [x] Datos de ejemplo del día reiniciados (últimas 2 horas) con `scripts/reiniciar-dia-demo.ts` — respaldo automático de la base antes de tocar.
- [ ] Botón "Reiniciar día de demostración" en Administración (envuelve el script; hoy se corre por terminal).
- [x] Push de los commits locales de la rama `prototype/ui-responsive` (marca, seed, manifest y catálogo completo con fotos — hasta `8399f27`).
- [x] Marca creada: sistema "Turno" (campana) y local "La Olla de Casa" (olla), SVGs en `ui/public/marcas/`, logo en login, favicon y barra; guía en `docs/MARCA.md`.
- [x] Fotos reales de carta para la demo: 13 platos descargados con licencia libre (`assets/fotos-carta/` + manifest con fuente/licencia) y cargadas a la base con `scripts/cargar-fotos-carta.ts`. El seed ya no pisa `foto_data` al reiniciar.
- [x] Catálogo ampliado — COMPLETADO: seed con 32 productos (18 nuevos: chorrillana, pastel de choclo, cazuela de vacuno, salmón, lomo a lo pobre, pisco sour, etc.); "Sándwich de palta" reemplaza a "Palta reina" (sin foto libre disponible). 31 fotos reales cargadas a la base vía `scripts/cargar-fotos-carta.ts`.
- [x] Fotos de `assets/fotos-carta/` integradas al repo (~8 MB, 31 JPG + manifest con fuente/licencia) para que el pipeline sea reproducible en cualquier máquina. La decisión sobre `capturas/` sigue pendiente (ver arriba).
- [ ] Día operativo (nuevo, surgió del KDS): filtrar las consultas de cocina/órdenes por día de servicio y agregar un cierre de día explícito con respaldo y auditoría — evita pedidos fantasma de días anteriores en producción.

## Después

- [x] Fase 1 del plan — COMPLETADA: formato compartido de dinero/fechas, precios y total en el resumen, comanda legible y atribuida por PIN, reimprimir precuenta, PIN configurable por flujo.
- [x] Fase 2 del plan — COMPLETADA: 2.1 mapa central de estados/vocabulario, 2.2 modales Radix + Alerta + ConfirmarDialog, 2.3 skeletons carga≠vacío, 2.4 opciones honestas (fuera pin_momento), 2.5 limpieza de muertos.
- [x] Fase 3 del plan — COMPLETA, incluye 3.5: marca (Fraunces + cobre), grilla de carta, semáforo del salón, cocina operable y consolidación CSS (0 reglas fuera de `@layer components`; pantallas nuevas sin hex sueltos).
- [ ] Fase 4 del plan — 4.1 resuelta con otro enfoque en el PR #9 (`26a9f50`): grilla operativa de dos columnas bajo 768 px en vez de escalar coordenadas, con contrato responsive documentado; 4.2 verificada en esa ronda (targets ≥ 44 px medidos); queda 4.3: matriz formal de capturas 390/768/1280 de las 5 pantallas core (hay capturas actuales de salón, cocina, órdenes, carta y login por ronda, falta unificarlas como matriz).
- [x] Fase 5.2 del plan — parcial: skill `revision-ui` creada (`.agents/skills/revision-ui/`); faltan `auditor-pos` y `capturas-release`.
- [x] Decisión de alcance: no implementar cobro real, efectivo, tarjetas, boleta ni división de pagos dentro de la cadena #6–#12. Los totales vigentes son valores de consumo y auditoría, no pagos.
- [ ] Fase 5 del plan — restante dentro del alcance: 5.3 rutina de release y 5.4 endurecer red local (límite de intentos de PIN, expiración de sesiones). Cualquier módulo de pagos requiere una nueva decisión explícita del negocio.
- [x] 2026-09-06: dividir el PR #5, congelado en `b5edd01`, en siete PRs encadenados (#6–#12), conservando sus cambios y validando cada etapa de código. Ver `docs/DIVISION_PR_5.md`.
- [x] 2026-09-06: revisar técnicamente #6, #7 y #8; corregir en #6 el total de cancelación posterior a correcciones, renombrar “efectivo” a “vigente” y propagar el arreglo hasta #8.
- [x] Corregir en #7 el formato `$8900` del diálogo de cancelación (`686f192`), propagarlo a #8 (`f7a8da4`) y repetir pruebas/revisión visual.
- [x] 2026-09-06: integrar en `feat/nucleo-pos-v1` la cadena #6 → #12 con merge commits y retarget por PR (`fb7a7e2`, `2d2d6a2`, `7435fd4`, `a94afde`, `54f4399`, `809da85`, `320b256`). Target verificado: 464/464 pruebas, build, licenses y humo GUI 390/768/1280 (`capturas/2026-09-06_target-integrado/`). La aprobación formal externa (E02) no se ejecutó: el propietario autorizó el merge sin ella. El 2026-09-06 se eliminaron las ramas `codex/pr5-*` y `prototype/ui-responsive` por decisión del propietario (sus cabezas siguen accesibles en `refs/pull/N/head`) y se creó `main` como rama por defecto protegida: los PRs se dirigen solo a `main` y exigen al menos una aprobación. Ver `docs/PLAN_MERGE_PRS_6_12.md`.
- [x] 2026-09-06: corregir el solapamiento de mesas del salón en móvil (`26a9f50`): modificadores `plano-mapa--operativo`/`mesa-odoo--operativa` y regla móvil al final de la cascada; verificado con mediciones (0 solapes, 0 desbordes) y capturas actuales a 390/768/1280 px.
- [x] Cocina y Órdenes rediseñadas como tabla de órdenes (base de la propuesta KDS v2): nuevas arriba, entregadas salen del tablero, alerta ámbar al llegar, acciones por orden en ventana emergente, esperas con chip de color y estado por badge.
- [ ] Retomar la propuesta KDS v2 (`propuestas/cocina-kds-v2.html`) para detalles visuales restantes.
- [ ] Residuos de la Fase 3 (cola de 3.5): ~96 hex sueltos en pantallas viejas, `switch.tsx` para Opciones, pantallas de tabla §5 de MIGRACION_SHADCN sin migrar a JSX, `COLOR_INICIAL` púrpura en CrearProducto.tsx.
- [ ] Limpiar pseudo-fotos de la carta: letras iniciales guardadas como `foto_data` que impiden usar iconos por categoría.
