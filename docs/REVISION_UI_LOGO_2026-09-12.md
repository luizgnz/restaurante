# Revisión UI — logo e identidad

**Fecha:** 2026-09-12

**Rama:** `codex/seguridad-local`

**Commit base:** `32b8974` + cambios sin commit
**Entorno:** Chromium local contra `http://127.0.0.1:8080/`

## Criterios y evidencia

| Criterio | 390 px | 768 px | 1280 px | Estado |
| --- | --- | --- | --- | --- |
| Nombre del restaurante visible | Encabezado superior compacto | Wordmark centrado | Wordmark centrado | Pasa |
| Logo y nombre simultáneos | Verificado con imagen procesada | La composición usa el mismo componente | La composición usa el mismo componente | Pasa |
| Selector comprensible | Formatos y 5 MB visibles | Dos columnas sin solape | Panel amplio sin espacio roto | Pasa |
| Editor de recorte | Cuadrado, arrastre, zoom y acciones visibles | Adaptación fluida por ancho | Ancho máximo controlado | Pasa |
| Navegación móvil existente | Cuatro botones inferiores intactos | Navegación superior intacta | Navegación superior intacta | Pasa |
| Persistencia | Guardado, recarga, eliminación y segunda recarga verificados | Cubierta por configuración compartida | Cubierta por configuración compartida | Pasa |
| Organización de Opciones | Navegación horizontal desplazable | Secciones adaptadas en dos columnas | Ocho accesos en una fila | Pasa |
| Separación temática | Operación, entrega y seguridad son secciones independientes | Igual | Igual | Pasa |

## Hallazgos corregidos durante la revisión

- La regla histórica ocultaba toda la marca por debajo de 768 px. Se añadió una franja de identidad superior exclusiva de teléfono, conservando la navegación inferior aprobada.
- El primer ajuste posicionaba la marca dentro del contenedor fijo inferior. Se separó semánticamente en un `header` propio para evitar que `backdrop-filter` alterara su bloque de posición.
- El contenido inicialmente quedaba debajo de la nueva franja. Se corrigió el espacio superior con un selector que corresponde al nodo raíz real.
- La navegación interna móvil heredaba un diseño fijo de cuatro iconos y se partía en varias filas al añadir secciones. Se convirtió en una sola fila horizontal desplazable con texto visible.

## Veredicto

**Aprobado para integrar en esta fase.** No quedan solapes, cortes de texto, controles inaccesibles ni pérdida de identidad en los tres anchos verificados.
