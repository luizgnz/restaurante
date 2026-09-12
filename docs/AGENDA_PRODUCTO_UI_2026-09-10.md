# Agenda de producto interfaz y operación

Fecha de consolidación: 10 de septiembre de 2026

Este documento reúne las decisiones tomadas durante la revisión del sistema, separa lo implementado de lo que todavía requiere definición y evita reintroducir propuestas descartadas. El estado se actualizó después de completar código, pruebas y revisión visual responsive.

El borrador de especificación detallada de condiciones, permisos y resultados está en `docs/FLUJOS_CONDICIONALES_SISTEMA_2026-09-10.md`; debe completarse y validarse antes de presentarlo como documentación final.

## Estado general

- La dirección visual está aprobada.
- Los flujos principales de Cocina, incidencias, cancelación por etapa, corrección de precuenta y entrega están implementados.
- La corrección de cuentas pagadas queda fuera de esta fase.
- Pedido para llevar está implementado en el flujo normal, sin mesa, con número automático, nombre opcional y señal de empaque en Cocina.
- Delivery de plataformas no forma parte del alcance actual.
- La rama de trabajo contiene la entrega integrada; su cierre exige conservar las pruebas, el build y la revisión visual recientes.

## Decisiones aprobadas para aplicar ahora

### 1. Dirección visual común

- Usar como autoridad visual únicamente las imágenes de la propuesta Word guardada en `docs/propuesta/Propuesta - Sistema de Gestion de Pedidos e Invetario para restaurante.docx`.
- Paleta base: fondo crema cálido, tarjetas marfil, texto y acciones principales casi negros, acento terracota quemado y estados secundarios en verde oliva, mostaza y gris suave.
- Aplicar esa paleta a Mesas, Órdenes, Cocina, Inventario y Precuenta sin copiar funciones que aparecen en la propuesta comercial.
- Mantener la navegación inferior actual de la app: cuatro botones con iconos, sin cambiar su estructura ni agregar etiquetas nuevas.
- Los emergentes nuevos deben reutilizar el ancho, los márgenes laterales, los bordes y el radio ya establecidos por los modales actuales.
- Mantener objetivos táctiles de al menos 44 px, contraste alto y lectura rápida bajo presión.

### 2. Mesas y estructura general

- Mantener la vista de Mesas en teléfono simple y compacta, usando la propuesta Word como referencia de color y densidad.
- El encabezado del salón debe permanecer lineal, sin grandes espacios vacíos, y el botón de nueva orden debe ser compacto.
- No cambiar los botones inferiores ya aprobados.
- Conservar el modo automático del editor de mesas ya incorporado: cuando `Auto` está activado, las mesas se crean, dimensionan y ordenan automáticamente.
- Si el restaurante opera con un solo salón, no mostrar controles de áreas que no tengan una función real.

### 3. Inventario

- Mantener las filas compactas y horizontales en teléfono, cercanas a la densidad de la versión de escritorio.
- Permitir ordenamiento por columna.
- Incorporar el estado `Poco stock`.
- Al ordenar por estado o disponibilidad, mostrar primero `Sin stock`, después `Poco stock` y luego los productos disponibles.
- En encabezados estrechos usar iconos comprensibles con etiqueta accesible; no sacrificar el significado por ahorrar espacio.
- Mostrar nombres sin subrayado y añadir la unidad entre paréntesis, por ejemplo `(Grs.)`, `(kg)` y `(Uds.)`.
- El inventario debe actualizarse automáticamente mientras la pestaña esté abierta; no mostrar un botón manual de recarga.
- Mantener los estados de las filas comprensibles mediante texto breve o icono con ayuda accesible.

### 4. Toma de órdenes

- Mostrar categorías de productos en formato horizontal.
- Aprovechar el ancho con dos o tres columnas de productos cuando el dispositivo lo permita.
- En teléfono, el resumen de la orden debe ser una cinta compacta inferior. El detalle se abre como emergente al tocarla.
- Antes de enviar una orden, volver a validar inventario. Un producto sin ingredientes disponibles no puede enviarse a Cocina.
- Enviar a Cocina la orden como unidad operativa; los productos individuales se gestionan por separado solo cuando existe una incidencia o corrección.

### 5. Tablero de Cocina

- Usar un tablero compacto con dos columnas activas: `Por preparar` y `En proceso`.
- `Órdenes listas` será un acceso superior con contador, no una tercera columna permanente.
- Cuando Cocina marca una orden como lista, desaparece del tablero activo.
- La orden completa es la tarjeta principal: debe mostrar número, mesa, tiempo y productos.
- Mantener márgenes exteriores amplios y equilibrados; no dejar espacios fantasma debajo de accesos superiores.
- Acciones principales por etapa:
  - `Por preparar` → `Empezar`.
  - `En proceso` → `Marcar lista`.
- Al abrir una orden en proceso debe existir una acción visible `Reportar problema`.
- El reporte permite seleccionar producto y causa mediante opciones rápidas. El texto libre es opcional.
- Cocina puede proponer un reemplazo o cancelar el producto afectado.

