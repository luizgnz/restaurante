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

## Seguimiento: botones del salón por IP y soporte Windows

La captura de Luis mostraba el salón en `192.168.1.91:8080`. En esta sesión la IP del equipo de prueba era `192.168.1.85`; no se atribuye la captura a este equipo sin comprobarlo. Se reprodujo el síntoma en el paquete instalado `pass6` entrando por `http://192.168.1.85:8080`: al pulsar Mesa 1, la consola registró `TypeError: globalThis.crypto.randomUUID is not a function` y la vista no cambió. El navegador no ofrece `randomUUID` en HTTP por IP. El flujo de Mesa 1 sí abrió en `127.0.0.1:8080`, así que el defecto se localizó en la UI, no en la generación del instalador.

Se sustituyó el identificador del borrador por un UUID v4 generado con `crypto.getRandomValues`, con reserva para navegadores sin Web Crypto. La prueba unitaria cubre explícitamente un entorno sin `randomUUID`. La interfaz corregida, servida por Vite en `192.168.1.85:5173` con el mismo backend instalado, abrió Mesa 1 y «Nueva orden» sin errores de consola.

Se compiló `Restaurante-Setup-0.1.0-ui-ip-pass7-x64.exe`. El primer intento silencioso se canceló con código 5 porque Restart Manager detectó `McAfee Framework Host`; el registro confirmó `reanudación tras cancelar actualización = 0`, salud Go volvió a responder y el hash de la UI instalada quedó intacto. Esto valida la recuperación de la cancelación que faltaba. Un segundo intento con `/NOCLOSEAPPLICATIONS` terminó con código 0, validación interna 0 y `tarea y servidor disponibles = 1`. El hash de `ui/index.html` y de `register-task.ps1` instalados coincidió con la compilación. En el paquete instalado, Mesa 1 y «Nueva orden» abrieron por `http://192.168.1.85:8080` y por `http://localhost:8080`, sin errores nuevos del bundle. La categoría marcador `VALIDACION-WINDOWS-LIMPIA-20260925` conservó el ID 9 después de actualizar.

Luis confirmó que la captura `192.168.1.91:8080` corresponde a **otro equipo Windows**. La reproducción y la corrección en este equipo respaldan la causa, pero aún se debe instalar el paquete allí y repetir la prueba con su navegador y su IP actual.

El arranque instalado utiliza una tarea programada de Windows llamada `Restaurante POS`, no un servicio visible en `services.msc`. Se añadió una descripción a la tarea y la guía `docs/SOPORTE_WINDOWS.md` para localizarla, consultar salud/registros y administrar las cuentas iniciales de una base nueva. La guía distingue esas credenciales de las cuentas reales, cuyos PIN y contraseñas no pueden recuperarse de sus hashes.

## Configuración, reinicio y actualización final de esta prueba

Se comprobó que `0.1.0-ui-ip-pass8` se actualizó sobre los datos existentes **sin** el parámetro especial `/NOCLOSEAPPLICATIONS`, después de fijar `CloseApplications=no` en Inno Setup. Terminó con código 0, validación interna 0 y tarea/servidor disponibles 1; conservó la categoría de prueba (ID 9). Así se evitó que Restart Manager intentara cerrar McAfee. No se modificó McAfee ni su configuración.

El paquete `0.1.0-ui-ip-pass9` aseguró la existencia del archivo persistente `C:\ProgramData\Restaurante\config.json` (lo crea con valores iniciales si aún no existe) y añadió la tarea bajo demanda `Restaurante POS - Reiniciar`. Se instaló como actualización con código 0; el registro confirmó `Installation process succeeded.`, `resultado de validación = 0` y `tarea y servidor disponibles = 1`. En Opciones, bajo Red local, el administrador puede pedir y confirmar el reinicio. La prueba real desde el navegador por IP detuvo y volvió a iniciar el servidor: el navegador volvió al salón y `restart.log` registró el reinicio. Por API, el endpoint exigió rol administrador en Go y respondió 202 a la petición válida.

El permiso `servidor_red_habilitado` del archivo ya no es cosmético: al desactivarlo por Opciones o API, `localhost` respondió HTTP 200 y la IP del equipo HTTP 403; al reactivarlo, la IP volvió a HTTP 200. El valor persistió en `config.json`. El puerto 8080 sigue fijado en la tarea instalada; cambiar `puerto` únicamente en el archivo no cambia el listener. La IP se descubre al consultar la red, así que la corrección de los botones no depende de una dirección concreta.

