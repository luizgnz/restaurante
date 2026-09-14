# Revisión UI — operación, turnos y reportes

Fecha: 2026-09-12

## Alcance

Revisión posterior a la implementación de turnos configurables, cierre masivo de jornada y reportes descargables. Se preservó la navegación operativa existente y la dirección visual Casa de barro.

## Verificación responsive

| Ancho | Resultado |
| ---: | --- |
| 390 px | Turnos, cierre y Reportes se apilan en una columna; las acciones de descarga ocupan el ancho útil y la barra inferior permanece visible. Sin desplazamiento horizontal. |
| 768 px | Acciones de jornada envuelven sin superponerse; los cuatro períodos rápidos y las fechas conservan separación. Sin desplazamiento horizontal. |
| 1280 px | Encabezados, filtros y tarjetas aprovechan el ancho sin estirar el texto; acciones alineadas al extremo derecho. Sin desplazamiento horizontal. |

## Hallazgos corregidos

- Las acciones de jornada se superponían en el ancho intermedio. Se permitió el salto de línea y el grupo de apertura ocupa una fila completa cuando hace falta.
- Después de editar las plantillas, el selector podía conservar una opción anterior. Ahora vuelve a seleccionar la plantilla activa predeterminada.
- Los títulos de las tarjetas de Reportes heredaban centrado en teléfono. Se fijó alineación izquierda para lectura rápida.
- La tabla PDF de inventario excedía el ancho A4 horizontal y no repetía encabezados al paginar. Se ajustaron columnas y se repite la cabecera en cada página.
- El encabezado acumulaba cuatro definiciones base y tres variantes móviles para los mismos selectores. Se consolidó en una base y una variante móvil; se conservó únicamente el ajuste estrecho de 390 px.

## Resultado

- Acciones táctiles sin solapamiento.
- Jerarquía consistente con Administración e Inventario.
- Reportes visibles únicamente para los roles aprobados.
- PDF de ventas A4 vertical y PDF de inventario A4 horizontal, con encabezado, período, fecha de generación, tablas paginadas y número de página.
- Documento de inventario de prueba verificado visualmente en cuatro páginas.
- Encabezado y navegación comprobados nuevamente a 390, 768 y 1280 px, sin desbordamiento horizontal ni solapamientos.
