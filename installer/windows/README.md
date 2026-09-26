# Instalador Windows

El instalador de Restaurante está dirigido a Windows 10/11 x64. Instala el binario Go y la interfaz compilada; el equipo del restaurante no necesita Node.js, npm ni Go.

Setup solicita permisos de administrador (`PrivilegesRequired=admin`). Los necesita para escribir en `C:\Program Files\Restaurante`, registrar las tareas de Windows bajo la cuenta del sistema y, si se elige acceso LAN, crear la regla de firewall. El navegador de los usuarios funciona con permisos normales; la regla LAN sigue siendo opcional y viene desmarcada.

## Generación

```powershell
npm ci
npm run test:go
npm test
$env:RESTAURANTE_VERSION = "1.0.0"
npm run build:windows
```

En Windows, el comando utiliza Inno Setup 6 si está instalado en su ubicación estándar o si `ISCC_PATH` apunta a `ISCC.exe`. El resultado queda en `installer/windows/output/`. En macOS o Linux se prepara y verifica el paquete Windows, pero el instalador definitivo se compila en el workflow `instalador-windows` sobre un runner Windows.

El instalador se distribuye como un ZIP que contiene `Restaurante-Setup-<versión>-x64.exe` y sus archivos `Restaurante-Setup-<versión>-x64-*.bin`. Deben extraerse juntos en una carpeta antes de ejecutar el `.exe`; no se debe enviar el ejecutable por separado. Esta distribución evita que Inno Setup intente lanzar su motor desde `%TEMP%`, ubicación bloqueada por algunas políticas de Seguridad de Windows.

## Comportamiento

1. Si existe una instalación anterior, detiene la tarea local, espera a que salga `restaurante.exe` y copia la aplicación y `salon.sqlite` a `C:\ProgramData\Restaurante\backups\updates\<fecha-hora>`. Si el servidor sigue activo después de 30 segundos, aborta antes de copiar la base.
2. Conserva únicamente los tres puntos automáticos de actualización más recientes. No elimina respaldos manuales ni de jornada.
3. Instala la aplicación en `C:\Program Files\Restaurante` y mantiene datos y configuración en `C:\ProgramData\Restaurante`.
4. Ejecuta `restaurante.exe -verify-install`, que abre SQLite, aplica migraciones, asegura el catálogo inicial y comprueba la base y la interfaz antes de activar la versión. En la primera instalación crea `salon.sqlite`; no intenta restaurar una base inexistente.
5. Registra **`Restaurante POS`** como tarea de inicio y **`Restaurante POS - Reiniciar`** como tarea bajo demanda, ambas con descripción y bajo la cuenta del sistema; espera hasta que `/api/salud` responda. Se encuentran en **Programador de tareas → Biblioteca del Programador de tareas**, no en `services.msc`. Solo entonces ofrece «Abrir Restaurante».
6. Si falla la validación o el arranque durante una actualización, detiene la tarea, espera la salida del proceso y restaura la aplicación y la base anteriores. La restauración quita archivos exclusivos de la actualización fallida y archivos WAL/SHM obsoletos, reinicia la tarea y comprueba `/api/salud`. Si Setup se cancela después de detener la tarea, intenta reanudar la versión anterior. En una primera instalación informa el error y deja los registros para diagnóstico.
7. Opcionalmente, si se marca la casilla de acceso LAN (desmarcada al inicio), añade una regla entrante de firewall limitada a `restaurante.exe`, TCP 8080, `LocalSubnet` y perfil Privado. La IP asignada al servidor no forma parte de la regla. El desinstalador elimina la regla creada por Restaurante.
8. El desinstalador elimina la aplicación y las tareas, pero conserva base, configuración y respaldos.

El instalador detiene por sí mismo la tarea antes de actualizar. No solicita cerrar aplicaciones ajenas que estén examinando los archivos, como `McAfee Framework Host`; se comprobó que esta configuración permite actualizar en el Windows de prueba sin afectar la base.

Los scripts de respaldo, restauración y registro de la tarea se ejecutan desde `C:\Program Files\Restaurante\installer`, no desde `%TEMP%`.

Para diagnosticar un fallo, revise `C:\ProgramData\Restaurante\logs\install.log`, `server.log`, `install-task.log` y `restart.log`. La configuración persistente está en `C:\ProgramData\Restaurante\config.json`; el puerto del instalador es 8080. El flujo `instalador-windows` ejecuta el binario compilado en un Windows limpio con datos temporales y comprueba SQLite, la API de salud y la página inicial.

La guía [Soporte Windows](../../docs/SOPORTE_WINDOWS.md) indica cómo ubicar y reiniciar la tarea, comprobar la aplicación, reservar la IP mediante DHCP, revisar el firewall, guardar registros y gestionar usuarios. En una red marcada como Pública la regla opcional no se activa. Cambie las credenciales iniciales antes de utilizar el acceso LAN.

## Verificación real obligatoria antes de publicar

- Ejecutar el `Setup.exe` en Windows 10 y Windows 11 x64 limpios.
- Probar instalación inicial, actualización exitosa y actualización forzada a fallar.
- Confirmar restauración de aplicación y SQLite, arranque tras reiniciar Windows y acceso desde otro dispositivo de la red local.
- Firmar el ejecutable antes de entregarlo a un restaurante.

La instalación inicial, las actualizaciones con datos, la reanudación tras una cancelación causada por McAfee y el reinicio solicitado desde Opciones se comprobaron en Windows 11. La espera del proceso antes del respaldo pasó en una actualización repetida con `pass13`; la restauración se probó de forma aislada. Aún falta forzar un fallo real del instalador y verificar el paquete en el otro equipo Windows y desde otro dispositivo de su red. Ver `docs/REVISION_INSTALACION_STACK_2026-09-25.md`.
