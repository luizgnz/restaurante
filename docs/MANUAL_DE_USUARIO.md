# Manual de usuario — Sistema Restaurante

Fecha: 2026-08-24  
Este manual describe las funciones disponibles en la versión actual.

## 1. Acceso al sistema

Cada persona debe tener un nombre de usuario, una contraseña para iniciar sesión, un PIN personal para confirmar acciones operativas y uno o varios roles.

Para entrar, abra la dirección del restaurante, escriba usuario y contraseña y pulse **Iniciar sesión**. Al salir desde el icono de persona se cierra solamente la sesión de ese dispositivo.

Las pantallas disponibles dependen de los roles. Si una persona tiene Mesero y Cocina, puede alternar entre ambas. Por defecto, Mesero entra a Mesas, Cocina entra a Cocina, Caja entra a Órdenes e Inventario entra a Inventario.

## 2. Controles comunes

| Control | Acción |
| --- | --- |
| Mesas | Abre el plano del salón |
| Órdenes | Abre cuentas activas y solicitudes de cocina |
| Cocina | Abre la pantalla de preparación |
| Inventario | Consulta materiales disponibles |
| Persona | Muestra la cuenta actual y permite salir |
| Menú | Abre accesos permitidos para el rol |

En teléfonos se priorizan iconos y el nombre de la sección aparece en la cabecera.

## 3. Administrador

El Administrador puede usar todas las áreas y es el único que configura el restaurante o ingresa inventario.

### Usuarios y roles

Ruta: **Menú → Opciones → Usuarios**.

Para crear una cuenta:

1. Pulse **Nuevo usuario**.
2. Escriba nombre, usuario, contraseña y PIN.
3. Marque uno o varios roles.
4. Pulse **Guardar usuario**.

Para editar, abra la cuenta, modifique datos, roles o estado y guarde. PIN y contraseña vacíos conservan los actuales. Debe quedar al menos un Administrador activo.

### Productos y categorías

Ruta: **Menú → Administración**.

En **Nuevo producto** se define foto, nombre, código, precio, color, categoría, tipo, control de inventario y si aparece en la carta.

Tipos:

- **Consumible:** no descuenta inventario.
- **Almacenable:** tiene existencia propia.
- **Receta:** descuenta varios materiales.

En **Categorías** se crean los grupos que el mesero usa para filtrar la carta.

### Recetas

Al crear un producto de tipo Receta:

1. agregue al menos un ingrediente;
2. seleccione un material con inventario;
3. indique la cantidad consumida por una unidad del plato;
4. agregue o quite líneas según sea necesario;
5. guarde el producto.

Para editar una receta existente, vaya a **Administración → Recetas**, seleccione el plato, cambie ingredientes o cantidades y pulse **Guardar receta**.

### Contornos y extras

Ruta: **Administración → Contornos**.

1. Cree un grupo, por ejemplo “Acompañamiento”.
2. Cree sus variantes, por ejemplo “Papas” y “Ensalada”.
3. Configure suplementos o extras.
4. Seleccione un plato y asigne sus grupos a uno o varios espacios de personalización.
5. Guarde.

### Mapa del salón

Ruta: **Administración → Mapa del salón**.

Puede crear, duplicar, ordenar o eliminar pisos y mesas; cambiar número, asientos, forma, tamaño, posición, color e imagen. Pulse **Guardar** para aplicar o **Descartar** para salir.

### Inventario

Ruta: **Inventario**.

Todos pueden consultar. Solo Administrador puede modificar existencias. En la interfaz nueva:

1. pulse el nombre del material;
2. elija **Agregar** o **Registrar pérdida**;
3. escriba una cantidad positiva;
4. ingrese su PIN;
5. confirme el movimiento.

La pantalla muestra en mano, reservado y disponible. En la interfaz nueva, pulse directamente el nombre del material para abrir **Ajustar inventario**. Desde allí puede:

- **Agregar** una cantidad recibida.
- **Registrar pérdida** y clasificarla como **Producto dañado** o **Consumo interno**.

Una pérdida descuenta la existencia física, exige autorización y queda registrada como un movimiento separado. La cantidad debe ser positiva y no puede superar la existencia en mano; nunca se escribe como una entrada negativa.

### Impresoras y cola

Ruta: **Opciones → Impresión**.

Configure por separado cocina y comprobantes: nombre, dirección de red, puerto, ancho y estado. Use **Confirmar conexión** y **Imprimir prueba**. La plantilla permite cambiar título, encabezado y pie.

La cola muestra hasta 50 trabajos recientes, su estado, intentos y error. Pulse **Actualizar** para recargar o **Reintentar** para volver a procesar un trabajo pendiente o fallido.

