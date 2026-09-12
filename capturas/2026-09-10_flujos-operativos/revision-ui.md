# Revisión UI — flujos operativos

Fecha: 10 de septiembre de 2026
Rama: `codex/propuesta-mesas`
Base: `9e1dd1b` con cambios locales
Entorno: build de producción servido con una base aislada y datos de prueba.

## Veredicto

**Aprobado.** La interfaz revisada mantiene la paleta crema, marfil, terracota apagado y controles casi negros; conserva la navegación inferior acordada y no presenta solapes ni desbordes horizontales en los anchos evaluados.

## Evidencia revisada

| Vista | 390 px | 768 px | 1280 px | Resultado |
| --- | :---: | :---: | :---: | --- |
| Mesas | Sí | Sí | Sí | Encabezado compacto y grilla sin espacio fantasma. |
| Órdenes | Sí | Sí | Sí | Identificadores únicos, texto legible y acceso a incidencias. |
| Cocina | Sí | Sí | Sí | Un carril apilado en teléfono y dos columnas en tablet/monitor. |
| Inventario | Sí | Sí | Sí | Tabla compacta, estados claros y sin recarga manual. |
| Pedido para llevar | Sí | Sí | Sí | Destino y nombre opcional responsivos; empaque visible en Cocina. |
| Opciones y precuenta | Sí | Sí | Sí | Configuración recomendada y modales coherentes. |

También se ejecutó la cancelación real de un producto iniciado. Se comprobó que:

- desaparece de la tarjeta activa sin crear una tarjeta de corrección vacía;
- vuelve la receta al inventario;
- aparece una actualización contextual para el mesero;
- `Entendido` retira el aviso y su contador;
- la línea cancelada no se muestra con cantidad cero.

Durante la revisión se corrigieron dos regresiones encontradas: el quiebre excesivo del identificador de orden en teléfono y la tarjeta vacía generada por una cancelación.
