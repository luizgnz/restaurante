# Tareas pendientes

Lista viva del proyecto. Marcar con `[x]` al completar; agregar nuevos pendientes al final con fecha.

## Ahora

- [ ] Decidir si se integran al repo `capturas/` (20 capturas del 29-08-2026, ~1 MB, sin contar el zip) y `propuestas/cocina-kds-v2.html` (mockup del KDS de cocina: por comenzar / en preparación / listas para salir).
- [x] Revisar la auditoría funcional/UX y el plan de trabajo: `docs/AUDITORIA_FUNCIONAL_UX_2026-09-05.md` y `docs/PLAN_TRABAJO_UI_2026-09-05.md`.
- [x] Fase 0 del plan (correctitud) — COMPLETADA y verificada en GUI: armado multi-grupo (0.1), cancelar cuenta con motivo/PIN (0.2), merma o devolución de insumos configurable (0.3), guarda de etapa + auditoría (0.4), stock al vender (0.5), redondeo (0.6).
- [x] 2.5 del plan — COMPLETADA: limpieza de código muerto (Pedido.tsx, Complementos.tsx, table.tsx, ramas uiVersion, imports al pie).
- [ ] Hacer push de los commits locales de la rama `prototype/ui-responsive`.

## Después

- [x] Fase 1 del plan — COMPLETADA: formato compartido de dinero/fechas, precios y total en el resumen, comanda legible y atribuida por PIN, reimprimir precuenta, PIN configurable por flujo.
- [x] Fase 2 del plan — COMPLETADA: 2.1 mapa central de estados/vocabulario, 2.2 modales Radix + Alerta + ConfirmarDialog, 2.3 skeletons carga≠vacío, 2.4 opciones honestas (fuera pin_momento), 2.5 limpieza de muertos.
- [~] Fase 3 del plan — 3.1 marca (Fraunces + cobre), 3.2 grilla de carta, 3.3 semáforo del salón y 3.4 cocina operable COMPLETAS. Falta 3.5 (consolidación CSS).
- [ ] Fase 4 del plan: táctil/responsive.
- [x] Skill `revision-ui` creada (`.agents/skills/revision-ui/`) e instalada `frontend-design` de Anthropic (`~/.agents/skills/`) para la Fase 3.
- [ ] Crear skills a medida restantes: `auditor-pos`, `capturas-release`.
- [ ] Integrar `prototype/ui-responsive` en `feat/nucleo-pos-v1` cuando el prototipo de UI esté estable.
- [x] Cocina y Órdenes rediseñadas como tabla de órdenes (base de la propuesta KDS v2): nuevas arriba, entregadas salen del tablero, alerta ámbar al llegar, acciones por orden en ventana emergente, esperas con chip de color y estado por badge.
- [ ] Retomar la propuesta KDS v2 (`propuestas/cocina-kds-v2.html`) para detalles visuales restantes.
