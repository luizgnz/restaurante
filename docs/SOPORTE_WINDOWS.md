# Soporte de Restaurante en Windows

## Dónde encontrar el servidor

El instalador registra una **tarea programada llamada `Restaurante POS`** en la raíz de **Programador de tareas → Biblioteca del Programador de tareas** (`taskschd.msc`). Se ejecuta al iniciar Windows bajo `SYSTEM` y mantiene `restaurante.exe` escuchando en el puerto 8080. No es un servicio del Administrador de servicios (`services.msc`), por eso no aparece allí. El acceso directo «Restaurante» abre el navegador; no inicia el servidor.

También registra **`Restaurante POS - Reiniciar`**. Esta segunda tarea se ejecuta solo cuando un administrador pulsa **Opciones → Red local → Reiniciar Restaurante** y confirma. Espera a que el navegador reciba la respuesta, detiene la tarea principal y vuelve a iniciarla. El navegador comprueba la salud del servidor y recarga la página. Termine o guarde el trabajo en curso antes de usarla.

En PowerShell **como administrador**:

```powershell
Get-ScheduledTask -TaskName 'Restaurante POS' | Select-Object TaskName,State,Description
Get-ScheduledTaskInfo -TaskName 'Restaurante POS' | Select-Object LastRunTime,LastTaskResult
Start-ScheduledTask -TaskName 'Restaurante POS'
```

Si la tarea está en ejecución pero la aplicación no responde, consulte los registros antes de reiniciarla. Para reiniciar la tarea durante una ventana de mantenimiento:

```powershell
Stop-ScheduledTask -TaskName 'Restaurante POS'
Start-ScheduledTask -TaskName 'Restaurante POS'
```

No ejecute una segunda copia de `restaurante.exe` mientras la tarea esté activa: ambas competirían por el puerto 8080 y la base de datos.

## Rutas y comprobaciones

| Elemento | Ubicación |
| --- | --- |
| Aplicación y archivos de interfaz | `C:\Program Files\Restaurante` |
| Base SQLite | `C:\ProgramData\Restaurante\data\salon.sqlite` |
| Configuración | `C:\ProgramData\Restaurante\config.json` |
| Respaldos de actualización | `C:\ProgramData\Restaurante\backups\updates` |
| Registros | `C:\ProgramData\Restaurante\logs` |

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/salud
Get-Content 'C:\ProgramData\Restaurante\logs\server.log' -Tail 80
Get-Content 'C:\ProgramData\Restaurante\logs\install.log' -Tail 80
Get-Content 'C:\ProgramData\Restaurante\logs\install-task.log' -Tail 80
Get-Content 'C:\ProgramData\Restaurante\logs\restart.log' -Tail 80
```

`config.json` se crea con valores iniciales durante la instalación y persiste entre actualizaciones. Ajuste las opciones habituales desde **Opciones**: allí se guardan en este archivo y se aplican al instante. Para editar el JSON manualmente, guarde una copia, mantenga su sintaxis válida y reinicie Restaurante para que el servidor cargue los cambios. `servidor_red_habilitado` permite o bloquea conexiones de otros equipos; el equipo servidor siempre puede usar `http://localhost:8080`. La IP se detecta de las interfaces de Windows: si cambia, use la dirección nueva que muestra **Opciones → Red local**. El instalador Windows fija actualmente el puerto de escucha en **8080** mediante la tarea programada; cambiar `puerto` solo en el JSON no cambia ese puerto.

Si se desactiva el acceso por red desde un navegador conectado por IP, ese navegador pierde el acceso al guardar. Para reactivarlo, abra `http://localhost:8080` **en el equipo servidor**, entre como administrador y active la opción. El firewall de Windows y la red deben permitir el puerto 8080 para que se conecten otros equipos.

### Dirección del servidor y regla de firewall