### 6. Estados de platos y entrega

- Estados operativos de Cocina: `Por preparar`, `En proceso`, `Listo` y `Cancelado`.
- `Entregado` pertenece al flujo del mesero, no al tablero de Cocina.
- El mesero ve `Listo para retirar` y puede marcar `Entregado`.
- En Opciones existirá el check `Marcar automáticamente si el mesero no confirma (Recomendado)`.
- Con el check activo, un plato pasa automáticamente de `Listo` a `Entregado` después de 30 minutos.
- Si hay una incidencia pendiente, el temporizador se pausa.
- El sistema registra si la entrega fue manual o automática.
- Esta configuración no se muestra en cada orden ni durante la operación diaria.

### 7. Cancelación y devolución de stock por etapa

- Si el producto está `Por preparar` o no requiere preparación, el mesero puede cancelarlo con su PIN y un motivo predefinido.
- Si el producto está `En proceso`, `Listo` o ya fue preparado, la cancelación corresponde al rol Cocina.
- Cocina usa una sola acción: `Cancelar producto y devolver stock`.
- La acción de Cocina retira únicamente el producto afectado de la cuenta y revierte automáticamente la receta completa, aunque el plato estuviera preparado.
- Cocina no puede cancelar la cuenta completa ni productos distintos del afectado.
- La anulación completa de una orden o cuenta ya iniciada queda para Administración o un encargado de turno designado, con PIN.
- Cada cancelación registra orden, producto, usuario, hora y motivo.
- El motivo se selecciona con un toque; el campo de detalle escrito siempre es opcional.
- Eliminar el concepto `Preparado disponible`; no se reasignan platos entre órdenes dentro del sistema.
- No preguntar por merma ni reutilización en este flujo.

### 8. Incidencias entre Cocina y mesero

- La pantalla del mesero tendrá un acceso visible `Incidencias` con contador.
- Mantener también un aviso contextual dentro de la orden afectada.
- Una propuesta de reemplazo queda en `Por responder` hasta que el mesero hable con el cliente y acepte o rechace la propuesta.
- Una cancelación ejecutada por Cocina aparece en `Actualizaciones`; el mesero solo la reconoce e informa al cliente.
- El mesero no cancela desde una incidencia que ya está en preparación.
- Al resolverse, la incidencia sale de pendientes y permanece en el historial.
- No mezclar en esta bandeja estados normales como `En proceso` o `Listo`.

### 9. Precuenta y correcciones antes del pago

- La corrección se realiza en la precuenta mientras la mesa sigue abierta.
- Después de pagar, la cuenta queda cerrada e inmutable en esta fase.
- El mesero puede corregir la precuenta sin esperar a Administración.
- La corrección requiere PIN del mesero y un motivo de selección rápida; el detalle escrito es opcional.
- Texto aprobado para el caso principal: `Agregado y no entregado`, no `Cobrado y no entregado`.
- Motivos propuestos para corregir cantidad:
  - `Agregado y no entregado`.
  - `Cantidad registrada de más`.
  - `Producto duplicado`.
  - `Devuelto por el cliente`.
  - `Otro`.
- `Producto equivocado` se resuelve mediante una acción distinta: `Reemplazar producto`.
- La pantalla debe mostrar antes de guardar:
  - producto y cantidad que se corrigen;
  - nuevo total de la precuenta;
  - stock que se devuelve.
- Al confirmar, se invalida la precuenta anterior y se emite una nueva.
- Si la corrección afecta un producto ya preparado, Cocina ejecuta primero la cancelación y el mesero recibe la actualización para emitir la nueva precuenta.

### 10. Limpieza y consistencia ya solicitadas

- Eliminar la nota privada de la cuenta de mesa.
- Mantener compacto el botón `Nueva orden`.
- En la precuenta, los productos no deben aparecer todos en negrita ni mostrar el nombre del mesero.
- Mantener las acciones finales de la cuenta en una sola línea cuando el ancho lo permita.
- En Órdenes, el cambio Mesero/Cocina debe parecer un toggle compacto basado en iconos.
- El menú de usuario debe distinguir claramente la sesión actual y no repetir accesos de Mesas, Órdenes e Inventario que ya existen en la barra inferior.
- Corregir números de orden repetidos, apertura de detalle al tocar una orden y mensajes genéricos como `Failed to fetch`.

## Trabajo implementado en esta entrega

Las fases A–D se integraron en código y la fase E se ejecutó como control de cierre.

### Fase A. Especificación y pruebas de comportamiento

- Reglas de cancelación por etapa y rol cubiertas por pruebas.
- Devolución de inventario, estados de incidencias, renovación de precuenta y entrega híbrida implementados y probados.

### Fase B. Reglas de negocio y permisos

- Permisos explícitos para mesero, Cocina, Administración y encargado de turno.
- Cancelación y devolución atómica, corrección de precuenta, incidencias con historial y entrega automática con pausa.

### Fase C. Interfaz operativa

