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
- [ ] Fase 4 del plan — reevaluada, quedó más chica tras el rediseño de tablas: 4.1 plano responsive (escalar coordenadas bajo 768px; intacto, es lo grueso), 4.2 solo verificación de targets ≥44px (botones con texto en móvil y bottom-nav ya quedaron en el rediseño), 4.3 matriz de pruebas 390/768/1280 de las 5 pantallas core con capturas.
- [x] Fase 5.2 del plan — parcial: skill `revision-ui` creada (`.agents/skills/revision-ui/`); faltan `auditor-pos` y `capturas-release`.
- [ ] Fase 5 del plan — restante: 5.1 cobro real con pagos/boleta/división (brecha #1 para producción; decidir antes el modelo fiscal con el negocio), 5.3 rutina de release, 5.4 endurecer red local (límite de intentos de PIN, expiración de sesiones).
- [ ] Integrar `prototype/ui-responsive` en `feat/nucleo-pos-v1` cuando el prototipo de UI esté estable (PR #5 abierto).
- [x] Cocina y Órdenes rediseñadas como tabla de órdenes (base de la propuesta KDS v2): nuevas arriba, entregadas salen del tablero, alerta ámbar al llegar, acciones por orden en ventana emergente, esperas con chip de color y estado por badge.
- [ ] Retomar la propuesta KDS v2 (`propuestas/cocina-kds-v2.html`) para detalles visuales restantes.
- [ ] Residuos de la Fase 3 (cola de 3.5): ~96 hex sueltos en pantallas viejas, `switch.tsx` para Opciones, pantallas de tabla §5 de MIGRACION_SHADCN sin migrar a JSX, `COLOR_INICIAL` púrpura en CrearProducto.tsx.
- [ ] Limpiar pseudo-fotos de la carta: letras iniciales guardadas como `foto_data` que impiden usar iconos por categoría.
