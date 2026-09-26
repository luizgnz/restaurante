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

Inno Setup 6.7.3 compiló el paquete multifichero con la nueva tarea opcional de firewall y el script de desinstalación de la regla. Pasaron 520/520 pruebas Vitest, Go y el build de producción; una comprobación aislada de PowerShell confirmó los parámetros `Private`, `TCP`, `8080` y `LocalSubnet` sin modificar el firewall real. En esa etapa la regla aún no se había activado en este equipo; las pruebas reales del paquete se registran a continuación.

### Prueba real del paquete nuevo en este Windows

El paquete multifichero local (`Setup.exe` SHA-256 `A783E377A3CEBEB877C3F1514E9917C652FEAEDEEE4EFA9542E0C03C8D51ADCE`) se ejecutó como actualización con la tarea de firewall desmarcada. Terminó con código 0; Inno registró `resultado de validación = 0` y `tarea y servidor disponibles = 1`. El binario instalado coincidió con el compilado, `/api/salud` respondió `ok=true, runtime=go`, y la categoría de validación conservó su nombre e ID 9. Se creó un nuevo respaldo previo a la actualización. No apareció una regla nueva.

Se repitió la actualización seleccionando explícitamente `lanfirewall`. Inno informó `regla LAN privada TCP 8080 = 1`. Windows mostró una única regla llamada `Restaurante POS (LAN, TCP 8080)`: dirección entrante, acción permitir, programa `C:\Program Files\Restaurante\restaurante.exe`, protocolo TCP, puerto local 8080, origen `LocalSubnet` y perfil `Private`. La interfaz Wi-Fi permaneció en perfil Público; la regla no abrió ese perfil. Se quitó la regla tras verificarla, y la salud y el marcador ID 9 siguieron intactos.

En el navegador del mismo equipo, después de instalar, Mesa 1 abrió el editor de orden y «Nueva orden» abrió el selector de destino tanto en `localhost` como en `192.168.1.85`. Por IP cargaron también Órdenes e Inventario. Esto confirma el comportamiento por dirección IP en **este servidor**, pero sigue sin ser una prueba de conexión desde otra máquina.

Para validar la desinstalación de la regla, se volvió a crear solo esa regla y se ejecutó el desinstalador del paquete nuevo. Terminó con código 0, eliminó el ejecutable y la regla, y conservó `C:\ProgramData\Restaurante\data\salon.sqlite`. Se reinstaló inmediatamente el mismo paquete con la opción LAN desmarcada: código 0, validación 0, servidor disponible 1, salud correcta, marcador ID 9 intacto y ninguna regla de prueba presente.

Se intentó preparar una compilación separada para provocar un fallo posterior a una migración válida y observar el rollback completo de Inno. La revisión automática rechazó la ejecución de ese procedimiento antes de generar o ejecutar el paquete de prueba. No se alteró la instalación con una migración de fallo. La recuperación de Inno permanece **sin validar**; no fusionar esta PR ni entregar el instalador para uso operativo mientras falte esa prueba y la validación en el otro Windows.

### Recorrido web adicional del paquete instalado

En el navegador integrado de este Windows, `http://127.0.0.1:8080` permitió iniciar sesión con la cuenta inicial de la base de prueba. Mesa 1 abrió el constructor de órdenes, se seleccionaron productos y el resumen mostró cuatro unidades por $4.000. El botón entonces llamado **Cancelar** volvió al salón sin enviar la orden; Mesa 1 quedó libre. Al entrar de nuevo, las cuatro unidades seguían en el borrador local, según el comportamiento diseñado de `localStorage`. La afirmación anterior de que ese botón descartaba el borrador era incorrecta. En Órdenes, la vista del mesero mostró la lista vacía y la vista de cocina mostró cero órdenes activas. En Inventario, buscar «Café» filtró a un material con 3.000 gr disponibles. Opciones cargó la sección de red local con el servidor disponible, puerto 8080 y la dirección actual `192.168.1.85`. La consola del navegador no registró errores durante este recorrido. No se enviaron órdenes ni se cambiaron existencias o ajustes.