- KDS de dos columnas, acceso separado a órdenes listas y `Reportar problema`.
- Bandeja de incidencias y actualizaciones, corrección de precuenta y opción recomendada de 30 minutos.
- Navegación inferior conservada.

### Fase D. Paleta y consistencia visual

- Paleta aplicada mediante tokens compartidos a Mesas, Órdenes, Cocina, Inventario, incidencias y precuenta.
- Modales, estados y jerarquía visual unificados sin cambiar la navegación inferior.

### Fase E. Verificación

- Suite completa: 494 pruebas aprobadas.
- Build de producción y chequeo de tipos aprobados.
- Revisión responsive ejecutada a 390, 768 y 1280 px sobre Mesas, Órdenes, Cocina, Inventario, Opciones, Precuenta y Pedido para llevar.
- Flujos sensibles comprobados en backend y en la interfaz: permisos, cancelación con devolución de stock, reemplazo, actualización al mesero y retiro/entrega.
- Evidencia y veredicto de revisión registrados en `capturas/2026-09-10_flujos-operativos/`.

## Trabajo para después

- Módulo de Barra opcional para restaurantes que separan bebidas de Cocina.
- Flujo de correcciones o devoluciones posteriores al pago; queda fuera de esta fase y requiere definición contable y operativa separada.
- Delivery de plataformas externas; no forma parte del alcance actual.
- Endurecimiento de red local, límite de intentos de PIN y expiración de sesiones.
- Rutina formal de release y matriz histórica consolidada de capturas.

## Definiciones posteriores que no bloquean esta entrega

### Pedido para llevar

El alcance aprobado es una venta presencial sin mesa: la persona llega al local, pide y retira allí. No es delivery.

Decisión cerrada:

- El cliente paga al ordenar fuera del sistema, antes de que el pedido se envíe a preparación. El sistema no procesa el pago.
- El pedido recibe un número correlativo automático.
- Al crearlo, el mesero puede añadir opcionalmente el nombre del cliente.
- Se crea desde el mismo flujo de `Nueva orden`; en el selector de destino se elige `Para llevar` en lugar de asignar una mesa.
- En Cocina entra al tablero normal, pero la tarjeta muestra `Para llevar` de forma visible en lugar del número de mesa para indicar que debe empacarse.
- Por defecto tiene la misma prioridad que un pedido de mesa; Administración puede cambiar esa prioridad desde `Opciones`.
- Después de prepararse pasa a `Listo para retirar` y se cierra operativamente como `Retirado`.
- Como se paga por adelantado, su cancelación es excepcional y requiere autorización de Administración o del encargado de turno. El sistema registra la cancelación de la orden, pero no procesa ni registra la devolución del dinero.
- No tiene precuenta ni emisión de comprobante de pago dentro del sistema.

No quedan decisiones funcionales abiertas para el flujo base de `Pedido para llevar`; ya está implementado.

### Otras decisiones abiertas

- La entrega automática viene activada por defecto y recomendada, con 30 minutos.
- El inventario se actualiza cada 15 segundos mientras la pestaña está visible.
- `Poco stock` usa por ahora una regla común: 20 % o menos de la existencia física, con un mínimo de 2 unidades.
- Aprobar la lista final de motivos rápidos para mesero y Cocina.
- Definir qué ocurre si el cliente rechaza un reemplazo propuesto por Cocina.
- Definir cómo se calcula y presenta una diferencia de precio durante un reemplazo.
- Confirmar si el sistema debe soportar un solo salón por defecto y áreas adicionales como configuración opcional.
- Definir alcance, prioridad y estados del futuro módulo de Barra.

## Decisiones descartadas

- No usar tres columnas permanentes en Cocina.
- No mostrar órdenes listas en el tablero activo.
- No usar el botón ambiguo `Servir` dentro de Cocina.
- No crear el estado `Preparado disponible`.
- No rastrear entrega directa como flujo obligatorio.
- No añadir Delivery de plataforma en la fase actual.
- No editar cuentas pagadas.
- No exigir escribir un detalle para cada corrección o cancelación.
- No cambiar la navegación inferior actual.
- No mostrar controles sin una utilidad real.
- No usar un botón manual de recarga de inventario.

## Referencias visuales de esta revisión

- Autoridad de paleta y densidad: `docs/propuesta/Propuesta - Sistema de Gestion de Pedidos e Invetario para restaurante.docx`.
- KDS compacto y problemas de preparación: `capturas/2026-09-10_kds-propuesta/`.
- Corrección de precuenta: `capturas/2026-09-10_revision-producto/precuenta-corregir.png`.
- Borrador histórico de bandeja de incidencias: `capturas/2026-09-10_revision-producto/incidencias-mesero-borrador.png`; la implementación final se validó directamente en la app.

## Criterio de cierre

Una actividad solo se considera terminada cuando la regla está implementada en backend, la interfaz coincide con esta agenda, existen pruebas proporcionales al riesgo, el build termina correctamente y las capturas de teléfono, tablet y monitor no muestran regresiones.
