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

En Windows, el comando utiliza Inno Setup 6 si está instalado en su ubicación estándar o si `ISCC_PATH` apunta a `ISCC.exe`. El resultado queda en `installer/windows/output/`. En macOS o Linux se prepara y verifica el paquete Windows, pero el `Setup.exe` definitivo se compila en el workflow `instalador-windows` sobre un runner Windows.

## Comportamiento

1. Si existe una instalación anterior, detiene la tarea local y copia la aplicación y `salon.sqlite` a `C:\ProgramData\Restaurante\backups\updates\<fecha-hora>`.
2. Conserva únicamente los tres puntos automáticos de actualización más recientes. No elimina respaldos manuales ni de jornada.
3. Instala la aplicación en `C:\Program Files\Restaurante` y mantiene datos y configuración en `C:\ProgramData\Restaurante`.
4. Ejecuta `restaurante.exe -verify-install`, que abre SQLite, aplica migraciones, asegura el catálogo inicial y comprueba la base antes de activar la versión.
5. Si la validación falla, restaura automáticamente la aplicación y la base anteriores y cancela la instalación.
6. Registra `Restaurante POS` como tarea de inicio bajo la cuenta del sistema, sin depender de una sesión de usuario.
7. El desinstalador elimina la aplicación y la tarea, pero conserva base, configuración y respaldos.

## Verificación real obligatoria antes de publicar

- Ejecutar el `Setup.exe` en Windows 10 y Windows 11 x64 limpios.
- Probar instalación inicial, actualización exitosa y actualización forzada a fallar.
- Confirmar restauración de aplicación y SQLite, arranque tras reiniciar Windows y acceso desde otro dispositivo de la red local.
- Firmar el ejecutable antes de entregarlo a un restaurante.
