# Revisión del stack e instalación — 25 de septiembre de 2026

## Resultado

La revisión se ejecutó en Windows 11 sobre la rama de la PR #18 (`codex/seguridad-local`). Pasaron la instalación de dependencias, las suites de frontend y Go, los builds de UI y servidor, el arranque desde el código y la segunda revalidación del instalador Windows después del fallo inicial. El instalador abrió el servidor, sus recursos estáticos y las operaciones de sesión respondieron; luego se desinstaló preservando la base de prueba.

La documentación de desarrollo cubre Windows y macOS. macOS no se probó en esta máquina; tampoco se publica aquí un instalador nativo de macOS. La comprobación de reinicio de Windows sigue pendiente y permanece anotada en `TAREAS_V2.md`.

## Equipo y stack observados

| Componente | Versión o valor | Comprobación |
| --- | --- | --- |
| Sistema anfitrión | Windows 11 Home Single Language, compilación 26100, x64 | Compilación, tests e instalador local |
| Node.js | v24.21.0 | Builds y scripts npm |
| npm | 11.19.0 | Instalación, tests, licencias y scripts |
| Go | 1.26.8 windows/amd64 | Tests y binario Windows |
| Git | 2.53.0.windows.3 | Rama y código fuente |
| Inno Setup | 6.7.3 | Compilación del instalador |
| Rama revisada | `codex/seguridad-local`, PR #18 | Actualización de la rama existente |

La instalación de desarrollo local se separó con `RESTAURANTE_DATA_DIR`; los arranques de prueba usaron una base temporal y configuración `servidor_red_habilitado=false`. La instalación del Setup usa los datos de prueba en `C:\ProgramData\Restaurante\data`.

## Validación desde el código

En la rama de la PR se completó el arranque portable en Windows: los scripts npm compilan y lanzan el ejecutable Go correcto (`.exe`), la prueba de licencias invoca Node directamente y Vitest usa dos workers en Windows.

| Validación | Resultado |
| --- | --- |
| `npm ci --ignore-scripts` | 171 paquetes agregados; npm reportó 3 vulnerabilidades moderadas |
| `npm test` | 518/518 pruebas en 86 archivos |
| `npm run test:go` | Todos los paquetes Go pasaron |
| `npm run build` | TypeScript y Vite pasaron |
| `npm run build:go` | Binario Go Windows generado |
| `npm run licenses` | 24 dependencias directas aprobadas |
| `npm start` | UI y servidor Go iniciaron en `127.0.0.1:18083` con datos temporales |
| Smoke HTTP de código | Salud Go correcta, HTML con bundle y logo respondieron HTTP 200 |

El servidor de producción de Go publica los recursos requeridos por la interfaz (`/marcas/`, `/fonts/`, `/productos/` y `/favicon.svg`) y conserva el 404 para archivos fuera de esas rutas. Las pruebas Go y el servidor instalado comprobaron esos recursos.

## Segunda revalidación del instalador Windows

El paquete se recompiló desde la rama de la PR con `npm run build:windows`, usando Go e Inno Setup 6.7.3:

`installer/windows/output/Restaurante-Setup-0.1.0-windows-pass2-x64.exe`

SHA-256: `2D84267BBB3A29BB4270E1B1A0B186B9CC4B6AF6821A6799D7DD28AD01AF1B0B`.

La validación se realizó después del intento inicial fallido. Antes de instalar, el ejecutable no estaba en `Program Files` y el puerto 8080 estaba libre; se usó la base de prueba que ya existía, por lo que esta revalidación no representa una base de datos vacía. El registro de Inno Setup confirmó:

- `Installation process succeeded.`
- `resultado de validación = 0`
- `tarea y servidor disponibles = 1`

Con el servicio instalado se comprobaron salud (`runtime=go`), HTML y bundle, logo, fuente, favicon, login `admin/admin` por API, lectura de configuración y cierre de sesión. El desinstalador retiró `restaurante.exe` y detuvo el listener del puerto 8080; conservó `C:\ProgramData\Restaurante\data\salon.sqlite`.

Esta segunda comprobación no incluye reinicio de Windows, actualización sobre datos existentes, rollback por actualización fallida ni acceso desde otro equipo de la red. El reinicio es el pendiente registrado en `TAREAS_V2.md`.

## Instalación y diferencias por sistema

El cliente es una aplicación web responsive y funciona en navegadores de ambos sistemas. El stack completo también depende del sistema operativo para el ejecutable Go, las rutas de datos, permisos, inicio del proceso, firewall y acceso a impresoras. El README ahora describe requisitos e instalación de desarrollo en Windows y macOS, compilación, arranque local, pruebas y ubicación de datos.

Rutas operativas predeterminadas:

- Windows: `%ProgramData%\Restaurante\data\salon.sqlite`.
- macOS: `~/Library/Application Support/Restaurante/data/salon.sqlite`.
- En ambos: `RESTAURANTE_DATA_DIR` reemplaza el directorio base.

La configuración de red puede permitir escucha en otras interfaces. Para desarrollo local, el README fija `servidor_red_habilitado=false`; para dar acceso a tablets se debe habilitar deliberadamente y revisar el firewall. No guardar la base activa en iCloud, OneDrive u otra carpeta sincronizada.

## Límites de esta revisión

- macOS, Safari, Apple Silicon e Intel, Gatekeeper, el iniciador `.command` y las impresoras de macOS no se probaron aquí.
- No se hizo una revisión manual completa de todas las funciones ni pruebas de resolución responsive en varios tamaños. El login se comprobó por API y tests, además de revisar las rutas web.
- El instalador no se validó después de reiniciar Windows, ni con actualización/rollback. La tarea asociada continúa abierta.
- npm reportó tres vulnerabilidades moderadas en el árbol instalado. No se actualizaron dependencias en esta revisión.
- La base de prueba quedó preservada en `C:\ProgramData\Restaurante\data\salon.sqlite` al desinstalar.
