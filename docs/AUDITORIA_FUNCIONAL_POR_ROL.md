# Auditoría funcional por rol

Fecha de revisión: 2026-08-24  
Rama: `prototype/ui-responsive`  
Alcance: interfaz, permisos del servidor, sesiones, mesas, órdenes, cocina, inventario, administración, impresión y red local.

## 1. Resultado general

El sistema ya permite que cada persona inicie sesión con su propio usuario y contraseña. Cada cuenta tiene además un PIN para confirmar acciones operativas. El menú, las vistas y las rutas del servidor se filtran por roles; ocultar un botón no es la única protección.

Los roles disponibles son Administrador, Mesero, Cocina, Caja e Inventario. Una persona puede tener uno o varios. Esa combinación configura sus vistas:

- Mesero abre por defecto en Mesas y puede usar Mesas y Órdenes.
- Cocina abre por defecto en Cocina y no puede entrar a Mesas.
- Caja abre por defecto en Órdenes.
- Inventario abre por defecto en Inventario.
- Administrador abre en Mesas y puede acceder a todas las áreas.
- Una persona con Mesero + Cocina puede cambiar entre ambas vistas.

El inventario es visible para todos, pero solo Administrador puede registrar cantidades, tanto en la interfaz como en el servidor.

No se registra qué cocinero comenzó o terminó un producto, de acuerdo con la decisión funcional. El PIN sigue siendo importante para enviar, corregir o anular órdenes, emitir precuenta y otras acciones protegidas.

## 2. Matriz de permisos aplicada

| Área o acción | Administrador | Mesero | Cocina | Caja | Inventario |
| --- | --- | --- | --- | --- | --- |
| Iniciar sesión con usuario/contraseña | Sí | Sí | Sí | Sí | Sí |
| Usar PIN propio | Sí | Sí | Sí | Sí | Sí |
| Ver Mesas | Sí | Sí | No | No | No |
| Crear/enviar/corregir órdenes | Sí | Sí | No | No | No |
| Ver Órdenes/cuentas | Sí | Sí | No | Sí | No |
| Ver y operar Cocina | Sí | No | Sí | No | No |
| Ver Inventario | Sí | Sí | Sí | Sí | Sí |
| Registrar entradas de Inventario | Sí | No | No | No | No |
| Crear productos, categorías, contornos y recetas | Sí | No | No | No | No |
| Editar mapa del salón | Sí | No | No | No | No |
| Gestionar usuarios, impresoras, red y seguridad | Sí | No | No | No | No |

## 3. Inventario de pantallas, controles y evaluación

### Navegación común

| Control | Función | A quién corresponde | Estado |
| --- | --- | --- | --- |
| Mesas | Abre el plano | Administrador/Mesero | Correcto y filtrado |
| Órdenes | Abre cuentas y avisos de cocina | Administrador/Mesero/Caja | Correcto y filtrado |
| Cocina | Abre el KDS | Administrador/Cocina | Correcto y filtrado |
| Inventario | Consulta materiales | Todos | Correcto |
| Selector Mesero/Cocina | Cambia área de trabajo | Solo cuentas con ambos permisos | Correcto |
| Cuenta | Muestra usuario actual y cierra solo su sesión | Todos | Correcto |
| Administración | Carta y salón | Administrador | Correcto |
| Opciones | Usuarios, impresión, red y configuración | Administrador | Correcto |

Se eliminaron los accesos duplicados **Crear producto** y **Editar mapa** del menú desplegable. Antes aparecían allí y también como tarjetas dentro de Backend. Ahora existe una sola ruta lógica: **Administración**, y Backend fue renombrado en la interfaz.

### Mesas

| Control | Función | Evaluación |
| --- | --- | --- |
| Nueva orden (icono) | Inicia una orden y luego permite asignar mesa | Útil; conservar |
| Selector/buscador de piso o mesa | Localiza mesas | Útil |
| Mesa libre | Abre nueva orden para la mesa | Esencial |
| Mesa ocupada | Abre su cuenta | Esencial |
| Últimos/Atrasados | Filtra barras operativas en el dispositivo | Útil; ya no cambia una preferencia global |