El instalador ofrece una tarea opcional, **desmarcada por defecto**, para crear la regla entrante `Restaurante POS (LAN, TCP 8080)`. Permite **solo TCP 8080** al ejecutable instalado `restaurante.exe`, desde `LocalSubnet` y únicamente cuando Windows usa el perfil **Privado**. No habilita todos los puertos, no fija una IP del servidor y no se aplica al perfil Público. El desinstalador elimina esa regla. Antes de seleccionar la tarea, confirme que la red sea de confianza; al terminar, cambie de inmediato las credenciales y PIN iniciales. Una directiva de la organización puede impedir que la regla local tenga efecto. La opción `servidor_red_habilitado` también debe estar activa.

Para comprobar la dirección y si viene de DHCP en PowerShell del servidor:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object PrefixOrigin -eq Dhcp | Select-Object InterfaceAlias,IPAddress,PrefixLength,PrefixOrigin
Get-NetConnectionProfile | Select-Object InterfaceAlias,NetworkCategory
Get-NetFirewallRule -DisplayName 'Restaurante POS (LAN, TCP 8080)' -ErrorAction SilentlyContinue | Select-Object DisplayName,Enabled,Profile,Direction,Action
```

Si el servidor obtiene la IP por DHCP, la dirección puede cambiar aunque Restaurante siga escuchando en el puerto 8080. Para mantenerla estable, cree una **reserva DHCP en el router o servidor DHCP** para la tarjeta de red de este equipo; anote la IP reservada y use `http://IP_RESERVADA:8080` en los otros dispositivos. Cada router tiene su propia interfaz de configuración. Si se opta por una IP manual en Windows, coordine una dirección excluida del rango DHCP y configure también puerta de enlace y DNS; no copie `192.168.1.85` a otra red. Si cambia de Wi-Fi a Ethernet, la reserva de la tarjeta anterior no se transfiere automáticamente.

`/api/salud` debe responder con `ok: true` y `runtime: go`. Si funciona en `127.0.0.1` pero falla desde otro equipo, compruebe la IP actual del servidor, que ambos equipos estén en la misma red y que el firewall permita únicamente los dispositivos autorizados. La IP puede cambiar después de reiniciar el router o Windows. Si carga la página por IP pero no abren Mesas o «Nueva orden», confirme que se instaló una versión que incluya la corrección de `crypto.randomUUID` para HTTP por IP; revise también la consola del navegador.

La actualización conserva la base y crea un respaldo antes de sustituir archivos. El desinstalador conserva datos y respaldos. Copie la base **con el servidor detenido** o utilice los respaldos verificados; no elimine `salon.sqlite` para solucionar un problema de acceso.

## Cuentas iniciales de una base nueva

El código de arranque crea estas **cuentas de ejemplo solo cuando no hay usuarios**. Son las credenciales iniciales del proyecto, no un listado de las cuentas existentes en una instalación actualizada:

| Nombre | Usuario | Contraseña inicial | PIN inicial | Rol |
| --- | --- | --- | --- | --- |
| Jefa | `admin` | `admin` | `2222` | Administrador |
| Ana | `ana` | `ana` | `1234` | Mesero |

Cambie ambas contraseñas y PIN antes de permitir acceso a la red del restaurante. En **Menú y cuenta → Opciones → Usuarios**, un administrador puede actualizar cada cuenta y crear las demás con un PIN personal. Al editar, dejar vacíos contraseña y PIN conserva sus valores actuales. Las contraseñas y PIN se guardan como hashes Argon2id: soporte no puede leer los valores vigentes desde SQLite. Si alguien los olvida, un administrador debe asignar otros nuevos. No anote las credenciales reales en este repositorio ni en los registros de soporte.

## Diagnóstico rápido

1. Verifique el estado de `Restaurante POS` y `http://127.0.0.1:8080/api/salud` en el equipo servidor.
2. Si la tarea no arranca, revise `install-task.log`, `server.log` y el resultado de la última ejecución.
3. Si la página carga pero una acción no responde, registre la dirección usada (`localhost` o IP), la hora, el botón y el error de la consola del navegador. Compruebe que el JavaScript instalado pertenece al mismo paquete que el servidor.
4. Si el fallo apareció después de actualizar, conserve la base y los registros; revise el respaldo previo en `backups\updates` antes de intentar otra instalación.
5. Para soporte externo, comparta la versión instalada, el estado de la tarea y los errores pertinentes de los registros. Quite datos personales y cookies de sesión antes de enviarlos.
