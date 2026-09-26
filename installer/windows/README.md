# Instalador Windows

El instalador de Restaurante está dirigido a Windows 10/11 x64. Instala el binario Go y la interfaz compilada; el equipo del restaurante no necesita Node.js, npm ni Go.

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

1. Si existe una instalación anterior, detiene la tarea local y copia la aplicación y `salon.sqlite` a `C:\ProgramData\Restaurante\backups\updates\<fecha-hora>`.
2. Conserva únicamente los tres puntos automáticos de actualización más recientes. No elimina respaldos manuales ni de jornada.
3. Instala la aplicación en `C:\Program Files\Restaurante` y mantiene datos y configuración en `C:\ProgramData\Restaurante`.
4. Ejecuta `restaurante.exe -verify-install`, que abre SQLite, aplica migraciones, asegura el catálogo inicial y comprueba la base y la interfaz antes de activar la versión. En la primera instalación crea `salon.sqlite`; no intenta restaurar una base inexistente.
5. Registra `Restaurante POS` como tarea de inicio bajo la cuenta del sistema y espera hasta que `/api/salud` responda. Solo entonces ofrece «Abrir Restaurante».
6. Si falla la validación o el arranque durante una actualización, restaura la aplicación y la base anteriores. La restauración quita archivos exclusivos de la actualización fallida y archivos WAL/SHM obsoletos. Si Setup se cancela después de detener la tarea, intenta reanudar la versión anterior. En una primera instalación informa el error y deja los registros para diagnóstico.
7. El desinstalador elimina la aplicación y la tarea, pero conserva base, configuración y respaldos.

Los scripts de respaldo, restauración y registro de la tarea se ejecutan desde `C:\Program Files\Restaurante\installer`, no desde `%TEMP%`.

Para diagnosticar un fallo, revise `C:\ProgramData\Restaurante\logs\install.log`, `server.log` e `install-task.log`. El flujo `instalador-windows` ejecuta el binario compilado en un Windows limpio con datos temporales y comprueba SQLite, la API de salud y la página inicial.

## Verificación real obligatoria antes de publicar

- Ejecutar el `Setup.exe` en Windows 10 y Windows 11 x64 limpios.
- Probar instalación inicial, actualización exitosa y actualización forzada a fallar.
- Confirmar restauración de aplicación y SQLite, arranque tras reiniciar Windows y acceso desde otro dispositivo de la red local.
- Firmar el ejecutable antes de entregarlo a un restaurante.

La instalación inicial y una actualización con datos se comprobaron en Windows 11 el 2026-09-25. Una cancelación causada por McAfee dejó el servidor detenido antes de la corrección de reanudación. La restauración se probó de forma aislada, pero aún falta forzar un fallo real del instalador y repetir la cancelación con la corrección. Ver `docs/REVISION_INSTALACION_STACK_2026-09-25.md`.
