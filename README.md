# Restaurante

Sistema de gestión para restaurantes diseñado para operar en la red local del negocio. Centraliza el salón, las órdenes, la cocina, el inventario y la configuración administrativa en una interfaz táctil y responsive.

## Qué permite hacer

- Visualizar las mesas y su estado en tiempo real.
- Crear órdenes, agregar o quitar productos y enviar indicaciones a cocina.
- Consultar las órdenes activas y editar o eliminar un pedido desde su detalle.
- Recibir y actualizar comandas desde la vista de cocina.
- Controlar existencias, entradas, pérdidas y consumo interno.
- Administrar productos, categorías, recetas y contornos.
- Configurar usuarios, permisos, impresoras y el mapa del salón.
- Trabajar localmente sin depender de una conexión permanente a Internet.

## Instalación para desarrollo

### Requisitos

- [Node.js 22 o superior](https://nodejs.org/)
- npm
- Git

### Pasos

```bash
git clone https://github.com/luizgnz/restaurante.git
cd restaurante
git switch prototype/ui-responsive
npm install
npm run build
npm start
```

Al iniciar, la terminal mostrará la dirección local del sistema. Ábrela en el navegador; normalmente será `http://127.0.0.1:8080` o el puerto configurado para la instalación.

Credenciales iniciales de desarrollo:

```text
Usuario: admin
Contraseña: admin
```

> Cambia estas credenciales antes de exponer el sistema en una red compartida o utilizarlo fuera de un entorno de prueba.

### Desarrollo con recarga automática

En dos terminales separadas:

```bash
npm run dev
```

```bash
npm run dev:ui
```

### Verificación

```bash
npm test
npm run build
```

## Capturas de la interfaz

Capturas realizadas el **29 de agosto de 2026**, correspondientes al trabajo iniciado en el commit **`feeb899`**.

### Mesas y cuenta

![Vista general del salón](screenshots/2026-08-29_feeb899/01-mesas-salon.png)

![Detalle de la cuenta de una mesa](screenshots/2026-08-29_feeb899/02-mesa-cuenta.png)

### Creación de órdenes

![Nueva orden](screenshots/2026-08-29_feeb899/03-nueva-orden.png)

![Orden con un producto agregado](screenshots/2026-08-29_feeb899/04-orden-con-producto.png)

![Indicaciones para cocina](screenshots/2026-08-29_feeb899/05-orden-indicaciones.png)

### Seguimiento de órdenes

![Listado general de órdenes](screenshots/2026-08-29_feeb899/06-ordenes-listado.png)

![Acciones para editar o eliminar una orden](screenshots/2026-08-29_feeb899/07-orden-detalle-modal.png)

### Inventario

![Vista general del inventario](screenshots/2026-08-29_feeb899/08-inventario.png)

![Ajuste de existencias](screenshots/2026-08-29_feeb899/09-inventario-ajuste.png)

![Registro de pérdida o consumo interno](screenshots/2026-08-29_feeb899/10-inventario-perdida.png)

### Cocina

![Vista operativa de cocina](screenshots/2026-08-29_feeb899/11-cocina.png)

### Administración

![Panel principal de administración](screenshots/2026-08-29_feeb899/12-administracion.png)

![Formulario para crear un producto](screenshots/2026-08-29_feeb899/13-producto-nuevo.png)

![Administración de categorías](screenshots/2026-08-29_feeb899/14-categorias.png)

![Configuración de contornos](screenshots/2026-08-29_feeb899/15-contornos.png)

![Administración de recetas](screenshots/2026-08-29_feeb899/16-recetas.png)

![Editor del mapa del salón](screenshots/2026-08-29_feeb899/17-mapa-salon.png)

![Opciones generales del sistema](screenshots/2026-08-29_feeb899/18-opciones.png)

### Navegación y sesión

![Panel de cuenta del usuario](screenshots/2026-08-29_feeb899/19-panel-cuenta.png)

![Menú principal de navegación](screenshots/2026-08-29_feeb899/20-menu-navegacion.png)