Queda por instalar el paquete corregido en el **otro** Windows de la captura y repetir allí Mesa 1, «Nueva orden» y acceso desde otro dispositivo. Ese equipo no estaba accesible desde este Windows en la IP antigua de la captura. La prueba de recuperación integral dentro de Inno Setup también sigue pendiente; el workflow Windows añade una actualización con fallo deliberado en un runner descartable para comprobarla antes de integrar.

Después de ajustar la advertencia de Opciones, se compiló e instaló `0.1.0-ui-ip-pass10` en este Windows. Inno registró instalación exitosa, validación 0 y servidor disponible 1. `/api/salud` respondió `ok=true`, el archivo de interfaz instalado coincidió con el paquete compilado, el endpoint informó reinicio disponible y la categoría de prueba conservó el ID 9. El SHA-256 del `.exe` de prueba es `6F7E2425F8E9B6AFEF384D21B7252515E8B2E6832717CBDD15644684D1719B42`; deben permanecer junto a él sus archivos `-0.bin` y `-1.bin`. No es un instalador autorizado para operación mientras falten las verificaciones anteriores.

La revisión automática volvió a bloquear la compilación local de un Setup con migración intencionalmente inválida (`blocked by policy`), sin indicar un motivo más específico. Esa prueba no se ejecutó en este equipo. El MCP actualizó los 19 archivos de código y documentación de la PR #19, pero rechazó `.github/workflows/installer-windows.yml` porque la autorización OAuth carece del permiso `workflow`. El otro conector devolvió HTTP 403 (`Resource not accessible by integration`) y `git push` sin interacción informó que no hay credencial disponible. La PR continúa en borrador; la prueba nueva de recuperación sigue pendiente de subir y ejecutar en CI.

La revisión actual del firewall de este Windows encontró la red `WiFi_Mesh-780224` clasificada como **Pública**, con política `BlockInbound,AllowOutbound`. No hay regla entrante para el puerto TCP 8080 ni para `C:\Program Files\Restaurante\restaurante.exe`; las reglas con nombre Restaurante que se encontraron apuntan al binario antiguo de desarrollo. `netsh advfirewall` muestra además `LocalFirewallRules: N/A (GPO-store only)`. Por eso el acceso desde otro dispositivo no queda probado ni garantizado por las respuestas HTTP obtenidas desde este mismo equipo. La configuración del firewall requiere una política de red autorizada para el equipo objetivo, después de sustituir las credenciales iniciales.

## Seguimiento del 2026-09-26: DHCP, firewall y recuperación aislada

`Get-NetIPAddress` confirmó que `192.168.1.85/24` procede de DHCP y `Get-NetIPInterface` que DHCP está habilitado para Wi-Fi. Esa dirección puede cambiar; el instalador no debe fijarla. Para que los clientes usen una dirección estable, el responsable de la red debe reservarla para el equipo en el router o servidor DHCP. La regla opcional nueva del instalador usa el ejecutable instalado, TCP 8080, `LocalSubnet` y perfil Privado, no la dirección IP actual. Está desmarcada por defecto y en el perfil Público actual no habilita acceso desde otros dispositivos. La directiva local de firewall todavía debe verificarse en la red objetivo.

La prueba `scripts/validar-rollback-aislado-windows.ps1` se ejecutó sobre archivos y SQLite temporales. Una migración válida creó una tabla y su registro; la siguiente migración falló deliberadamente. `rollback-update.ps1` restauró los hashes originales de `salon.sqlite` y `ui/index.html`, quitó archivos exclusivos de la actualización y la tabla migrada, y `-verify-install` volvió a pasar. El script de restauración recibió `-SkipTaskStart` en esta prueba para no tocar la tarea del Restaurante instalado. Esto comprueba los scripts de respaldo/restauración, pero no la secuencia completa del instalador Inno.

Inno Setup 6.7.3 compiló el paquete multifichero con la nueva tarea opcional de firewall y el script de desinstalación de la regla. Pasaron 520/520 pruebas Vitest, Go y el build de producción; una comprobación aislada de PowerShell confirmó los parámetros `Private`, `TCP`, `8080` y `LocalSubnet` sin modificar el firewall real. La regla no fue activada en este equipo. Quedan la ejecución de ese paquete, la prueba real desde otro dispositivo y la recuperación provocada dentro de Inno Setup antes de una entrega operativa.