Recomendado después: transferencia/unión/división de mesas, número de comensales, responsable de mesa y acceso directo desde los avisos a la cuenta exacta.

### Constructor de orden

| Control | Función | Evaluación |
| --- | --- | --- |
| Categorías | Filtra la carta por categoría | Agregado y útil |
| Buscar | Filtra por nombre | Agregado y útil |
| Tarjeta de producto | Agrega/abre personalización | Esencial |
| Iconos − y + | Ajustan cantidad | Correctos para móvil/tablet |
| Papelera | Elimina una línea | Útil |
| Contornos/extras | Personaliza un plato | Útil |
| Indicaciones | Envía nota general a cocina | Útil |
| Cancelar/Enviar | Descarta o envía el borrador | Esencial |

Recomendado después: mostrar subtotal, avisar stock insuficiente antes de enviar, nota por producto visible en el constructor, favoritos y un flujo explícito “Para llevar”.

### Órdenes y cuenta

| Acción | Rol | Evaluación |
| --- | --- | --- |
| Abrir cuenta | Mesero/Caja/Admin | Útil |
| Nueva orden para la cuenta | Mesero/Admin | Esencial |
| Corregir/anular | Mesero/Admin + PIN | Correcto |
| Nota privada | Mesero/Admin | Útil |
| Emitir precuenta | Mesero/Caja/Admin + PIN | Esencial |
| Enviar/cerrar cuenta | Según política de caja | Funcional, pero no registra pago |
| Aceptar sugerencia | Mesero/Admin + PIN | Ahora reemplaza solo el producto solicitado |
| Rechazar sugerencia | Mesero/Admin + PIN | Elimina el producto o la orden afectada |

Recomendado después: historial de cuentas cerradas, reimpresión de precuentas, división de cuenta, descuentos autorizados y una decisión formal sobre si el sistema registrará pagos.

### Cocina / KDS

KDS significa **Kitchen Display System**, es decir, pantalla digital de cocina. En la interfaz se mantiene el nombre sencillo **Cocina**.

| Icono/acción | Función | Evaluación |
| --- | --- | --- |
| Comenzar preparación | Enviado a cocina → En preparación | Correcto |
| Marcar listo | En preparación → Listo para entregar | Correcto |
| Sugerir cambio | Selecciona un producto sustituto para una línea | Corregido |
| No disponible | Solicita eliminar producto u orden | Correcto |
| Problema con toda la orden | Reporta rechazo/sugerencia global | Útil |
| Actualizar | Recarga manualmente | Respaldo; existe actualización automática |

La sustitución aceptada crea una corrección: pone en cero la línea original y agrega el producto sustituto con la misma cantidad. No cambia otros productos. No se guarda qué cocinero inició o terminó la preparación.

Recomendación KDS prioritaria:

1. ocultar o archivar comandas terminadas;
2. agregar estado Entregado/Retirado por el mesero;
3. resaltar tiempo transcurrido y prioridad;
4. aviso sonoro discreto para comandas nuevas;
5. filtros por estación (caliente, fría, bar, postres);
6. confirmación de lectura para correcciones y anulaciones.

### Inventario

Actualmente Inventario contiene:

- materiales y productos almacenables;
- existencia física (en mano);
- cantidad reservada por órdenes;
- cantidad realmente disponible;
- búsqueda, filtros y fecha de última entrada;
- registro positivo de entrada, solo para Administrador.

No contiene todavía compras, proveedores, mermas, conteos físicos, ajustes negativos, unidades formales ni stock mínimo.

Recomendado después: unidad de medida, stock mínimo, historial visible de movimientos, merma/ajuste con motivo, recepción de compras y alerta de disponibilidad en la carta.

### Administración de carta y salón