Un intento inicial de clic automatizado sobre la cinta fija «Orden» añadió unidades del producto situado detrás; el teclado sí abrió el resumen. Se repitió el clic con una pestaña nueva y tamaños de 1280 × 720, 854 × 764 y 390 × 844: en los tres casos abrió el resumen y conservó la cantidad de productos. En otra sesión del navegador integrado, después de instalar `pass11`, los clics automatizados sobre la cinta volvieron a añadir productos y el clic sobre Inventario tampoco navegó; las mismas acciones por teclado funcionaron. Este comportamiento inconsistente del control del navegador impide atribuir el fallo a la aplicación o dar por validado el puntero. Hace falta probar los clics con ratón real en Chrome o Edge en la instalación afectada. El intento de abrir el sitio en Edge mediante control de Windows se detuvo porque la herramienta no pudo identificar con seguridad la URL activa; no hubo prueba en Edge ni desde otro dispositivo.

Como el borrador se conserva al salir, la acción **Cancelar** resultaba engañosa. En el código de la PR se cambió a **Volver** y, cuando hay productos o indicaciones, se muestra que el borrador seguirá guardado en ese navegador. Se comprobó el texto y la disposición del diálogo en la UI servida desde el código a 1280 y 390 píxeles de ancho, contra el backend Go instalado. Pasaron 520/520 pruebas Vitest, la suite Go y la compilación TypeScript/Vite.

Se compiló e instaló `Restaurante-Setup-0.1.0-ux-pass11-x64.exe` con elevación de Windows (código 0). El registro de Inno confirmó `Installation process succeeded.`, `resultado de validación = 0` y `tarea y servidor disponibles = 1`; `/api/salud` devolvió `ok: true`. Los SHA-256 del HTML y binario instalados coincidieron con los del paquete preparado. Se creó el respaldo de actualización `20260926-011519` y la categoría de prueba `VALIDACION-WINDOWS-LIMPIA-20260925` permaneció con ID 9. En la interfaz instalada se comprobó que el resumen muestra **Volver** y el aviso de persistencia. El borrador de prueba se vació y Mesa 1 quedó libre. No se creó una regla de firewall LAN. El workflow `instalador-windows` del commit `dd7ecc0` terminó correctamente (run 36217172134).

La migración `026_menu_real_restaurante.sql` añadió el catálogo con códigos internos `menu-real:...`; Inventario y la carta ya mostraban el campo `codigo` desde antes, por lo que los identificadores quedaron visibles. Se cambió la presentación para ocultar solo esos códigos internos y conservar la búsqueda y los códigos comerciales. Se compiló `Restaurante-Setup-0.1.0-ui-clean-pass12-x64.exe` y se instaló con elevación: código 0, validación 0, servidor disponible 1, salud Go correcta y marcador SQLite ID 9 preservado. Los SHA-256 del HTML y binario instalados coinciden con los del paquete preparado. En `localhost:8080`, la carta mostró 81 productos y el Inventario 82 materiales, sin ninguna ocurrencia visible de `menu-real:` en ambas vistas.

Tras `pass12`, se abrió una pestaña nueva del navegador integrado para descartar el estado errático de la pestaña anterior. Por `127.0.0.1:8080`, los clics en Inventario, Mesa 1, un producto, la cinta de resumen, quitar ese producto, Volver y Nueva orden funcionaron; Mesa 1 quedó libre y no se envió ningún pedido. En otra pestaña nueva, por `192.168.1.85:8080`, el inicio de sesión y los clics en Mesa 1, Nueva orden e Inventario funcionaron. Este recorrido comprueba la interacción en el navegador integrado **del mismo equipo** con la IP actual; no sustituye la comprobación en Chrome/Edge del otro Windows ni la conexión desde otro dispositivo.

Con `pass12` instalado y sin cuentas en curso, se pulsó **Opciones → Red local → Reiniciar Restaurante → Confirmar reinicio**. El navegador regresó al salón, `restart.log` registró la solicitud `2026-09-26T01:41:50`, el proceso que escuchaba en 8080 cambió de PID 20780 a 18400 y `server.log` registró el nuevo arranque. `/api/salud` devolvió `ok: true`, `runtime: go` por localhost y por `192.168.1.85`; la categoría de prueba conservó el ID 9. Esto comprueba el reinicio desde la interfaz en la versión actualmente instalada.