### Red local

Ruta: **Opciones → Red local**.

Active el servidor de red y comparta una de las direcciones mostradas con tablets o teléfonos conectados al mismo Wi-Fi. **Nombre del servidor** es por ahora una descripción; no reemplaza la dirección IP.

## 4. Mesero

El Mesero atiende mesas, crea órdenes y coordina respuestas con cocina. No puede administrar usuarios, carta, mapa, impresoras ni cantidades de inventario.

### Crear y enviar una orden

1. Abra **Mesas**.
2. Toque una mesa Libre o use el icono de nueva orden.
3. Use las categorías o la búsqueda para localizar productos.
4. Toque productos y ajuste cantidades con − y +.
5. Seleccione contornos o extras cuando aparezcan.
6. Escriba indicaciones generales si corresponde.
7. Pulse **Enviar**, revise la comanda e ingrese PIN si se solicita.

La orden queda como **Enviada a cocina** hasta que cocina la tome.

### Trabajar con una cuenta

Al tocar una mesa ocupada puede:

- agregar una nueva orden;
- corregir o anular una orden antes de que la preparación lo impida;
- escribir una nota privada;
- emitir precuenta;
- finalizar o enviar a caja si la política lo permite.

Las correcciones y anulaciones requieren PIN. El cierre actual libera la mesa, pero no registra un pago.

### Solicitudes de cocina

En **Órdenes** aparece una notificación cuando cocina reporta un problema.

Si cocina sugiere un cambio de producto:

1. consulte al cliente;
2. pulse **Aceptar sugerencia**;
3. ingrese su PIN;
4. el sistema pone en cero el producto original y agrega el sustituto solo en la cantidad afectada.

Si el cliente no acepta, pulse rechazar. El sistema pregunta si desea eliminar el producto solicitado o, cuando el problema abarca todo, la orden. La respuesta vuelve a cocina.

## 5. Cocina

Cocina ve únicamente las comandas y el inventario, salvo que su cuenta tenga roles adicionales. No registra su identidad al comenzar o terminar productos.

Estados:

1. **Enviado a cocina:** aún no confirmado.
2. **En preparación:** cocina comenzó.
3. **Listo para entregar:** espera retiro del mesero.

Acciones por icono:

- **Comenzar preparación:** cambia a En preparación.
- **Marcar listo:** cambia a Listo para entregar.
- **Sugerir cambio:** informa el motivo y selecciona un producto sustituto.
- **No disponible:** solicita eliminar el producto.
- **Problema con toda la orden:** informa un rechazo o sugerencia global.

Una línea con sugerencia pendiente no puede comenzar hasta que el mesero responda. Al ser aceptada, cocina ve la respuesta y puede iniciar la preparación del producto sustituto mediante la corrección generada.

KDS es la sigla técnica de *Kitchen Display System*: la pantalla digital de cocina. En el sistema se llama simplemente **Cocina**.

## 6. Caja

Caja puede iniciar sesión, ver Órdenes/cuentas, consultar Inventario y realizar acciones de precuenta o cierre autorizadas por su PIN y por la configuración.

Actualmente Caja no registra medios de pago, efectivo, tarjeta, propina, vuelto ni cierre de cajón. La función existente finaliza el servicio, entrega el registro a caja y libera la mesa. No debe interpretarse como una boleta fiscal.

## 7. Inventario

El rol Inventario puede iniciar sesión y consultar materiales, existencias en mano, reservas y disponibilidad. También puede buscar y filtrar materiales.

No puede modificar cantidades. Agregar existencias o registrar pérdidas pertenece exclusivamente al Administrador. Si una persona necesita ambas funciones, debe recibir también el rol Administrador; no se recomienda hacerlo solo para permitir ajustes.

## 8. Personas con varios roles

Los permisos se suman. Por ejemplo:

- Mesero + Cocina puede alternar entre las dos vistas.
- Mesero + Caja puede atender y finalizar cuentas.
- Administrador tiene acceso completo sin agregar los demás roles.

Asigne únicamente los roles necesarios. Los botones no autorizados se ocultan y el servidor también rechaza el acceso directo.

## 9. Alcances que aún no incluye el sistema

- cobro completo y conciliación de caja;
- estado Entregado o Retirado;
- historial navegable de cuentas cerradas;
- edición o desactivación general de productos;
- proveedores, compras y reportes consolidados de pérdidas;
- unidades de medida y mínimos de inventario;
- descubrimiento del servidor por nombre en la red;
- documento tributario o fiscal;
- archivo y filtros por estación completos en Cocina.
