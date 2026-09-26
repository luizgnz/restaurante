# Revisión del stack e instalación — 25 de septiembre de 2026

## Resultado

La revisión se ejecutó en Windows 11 sobre la rama de la PR #18 (`codex/seguridad-local`). Pasaron la instalación de dependencias, las suites de frontend y Go, los builds de UI y servidor, el arranque desde el código y la segunda revalidación del instalador Windows después del fallo inicial. Después del merge a `main`, se borraron por completo la instalación y la base de prueba, y una tercera instalación desde cero pasó las comprobaciones previas al reinicio.

La documentación de desarrollo cubre Windows y macOS. macOS no se probó en esta máquina; tampoco se publica aquí un instalador nativo de macOS. El arranque tras reiniciar y la actualización con datos pasaron en Windows. La recuperación real después de una actualización fallida y el acceso desde otro dispositivo siguen pendientes en `TAREAS_V2.md`.

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

El paquete es multifichero: para ejecutarlo hay que conservar junto al `.exe` los archivos `Restaurante-Setup-0.1.0-windows-pass2-x64-0.bin` y `Restaurante-Setup-0.1.0-windows-pass2-x64-1.bin` generados en la misma carpeta.

SHA-256: `2D84267BBB3A29BB4270E1B1A0B186B9CC4B6AF6821A6799D7DD28AD01AF1B0B`.

La validación se realizó después del intento inicial fallido. Antes de instalar, el ejecutable no estaba en `Program Files` y el puerto 8080 estaba libre; se usó la base de prueba que ya existía, por lo que esta revalidación no representa una base de datos vacía. El registro de Inno Setup confirmó:

- `Installation process succeeded.`
- `resultado de validación = 0`
- `tarea y servidor disponibles = 1`

Con el servicio instalado se comprobaron salud (`runtime=go`), HTML y bundle, logo, fuente, favicon, login `admin/admin` por API, lectura de configuración y cierre de sesión. El desinstalador retiró `restaurante.exe` y detuvo el listener del puerto 8080; conservó `C:\ProgramData\Restaurante\data\salon.sqlite`.

Esta segunda comprobación no incluye reinicio de Windows, actualización sobre datos existentes, rollback por actualización fallida ni acceso desde otro equipo de la red. El reinicio es el pendiente registrado en `TAREAS_V2.md`.

## Tercera comprobación: instalación desde cero en Windows

El 25 de septiembre, después de integrar la PR #18 en `main`, se retiraron los residuos de la prueba anterior de `C:\Program Files\Restaurante`, `C:\ProgramData\Restaurante` y `%LOCALAPPDATA%\Restaurante`. La limpieza fue ejecutada por Luis con el desinstalador de prueba generado en `installer/windows/output/Desinstalar-Restaurante.cmd`; su registro quedó en `%TEMP%\Restaurante-limpieza.log`. Antes de instalar se comprobó que las tres rutas, la tarea y el listener de 8080 no existían. Se conservó `RestauranteDev`, que contiene Node y Go para compilar.

El paquete `Restaurante-Setup-0.1.0-clean-pass3-x64.exe`, acompañado por sus archivos `-0.bin` y `-1.bin`, se construyó desde el código integrado con `npm run build:windows`, Go 1.26.8 e Inno Setup 6.7.3. SHA-256 del `.exe`: `E5E552920668A229BE7C7C3E9D90D68ED73B7BA58C062033A492A1E599887640`.

La instalación elevada terminó con código 0. Su registro (`%TEMP%\restaurante-clean-pass3-install.log`) dice `Detected previous ... install? No`, `Installation process succeeded.`, `resultado de validación = 0` y `tarea y servidor disponibles = 1`. Se creó una base nueva en `C:\ProgramData\Restaurante\data\salon.sqlite`; el servidor instalado escucha en 8080. Respondieron HTTP 200 `/api/salud`, `/`, JavaScript, CSS, fuente y favicon. La sesión pasó de cerrada a abierta con las credenciales iniciales, permitió consultar `/api/config` y cerró correctamente.

