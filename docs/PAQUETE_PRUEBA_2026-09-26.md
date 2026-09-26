# Paquete de prueba y vuelta atrás · 2026-09-26

Esta versión se construye desde `codex/auditoria-responsive`. La rama nació de `main` `47a61f0` e incorporó `main` `98295b4`, que contiene la recuperación del instalador de la PR #23. El archivo `Restaurante-base-98295b4-fuentes.zip` conserva el **código fuente anterior a esta PR** como referencia reproducible. El ZIP `Restaurante-prueba-<versión>-x64.zip` contiene Setup y sus archivos `.bin`; se deben extraer juntos. Los SHA-256 y el commit exacto se registran en `MANIFIESTO-PRUEBA.txt` dentro del paquete.

## Qué probar

1. Use un Windows descartable o una máquina virtual con instantánea. Si parte de una instalación anterior, cree un dato de control y confirme una copia externa de la base antes de actualizar. El Setup reconoce la instalación existente por su AppId, detiene la tarea `Restaurante POS` y prepara un respaldo de programa y SQLite en `C:\ProgramData\Restaurante\backups\updates`.
2. Extraiga el ZIP completo en una carpeta local. Ejecute el Setup como administrador, sin separar el `.exe` de sus `.bin`. La PR #23 probó el rollback integral de su propio paquete; repita la comprobación con esta compilación antes de usarla en el servidor operativo.
3. Compruebe inicio de sesión, actualización de una sesión con F5 sin destello del login, Salón, Órdenes, Inventario, editor de mapa y Opciones en teléfono, tablet y monitor. Revise Compacto, Normal y Grande; mesas históricas fuera del plano; distribución Auto con muchas mesas; y los controles de 320 px.
4. Desde Opciones, cambie una preferencia y use **Reiniciar Restaurante**. Compruebe que vuelve la conexión, que la preferencia persiste y que los datos de control no cambian. Reinicie Windows y repita `/api/salud`, sesión y dato de control.

## Volver atrás

- **Método preferido en pruebas:** restaure la instantánea completa de la máquina virtual. Devuelve programa, SQLite, configuración, tareas programadas y estado del sistema al mismo punto.
- **Si la actualización falla durante Setup:** el instalador intenta restaurar automáticamente el respaldo previo. Verifique programa, dato de control, tarea `Restaurante POS` y salud tras reiniciar. La secuencia integral pasó en la PR #23 y aún debe repetirse con este paquete en una máquina descartable; el script de esta compilación ya se verificó por separado con una migración fallida y comparación de hashes.
- **Si decide revertir después de una instalación exitosa:** detenga la actividad de prueba. Con una consola PowerShell **elevada** en la máquina de prueba, ejecute el comando siguiente. El script exige un punto de recuperación activo y detiene la tarea antes de restaurar programa y SQLite. Use la ruta de instalación real si fue diferente. Los cambios hechos en la versión nueva después del respaldo se perderán al restaurar SQLite; conserve primero una copia si necesita examinarlos. Después compruebe salud y dato de control. Si el script falla, conserve la instantánea, los respaldos y los registros para diagnosticar; no repita el Setup sobre ese estado.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\Program Files\Restaurante\installer\rollback-update.ps1' -InstallDir 'C:\Program Files\Restaurante' -DataDir 'C:\ProgramData\Restaurante'
```

El ZIP de código anterior no sustituye un respaldo de la instalación ni contiene datos. La construcción y las comprobaciones locales no demuestran por sí solas el reinicio desde la tarea programada de la nueva versión o la recuperación integral dentro de Inno Setup. Esos puntos, y la prueba física de iPhone, permanecen en `docs/PRUEBAS_PENDIENTES_WINDOWS.md`.