Para la validación pendiente en el otro Windows se preparó inicialmente en Documentos `Restaurante-Setup-0.1.0-ui-clean-pass12-x64.zip` (SHA-256 `422495BD4A5DF42896B07770A02397B0A76CAE4F3FDF553092924F3AA32B1598`). Se reemplazó como paquete de prueba recomendado por `pass13`, descrito abajo. Cada ZIP contiene el `.exe`, los dos `.bin`, `LEEME-INSTALACION.txt` y `SHA256SUMS.txt`; se debe extraer completo y ejecutar el `.exe` junto a los `.bin`.

### Espera antes de respaldar y recuperación de la tarea

La revisión del código detectó que `prepare-update.ps1` empezaba a copiar SQLite inmediatamente después de pedir el fin de la tarea; Windows podía tardar en cerrar el proceso. También `rollback-update.ps1` podía copiar sobre una tarea que hubiese quedado activa tras un arranque fallido. Los scripts ahora esperan hasta 30 segundos a que salga `restaurante.exe` y abortan antes de copiar o restaurar SQLite si sigue ejecutándose. La restauración detiene la tarea antes de copiar y comprueba `/api/salud` después de volver a arrancar. El modo de prueba aislado omite solo la comprobación del proceso instalado, porque trabaja sobre otra base temporal mientras el servidor real sigue activo.

El parser de PowerShell aceptó los tres scripts modificados; `validar-rollback-aislado-windows.ps1` restauró SQLite e interfaz después de una migración fallida. Se compiló e instaló `Restaurante-Setup-0.1.0-safe-backup-pass13-x64.exe` (código 0); los scripts instalados coincidieron con los del proyecto por SHA-256. Se ejecutó el mismo Setup otra vez, ahora usando el `prepare-update.ps1` corregido ya instalado: código 0, respaldo `20260926-015237`, validación 0, tarea y servidor disponibles 1, `/api/salud` correcto y categoría marcador con ID 9. Pasaron 520/520 pruebas Vitest, Go y el build Windows. La ruta de fallo integral dentro de Inno **sigue sin comprobarse**.

El ZIP recomendado para llevar al otro Windows es `C:\Users\Fermin\Documents\Restaurante-Setup-0.1.0-safe-backup-pass13-x64.zip`, SHA-256 `B451F0353F4C77C46CEC685EF79485C9AFEB532A7F4D0A79B3D8F340B7A6EBB8`. Se verificó la integridad del ZIP y que las cuatro sumas internas coinciden con sus archivos. Aún no se ha instalado en el otro equipo.

### Alcance de cierre acordado el 2026-09-26

Luis retiró la prueba en el otro Windows como requisito de esta revisión: la validación se limita al Windows actual. Este equipo usa Windows Home (`CoreSingleLanguage`, 24H2) y no tiene `WindowsSandbox.exe`; Windows Sandbox no está disponible en esa edición. Por tanto, tampoco se usó Sandbox ni otra VM. La prueba por IP `192.168.1.85` se hizo desde el propio equipo; el acceso desde otro dispositivo de la red y el comportamiento en el equipo de la captura permanecen **sin comprobar**, como límites de la evidencia, sin bloquear por sí solos el cierre de esta revisión local.

Se abrió en modo de solo lectura el respaldo real de la segunda actualización `C:\ProgramData\Restaurante\backups\updates\20260926-015237\data\salon.sqlite`. `PRAGMA integrity_check` devolvió `ok` y `categorias_pos` conservó el registro ID 9 `VALIDACION-WINDOWS-LIMPIA-20260925`. El servidor instalado continuó respondiendo `{"ok":true,"runtime":"go"}`. Esto confirma que el respaldo contiene una base íntegra con el dato de control, sin sustituir la prueba de restauración completa dentro de Inno.

