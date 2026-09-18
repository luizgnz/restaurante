# Matriz formal de capturas de interfaz

Fecha de consolidación: 2026-09-12

## Propósito

Unificar la evidencia visual ya disponible para las cinco pantallas operativas principales en teléfono, tablet y monitor. Esta matriz es una referencia de regresión: no sustituye la ronda final de capturas que debe realizarse sobre la versión candidata a entrega.

## Matriz principal

| Pantalla | Teléfono · 390 px | Tablet · 768 px | Monitor · 1280 px | Resultado registrado |
| --- | --- | --- | --- | --- |
| Mesas | [`salon-390.png`](../capturas/2026-09-07_residuos-ui/salon-390.png) | [`salon-768.png`](../capturas/2026-09-07_residuos-ui/salon-768.png) | [`salon-1280.png`](../capturas/2026-09-07_residuos-ui/salon-1280.png) | Plano sin barras decorativas, mesas legibles y navegación consistente. |
| Órdenes | [`pedidos-390.png`](../capturas/2026-09-07_residuos-ui/pedidos-390.png) | [`pedidos-768.png`](../capturas/2026-09-07_residuos-ui/pedidos-768.png) | [`pedidos-1280.png`](../capturas/2026-09-07_residuos-ui/pedidos-1280.png) | Listado operativo con jerarquía y densidad adaptadas al ancho. |
| Cocina | [`cocina-390.png`](../capturas/2026-09-07_residuos-ui/cocina-390.png) | [`cocina-768.png`](../capturas/2026-09-07_residuos-ui/cocina-768.png) | [`cocina-1280.png`](../capturas/2026-09-07_residuos-ui/cocina-1280.png) | Tarjetas completas, acciones por etapa y lectura sin solapamientos. |
| Inventario | [`inventario-390.png`](../capturas/2026-09-07_inventario-horizontal/inventario-390.png) | [`inventario-768.png`](../capturas/2026-09-07_inventario-horizontal/inventario-768.png) | [`inventario-1280.png`](../capturas/2026-09-07_inventario-horizontal/inventario-1280.png) | Tabla compacta con nombres, cifras y unidades explícitas. |
| Opciones | [`opciones-390.png`](../capturas/2026-09-07_residuos-ui/opciones-390.png) | [`opciones-768.png`](../capturas/2026-09-07_residuos-ui/opciones-768.png) | [`opciones-1280.png`](../capturas/2026-09-07_residuos-ui/opciones-1280.png) | Navegación de configuración y controles sin pérdida de jerarquía. |

## Evidencia complementaria más reciente

- Identidad, recorte de logo y empaque: [`capturas/2026-09-12_logo-identidad/manifest.json`](../capturas/2026-09-12_logo-identidad/manifest.json).
- Órdenes, sesión e inventario automático: [`capturas/2026-09-08_ajustes-operativos-ui/manifest.json`](../capturas/2026-09-08_ajustes-operativos-ui/manifest.json).
- Navegación principal sin duplicados: [`capturas/2026-09-07_menu-movil-sin-duplicados/manifest.json`](../capturas/2026-09-07_menu-movil-sin-duplicados/manifest.json).
- Revisión de turnos, cierre y reportes: [`docs/REVISION_UI_OPERACION_2026-09-12.md`](REVISION_UI_OPERACION_2026-09-12.md).

## Criterio para la entrega final

Antes de publicar el manual definitivo se debe repetir esta matriz sobre el mismo commit candidato a entrega, con datos de prueba reproducibles y los tres tamaños exactos: `390 × 844`, `768 × 1024` y `1280 × 900`. Cada captura deberá incluir en su manifiesto el commit, rol, pantalla, estado del flujo y resultado de la revisión.
