# Restaurante

Sistema de gestión para restaurantes diseñado para operar en la red local del negocio. Centraliza el salón, las órdenes, la cocina, el inventario y la configuración administrativa en una interfaz táctil y responsive.

## Arranque normal (sin contenedores)

La aplicación usa un servidor compilado en Go, una interfaz React y una base SQLite local; no necesita Docker ni otros servicios. Node.js/npm se utiliza para compilar la interfaz, no para ejecutar el backend de producción.

Desde la carpeta del proyecto:

```bash
npm start
```

En macOS también puedes abrir `Iniciar Restaurante.command` con doble clic. El iniciador funciona aunque la carpeta del proyecto cambie de ubicación y abre la interfaz en el navegador automáticamente.

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
- [Go 1.25 o superior](https://go.dev/)
- npm
- Git

### Pasos

En macOS, guarda el proyecto en una carpeta local como `~/Developer/Restaurante`, fuera de iCloud Drive, Escritorio/Documentos sincronizados y otros sincronizadores. La carpeta completa de trabajo —incluidos `.git`, `node_modules` y las compilaciones— debe permanecer local.

```bash
mkdir -p "$HOME/Developer"
cd "$HOME/Developer"
git clone https://github.com/luizgnz/restaurante.git
cd restaurante
npm ci
npm start
```

Estos pasos son para una instalación nueva. Si ya existe trabajo sin confirmar, copia y verifica el proyecto completo antes de cambiar de ubicación; clonar el remoto no recupera esos cambios. Conserva el original hasta comprobar la copia y no trabajes simultáneamente en ambas carpetas.

Al iniciar, la terminal mostrará la dirección local del sistema. Ábrela en el navegador; normalmente será `http://127.0.0.1:8080` o el puerto configurado para la instalación.

Credenciales iniciales de desarrollo:

```text
Usuario: admin
Contraseña: admin
```

> Cambia estas credenciales antes de exponer el sistema en una red compartida o utilizarlo fuera de un entorno de prueba.

### Desarrollo

`npm run dev` y `npm run dev:go` ejecutan el backend Go. Para trabajar con
recarga de la interfaz, usa dos terminales separadas:

```bash
npm run dev:go
```

El backend Node anterior se conserva temporalmente para pruebas de paridad y
puede iniciarse de forma explícita con `npm run dev:node` o
`npm run start:node`; no es el runtime predeterminado. Sus adaptadores
históricos `/api/pedidos` no forman parte del contrato de producción Go.

```bash
npm run dev:ui
```

### Verificación

```bash
npm test
npm run test:go
npm run build
npm run build:go
```

Un archivo marcado `dataless` por `ls -lO` todavía necesita recuperar su contenido; esto puede detener Git, TypeScript, Vite y las pruebas mientras esperan una lectura. **Mantener descargado** y **Descargar ahora** en Finder ayudan a recuperar archivos, pero no sustituyen trabajar fuera del directorio sincronizado. Antes de copiar un proyecto desde iCloud, comprueba que sus archivos se pueden leer y verifica el contenido de origen y destino.

Si las dependencias locales quedaron incompletas, detén los procesos de desarrollo y ejecuta `npm ci` para reconstruir `node_modules` desde el lockfile. Conserva espacio libre en disco para la instalación y las bases temporales de las pruebas. `package.json` declara los scripts de instalación aprobados por versión para los módulos nativos usados por npm 11; al actualizar esas dependencias hay que revisar también esas entradas.

El build comprueba los tipos del código y de las pruebas `.ts` y `.tsx`. Las pruebas de interacción usan `happy-dom` y conservan el aislamiento entre archivos.

### Datos y respaldos

En macOS, la base operativa está por defecto en `~/Library/Application Support/Restaurante/data/salon.sqlite`, fuera del proyecto. La variable `RESTAURANTE_DATA_DIR`, si está definida, cambia esa ubicación; tampoco debe apuntar a una carpeta sincronizada. Trasladar el código no traslada ni duplica la base. No inicies las dos copias de la aplicación para verificar una mudanza: prueba con datos temporales aislados.

Utiliza Git para el historial confirmado y un respaldo independiente, por ejemplo Time Machine, para proteger también el trabajo sin confirmar. Para SQLite, genera copias consistentes con las herramientas de respaldo de la aplicación; no sincronices la base activa ni sus archivos WAL/SHM. iCloud puede conservar documentos y copias de respaldo terminadas, pero no es la carpeta de ejecución del sistema. Estas recomendaciones no activan ni configuran respaldos automáticamente.

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