La tarea `Restaurante POS` no se puede consultar directamente desde la consola sin elevación (`schtasks /Query` devuelve `Access is denied`); el instalador sí informó que la registró y arrancó. El equipo está en una red Windows clasificada como pública; su política activa es `BlockInbound,AllowOutbound` y las reglas de firewall encontradas apuntan al antiguo ejecutable de desarrollo, no al binario instalado. El proceso escucha en `0.0.0.0:8080` y la cuenta inicial `admin/admin` funciona: **no usar esta instalación para operación ni habilitar acceso desde otros equipos hasta cambiar las credenciales y verificar el firewall**.

## Reinicio, actualización y cancelación observada

Windows reinició a las 21:30:43 y el servidor instalado arrancó automáticamente a las 21:30:58. Salud e interfaz respondieron y la base siguió disponible. Se creó por API la categoría `VALIDACION-WINDOWS-LIMPIA-20260925` (ID 9) como marcador persistente. El instalador `0.1.0-update-pass4` terminó con código 0, creó un punto de respaldo en `backups\updates`, reinició el servidor y conservó el marcador con el mismo ID. Un segundo reinicio, a las 22:11:02, confirmó de nuevo el arranque automático y la conservación del dato.

En el intento `0.1.0-update-pass5`, Inno Setup detectó `McAfee Framework Host` usando uno de los archivos. Como esa aplicación no pudo cerrarse, la instalación silenciosa se canceló con código 5 antes de copiar archivos. El binario y la base quedaron intactos, pero la tarea ya había sido detenida por `PrepareToInstall` y el puerto 8080 quedó sin servidor. La revisión automática bloqueó el comando elevado para iniciar la tarea (`blocked by policy`); el segundo reinicio la restableció. Se añadió `DeinitializeSetup` para reanudar la tarea cuando se cancela una actualización después de detenerla. Esta ruta específica de cancelación **aún no se ha repetido** con la corrección, porque `0.1.0-update-pass6` sí se instaló correctamente; su log informó validación 0 y servidor disponible 1. Los hashes de los scripts instalados coinciden con el código corregido.

El paquete `0.1.0-update-pass6` es multifichero (`.exe`, `-0.bin`, `-1.bin`). SHA-256 del ejecutable del Setup: `BCAD77E069CA73BFAD7DB0974B20E5A3588F22C2B0638D6D6BF76AAE689C130A`. Los tres archivos están en `installer/windows/output/`; son artefactos locales de prueba, no un lanzamiento operativo.

Una prueba aislada del antiguo `rollback-update.ps1` mostró que copiaba el ejecutable y SQLite, pero dejaba archivos exclusivos de la actualización fallida y archivos WAL/SHM antiguos. Se corrigió para reflejar exactamente el respaldo del programa, limpiar WAL/SHM obsoletos y rechazar rutas de respaldo fuera del directorio previsto. Se agregó una prueba automatizada Windows que comprueba esos casos; pasaron 519/519 pruebas Vitest en 86 archivos, todos los paquetes Go y el build TypeScript/Vite. La revisión automática bloqueó crear un instalador deliberadamente inválido para forzar el rollback real (`blocked by policy`), por lo que **la recuperación completa dentro de Inno Setup no está validada en este equipo**. El instalador no queda aprobado para operación hasta comprobar ese caso y el acceso LAN controlado.

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
- El instalador se validó después de reiniciar Windows y al actualizar con un dato persistente. Falta probar el rollback completo en una actualización deliberadamente fallida, la reanudación automática después de una cancelación y el acceso LAN desde otro equipo. La tarea asociada continúa abierta.
- npm reportó tres vulnerabilidades moderadas en el árbol instalado. No se actualizaron dependencias en esta revisión.
- La base de la segunda prueba se conservó al desinstalar y luego Luis la borró expresamente para la tercera instalación; la base actual es nueva y contiene solo datos de demostración.
