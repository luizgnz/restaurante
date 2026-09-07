# TAREAS v2 — lista viva

Reemplaza a `TAREAS.md` como lista viva desde el 2026-09-06; aquel archivo queda como historial cerrado de las fases 0–5 y de la cadena de PRs #6–#12. Aquí solo entran pendientes: marcar con `[x]` al completar y retirar lo cerrado al publicar el cierre.

Orden deliberado: primero limpieza y eliminación de residuos, después el backlog de producto y operación.

## 1. Limpieza de interfaz y residuos (prioridad)

### Ronda de limpieza de interfaz pedida el 2026-09-06

Cerrada el 2026-09-06 en la rama `feat/limpieza-interfaz` (commits `46757b8` y `5a30116`, capturas en `capturas/2026-09-06_limpieza-ui/`). Además de lo pedido: se retiró el CSS muerto que dejó la ronda (`.salon-odoo__resumen`, `.pos-nav__areas`, `.salon-odoo__eyebrow`), se alineó el panel de menú a la izquierda (la utilidad `justify-center` ganaba por capas), se llevaron los objetivos táctiles del salón y del toggle a 44 px y se borraron los duplicados " 2" del árbol.

- [x] Un solo botón de menú: unificar el icono de menú y el de usuario (hoy solo sirve para cerrar sesión) en un único control.
- [x] Eliminar la barra "Sección actual" del encabezado de la página.
- [x] Unificar mesero/cocina dentro de Órdenes: quitar el cambio de vista global de la pantalla; la sección Órdenes tendrá dos vistas conmutables (toggle, los iconos actuales o ambos): con cocina muestra la tabla que hoy ve el cocinero y con mesero la lista que hoy muestra Órdenes. La vista cocina pasa a llamarse "Órdenes", conservando el diseño actual de cada vista salvo el título.
- [x] Salón: el resumen (libres / en servicio / precuenta / atrasadas) en una misma línea, pudiendo mostrar solo iconos sin texto.
- [x] Encabezado del salón lineal y compacto: el título y el botón "+" de nueva orden no pueden quedar apilados ni ocupar un área tan grande; todo en línea en monitor, tablet y smartphone.
- [x] Pantallas grandes: en monitor el salón deja mucho espacio en blanco; que las mesas y botones se adapten al ancho disponible y se minimicen los huecos innecesarios, apoyándose en las skills de diseño (`frontend-design`, `modern-web-guidance`). La grilla de teléfono gusta como está hoy: no tocarla.

### Residuos de color y código muerto

Cerrados el 2026-09-07 en la misma rama `feat/limpieza-interfaz` (commits `440ff68` y `42a2e9a`, capturas en `capturas/2026-09-07_residuos-ui/`, PR #14 ampliado). Detalle del cierre:

- [x] Púrpura fuera de marca: `COLOR_INICIAL` de `CrearProducto.tsx` pasó al cobre de marca `#8a4a26` (cerrado con la ronda del 2026-09-06).
- [x] ~96 hex sueltos en pantallas viejas: migrarlos a las variables de marca/tokens existentes. Quedaron 0 hex fuera de `:root` en `styles.css` (tokens, `color-mix` para bordes suaves o declaraciones muertas borradas); un token nuevo justificado: `--paper` (crema de tickets).
- [x] `switch.tsx` para Opciones (hoy hay un control ad hoc). Patrón de la casa sin Radix; 12 interruptores migrados; fuera el CSS `switch-tablet`.
- [x] Pantallas de tabla del §5 de `MIGRACION_SHADCN` sin migrar a JSX. Resultó desactualizado: todas ya usan shadcn; el trabajo real era consolidar las familias CSS apiladas (Backend, Categorías, page-header quedaron en una sola generación). Quedan pendientes las pantallas grandes de la tabla §5.
- [x] Pseudo-fotos de la carta: el seed ya no las guarda y cada arranque compara el payload legacy exacto (fotos reales intactas); "Extra" muestra su icono de categoría.

## 2. Backlog de producto y operación

- [x] Botón "Reiniciar día de demostración" en Administración. El botón y `scripts/reiniciar-dia-demo.ts` usan el mismo endpoint administrativo; antes de reemplazar el movimiento crea un respaldo consistente, abre una jornada demo nueva y registra el evento.
- [x] Día operativo: cuentas, órdenes, comandas e incidencias quedan asociadas a una jornada; cocina y Órdenes muestran solo la abierta. Administración permite abrir y cerrar explícitamente, bloquea el cierre con trabajo pendiente y conserva resumen, responsables, horas y ruta del respaldo en la auditoría. Cerrado el 2026-09-07 en `feat/jornada-operativa`, con pruebas de migración, filtros, cierre, respaldo y reinicio, más revisión visual a 390/768/1280.
- [ ] Fase 4.3: matriz formal de capturas 390/768/1280 de las 5 pantallas core, unificando las capturas que ya existen por ronda.
- [ ] Retomar la propuesta KDS v2 (`propuestas/cocina-kds-v2.html`) para detalles visuales restantes, coordinada con el toggle de Órdenes para que no choquen.
- [ ] Fase 5.3 rutina de release y 5.4 endurecer red local (límite de intentos de PIN, expiración de sesiones). Cualquier módulo de pagos requiere decisión explícita del negocio.

## Cómo se trabaja (vigente desde el 2026-09-06)

- `main` es la rama por defecto; el trabajo se integra por PR a `main`.
- Una rama por tarea creada desde `main`; al cerrar, `npm test` y `npm run build` en verde.
- Cambios de interfaz: verificación responsive en monitor, tablet y smartphone (390/768/1280) con capturas en `capturas/<fecha>_<tema>/` y su `manifest.json`.