**Pendiente para distribuir el instalador para uso operativo:** la recuperación integral de una actualización fallida dentro de Inno Setup. La revisión automática bloqueó dos intentos de crear o ejecutar localmente un Setup deliberadamente fallido con el mensaje `blocked by policy`, sin detalle adicional. La prueba aislada de los scripts sí pasó, pero no cubre la orquestación del instalador. No se repetirá ese procedimiento bloqueado en este equipo. La configuración de IP estable mediante reserva DHCP y la prueba desde otro dispositivo quedan como pasos de puesta en marcha de red en el sitio donde se instale.

Para decidir sobre la **integración del código**, se revisó el orden de eventos de Inno: `CurStepChanged(ssPostInstall)` se ejecuta después de la instalación, y la documentación oficial indica que, una vez finalizado el registro de desinstalación, los errores posteriores ya no revierten automáticamente los archivos. El código ejecuta la restauración en ese paso antes de señalar el fallo. Esta revisión documental, junto con la restauración aislada, no detectó un fallo conocido de pérdida de datos en la PR; permite integrar el código si los demás controles están en verde, manteniendo abierta la prueba integral como condición de distribución. Referencias: [eventos de Inno](https://jrsoftware.org/ishelp/topic_scriptevents.htm) y [orden de instalación](https://jrsoftware.org/ishelp/topic_installorder.htm).

### Intento posterior de validar el respaldo real

Después de fusionar la PR #20, se intentó comprobar en una carpeta temporal que el `rollback-update.ps1` instalado restaurase los archivos del respaldo real `20260926-015237` y que `restaurante.exe -verify-install` aceptase esa copia. La revisión automática rechazó el comando antes de ejecutarlo (`blocked by policy`, sin motivo más específico). No se creó la carpeta temporal ni se modificó la instalación. La integridad SQLite de solo lectura y la prueba aislada anterior son la evidencia disponible; la restauración de ese respaldo real y el fallo integral de Inno siguen sin comprobarse.

La lista de pruebas y evidencia está en [Pruebas pendientes de Windows](PRUEBAS_PENDIENTES_WINDOWS.md). La configuración local ya indicaba `approval_policy = "never"` y `sandbox_mode = "danger-full-access"`; aquel rechazo se produjo en el ejecutor de Codex antes de iniciar PowerShell y no identificó una regla editable ni un error de Windows. La prueba integral posterior se documenta a continuación.

### Prueba integral posterior en este Windows (26 de septiembre)

Luis autorizó expresamente usar este mismo equipo y aclaró que **los productos son reales**; cantidades, recetas y pedidos son datos de prueba. Antes de alterar la instalación se copiaron fuera de `ProgramData` los 83 archivos del respaldo de `20260926-015237`; todos coincidieron con su origen por SHA-256. Una instantánea SQLite consistente de la base activa, creada con `VACUUM INTO`, pasó `PRAGMA integrity_check` y conservó el marcador ID 9. Las seis instantáneas SQLite antes y después de los ensayos coincidieron por SHA-256; el valor se conserva en `sha256-evidencia.json` fuera del repositorio. El respaldo, las instantáneas y los registros de Setup están en `%USERPROFILE%\Documents\Restaurante-rollback-preflight-20260926` de este equipo. El ejecutable y el HTML del respaldo externo coincidieron con los instalados. La aceptación de esta preparación por el ejecutor en esta sesión no explica los rechazos anteriores.

Se compiló una variante temporal del Setup con una migración `030_rollback_probe.sql` y una marca en `ui/index.html`. Ambas fueron copiadas al directorio instalado. Después de que `restaurante.exe -verify-install` terminara bien, la variante forzó `VerifyOK = False` en `CurStepChanged(ssPostInstall)`. El registro de Inno confirmó que la instalación de archivos había terminado, el fallo de validación forzado y el mensaje **«Se restauró la instalación anterior»**. Desapareció la migración de prueba, el HTML y el ejecutable recuperaron sus hashes previos, `/api/salud` respondió con Go y la instantánea SQLite posterior tuvo el **mismo SHA-256** que la previa. Se detectó un defecto: el proceso Setup devolvió **0** pese a la excepción registrada después de completar la copia.

La corrección usa `GetCustomSetupExitCode` para devolver **20** cuando falla la validación y la restauración termina, o **21** si también falla la restauración. Se evitó un segundo arranque innecesario de la tarea al salir del Setup después de restaurar. Una segunda variante de fallo después de validar devolvió **20** y restauró binario, HTML y SQLite con el mismo hash inicial. También se llevó el fallo al guardar `install-success.marker` por el camino de restauración: una tercera variante dejó arrancar el nuevo servidor, forzó ese error, devolvió **20**, recuperó la versión anterior y conservó el hash SQLite. El código 21 y un fallo real de escritura del marcador no se provocaron en la instalación activa; la variante simuló esa condición después de que la escritura devolviera éxito. La [documentación oficial de Inno](https://jrsoftware.org/ishelp/topic_scriptevents.htm) especifica que `GetCustomSetupExitCode` reemplaza el 0 que Setup habría devuelto al completar la instalación.

Se compiló el paquete normal `0.1.0-exitcode-pass15` desde el código y se instaló como actualización: **código 0**, `resultado de validación = 0`, `tarea y servidor disponibles = 1`, `install-success.marker = ok`, `/api/salud` correcto y ninguna migración de prueba presente. La instantánea SQLite tras esa actualización conservó exactamente el SHA-256 inicial. Queda comprobar el arranque de `pass15` tras reiniciar Windows; el acceso entrante desde otro dispositivo, Windows 10/macOS y la firma del ejecutable son límites de esta revisión en un solo equipo. El estado resumido está en [Pruebas pendientes de Windows](PRUEBAS_PENDIENTES_WINDOWS.md).

Después de la corrección pasaron `npm test` (520/520 en 86 archivos), `npm run test:go` y `npm run build:windows` con TypeScript, Vite, Go e Inno Setup 6.7.3. El código 21, reservado para un fallo adicional de la restauración, no se provocó sobre la instalación con productos reales.

### Comprobación web de `pass15` en este equipo

En sesiones nuevas del navegador integrado se inició sesión con `http://localhost:8080` y `http://192.168.1.85:8080`. Desde ambas direcciones, el clic en Mesa 1 abrió «Nueva orden · Mesa #1» y cargó 81 productos; el botón «Nueva orden» abrió el selector de mesa o para llevar; «Inventario» cargó 82 materiales. No se envió ninguna orden ni se modificaron productos. El servidor instalado respondió `{"ok":true,"runtime":"go"}` en `/api/salud` y el marcador de instalación contiene `ok`.

El proceso que escucha en el puerto 8080 es `restaurante.exe` en la sesión de servicios. La consulta de `Restaurante POS` mediante `Get-ScheduledTask` y `schtasks` recibió «Access is denied» desde el token no elevado de esta sesión, por lo que el estado de la tarea deberá comprobarse como administrador tras el reinicio. Este Windows aún no se ha reiniciado desde la instalación de `pass15`. El navegador Edge y el acceso entrante desde otro dispositivo tampoco se verificaron en esta comprobación.

### Arranque final de `pass15` después del reinicio

El 26 de septiembre de 2026, Windows informó `LastBootUpTime = 12:14:57` (UTC−03). Sin iniciar el programa desde esta sesión, `server.log` registró Restaurante en 8080 a las 12:15:14; el proceso atiende el puerto en la sesión 0 y `/api/salud` responde con Go. El marcador de instalación sigue fechado a las 03:01:14, antes del reinicio. El ejecutable y `ui/index.html` instalados coinciden por SHA-256 con el paquete preparado.

La base activa se abrió en modo de solo lectura: `PRAGMA integrity_check` devolvió `ok`, la categoría de control conservó el ID 9 y los 139 registros de `productos`, incluidos todos sus campos, coincidieron con `after-pass15.sqlite`. La evidencia sin datos del catálogo está en `%USERPROFILE%\Documents\Restaurante-rollback-preflight-20260926\post-reboot-validation.json`. La consulta de metadatos de la tarea con el token no elevado devuelve acceso denegado; el proceso, los registros y la salud sí verifican el arranque posterior al reinicio. La prueba pendiente en Edge y los límites de despliegue permanecen en el documento de pendientes y no se confunden con un fallo conocido de la aplicación.