| Opción | Estado |
| --- | --- |
| Nuevo producto | Crea nombre, código, precio, color, foto, categoría, tipo y visibilidad |
| Categorías | Crea y usa categorías como filtros de la carta |
| Contornos | Configura grupos, variantes, suplementos y slots |
| Recetas | Crea ingredientes al dar de alta y permite volver a editarlos |
| Mapa del salón | Edita pisos, mesas, forma, tamaño, color y fondo |

El tipo **Receta** ya no queda incompleto: exige al menos un material con inventario y una cantidad positiva. Su editor permite agregar, quitar y cambiar ingredientes y cantidades. No admite usar otra receta como ingrediente, evitando descuentos de stock ambiguos.

Recomendado después: listado general para editar/desactivar productos, ordenar categorías y productos, unidades por ingrediente, duplicar receta y costo teórico.

### Usuarios

La creación y edición admite nombre, usuario, contraseña, PIN, uno o varios roles y estado activo. Todos los roles pueden iniciar sesión si tienen credenciales válidas. El sistema impide desactivar o quitar el rol al último Administrador activo.

Recomendado: obligar cambio de contraseña inicial, política mínima de contraseña, regeneración de PIN y cierre remoto de sesiones por dispositivo.

### Impresión

Actualmente incluye:

- impresora de comandas e impresora de comprobantes por red;
- IP/host, puerto, ancho y nombre;
- diagnóstico de conexión y página de prueba;
- título, encabezado y pie de plantilla;
- cola de trabajos con estado, intentos y último error;
- recarga y reintento manual de trabajos fallidos o pendientes.

La “boleta” actual es un comprobante/precuenta ESC/POS; no es integración tributaria o fiscal.

Recomendado después: reintentos automáticos con espera creciente, vista previa exacta, logo, enrutamiento por estación e integración fiscal si el país/negocio la requiere.

### Red local y nombre del servidor

La web escucha en la red local y muestra direcciones IP para conectar tablets y teléfonos. El campo **Nombre del servidor** es actualmente una etiqueta descriptiva; no implementa descubrimiento real.

Con descubrimiento real (por ejemplo mDNS), el beneficio sería acceder con un nombre estable como `restaurante.local`, mostrarlo en un QR y no depender de recordar una IP que el router puede cambiar. También ayuda a identificar el servidor correcto cuando hay varios equipos. Para que sea confiable necesita publicar el servicio en la red, resolver conflictos de nombre y comprobarlo desde otro dispositivo. Hasta implementarlo, las IP siguen siendo el acceso real.

## 4. Caja versus Inventario

### Qué hay actualmente en Caja

No existe aún un módulo de cobro completo. Caja puede ver cuentas/órdenes, emitir precuenta y completar el cierre según la configuración. El cierre valida la precuenta cuando corresponde, firma o descuenta reservas, crea el registro de entrega a caja y libera la mesa.

No registra efectivo, tarjeta, propina, vuelto, apertura/cierre de cajón, conciliación, turno de caja ni documento fiscal.

### Qué hay actualmente en Inventario

Inventario controla cantidades de materiales, reservas y disponibilidad. No gestiona dinero ni pagos. Las recetas conectan platos con los materiales que consumen.

### Recomendación

Mantener ambos conceptos separados. Si se cobrará dentro de la aplicación, Caja debe incluir medios de pago, pagos divididos, propina, vuelto, movimientos y cierre de turno. Si el cobro ocurre fuera, conviene llamar a la acción actual **Finalizar servicio** o **Enviar a caja** para no prometer un cobro inexistente.

## 5. Prioridades funcionales recomendadas

1. Completar `Listo → Entregado` y archivar comandas terminadas.
2. Añadir historial de cuentas cerradas y reimpresión.
3. Decidir y diseñar el alcance real de Caja.
4. Mostrar stock/armabilidad y alertas en la toma de pedido.
5. Agregar unidades, mínimos, mermas e historial visible de inventario.
6. Incorporar edición/desactivación de productos y categorías.
7. Implementar descubrimiento local real y QR de conexión.
8. Añadir estaciones y alertas al KDS.
