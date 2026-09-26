# Pruebas pendientes del instalador Windows

Estado al 26 de septiembre de 2026. Esta lista distingue la evidencia obtenida en este Windows de los límites que todavía quedan. El historial está en [la revisión de instalación](REVISION_INSTALACION_STACK_2026-09-25.md).

## Comprobado en este equipo

- Instalación desde cero, actualización repetida con datos y desinstalación seguida de reinstalación. La categoría de control conservó el ID 9.
- Arranque después de reiniciar Windows, reinicio desde Opciones y recuperación del servidor tras cancelar una actualización por un archivo ocupado por McAfee.
- Salud de Go y botones de Mesa 1, Nueva orden e Inventario por `localhost` y por la IP del propio servidor en pestañas nuevas del navegador integrado.
- Arranque automático de `pass15` tras el reinicio del 26 de septiembre: Windows arrancó a las 12:14:57 y el registro del servidor muestra inicio a las 12:15:14 (UTC−03). El proceso `restaurante.exe` escucha en 8080 en sesión 0; `/api/salud` responde correctamente. SQLite pasó `integrity_check`, conservó el marcador ID 9 y los 139 registros completos de `productos` coinciden con la instantánea anterior al reinicio. El ejecutable y el HTML coinciden con el paquete compilado. La consulta administrativa de la tarea sigue requiriendo elevación; no se interpreta «Access is denied» como ausencia de la tarea.
- Con el paquete instalado `pass15`, una sesión nueva del navegador integrado abrió Mesa 1, Nueva orden e Inventario desde `http://localhost:8080` y `http://192.168.1.85:8080`. Mesa 1 abrió el borrador con 81 productos; Nueva orden mostró el selector de destino; Inventario cargó 82 materiales. No se envió ningún pedido ni se modificó un producto.
- Creación y retirada de la regla opcional de firewall para `restaurante.exe`, TCP 8080, `LocalSubnet` y perfil Privado. El respaldo SQLite real pasó `PRAGMA integrity_check`.
- Restauración aislada de archivos y SQLite y, posteriormente, **restauración integral dentro de Inno Setup** con archivos y migración de prueba. Se forzó un fallo tras validar la versión nueva y otro después de arrancarla.

Tras el cambio del instalador pasaron `npm test` (**520/520 en 86 archivos**), `npm run test:go` y `npm run build:windows` (incluye TypeScript, Vite, Go e Inno Setup 6.7.3). El servidor instalado respondió `{"ok":true,"runtime":"go"}` en `127.0.0.1:8080/api/salud`.

## Falta comprobar

| Prueba | Motivo y alcance | Evidencia necesaria |
| --- | --- | --- |
| Clics con ratón en Edge con `pass15` | El control automatizado de Edge se detuvo porque no pudo verificar la URL activa. Los clics del navegador integrado ya pasaron en este Windows con `localhost` y la IP actual; todavía no son una prueba del navegador Edge. | En este Windows, abrir una pestaña nueva por `localhost:8080` y otra por `192.168.1.85:8080`; comprobar con ratón Mesa 1, Nueva orden, Órdenes e Inventario sin enviar pedidos reales. |
| Navegador y acceso desde otro equipo | Luis excluyó de esta revisión local el Windows de la captura y la prueba desde un segundo dispositivo. La IP `192.168.1.85` se probó desde el propio servidor; ello no demuestra que el firewall o la red permitan conexiones entrantes. | En una red de confianza: IP actual del servidor, perfil de red, regla aplicable, navegador y versión, inicio de sesión, Mesa 1, Nueva orden, Órdenes e Inventario desde otro dispositivo. Comprobar también tras un reinicio y un cambio de IP o una reserva DHCP. |
| Plataformas y entrega | macOS no está disponible en este Windows. Tampoco se verificó un Windows 10 limpio ni se firmó el paquete. | Pruebas de instalación y operación en los sistemas objetivo y firma del ejecutable antes de distribuirlo. |

## Evidencia de recuperación en este Windows

Luis confirmó que **los productos son reales**; cantidades, recetas y pedidos de esta instalación son de prueba. Antes de ejecutar los Setups, se copiaron fuera de `ProgramData` los 83 archivos de un respaldo previo y todos coincidieron por SHA-256. Una instantánea consistente de SQLite pasó `PRAGMA integrity_check` y conservó el dato de control ID 9. Las seis instantáneas antes y después de los ensayos tuvieron el mismo SHA-256; el valor y los archivos con productos reales quedaron solo en `%USERPROFILE%\Documents\Restaurante-rollback-preflight-20260926` de este equipo, junto a `sha256-evidencia.json`.

| Ensayo | Salida de Setup | Resultado comprobado |
| --- | --- | --- |
| Fallo forzado después de copiar, aplicar la migración `030_rollback_probe.sql` y validar Go | 0: se descubrió que Inno no señalaba la excepción posterior a la instalación | Restauró ejecutable, HTML y SQLite; quitó la migración; salud Go correcta. La instantánea SQLite posterior tuvo el mismo SHA-256 inicial. |
| Mismo fallo con `GetCustomSetupExitCode` | **20** | Restauración y hashes iguales; el fallo ahora llega al llamador. |
| Fallo forzado después de arrancar el nuevo servidor, en la confirmación `install-success.marker` | **20** | La tarea se detuvo y recuperó, desapareció la migración de prueba, salud correcta e instantánea SQLite con el mismo SHA-256. Se simuló la condición tras una escritura exitosa del marcador; no se provocó un fallo real del sistema de archivos. |
| Actualización normal `pass15` desde el código corregido | **0** | Validación 0, tarea y servidor disponibles 1, marcador `ok`, sin migración de prueba y SQLite con el mismo SHA-256. |

Los registros `probe-setup.log`, `probe-r2-setup.log`, `probe-marker-r3-setup.log` y `pass15-setup.log` están en la carpeta externa citada. Los paquetes de fallo controlado, sus `.bin`, scripts de prueba y sumas SHA-256 también se conservaron allí. El código **21** previsto para una restauración que también falle no se provocó sobre esta instalación para evitar dejar los productos reales sin servicio. Rechazos anteriores del ejecutor quedaron registrados en la revisión histórica; en esta sesión la preparación y los ensayos sí se ejecutaron, sin que el rechazo anterior tenga una causa identificada.

El paquete normal `pass15` sigue siendo de prueba. El reinicio local está comprobado; la prueba de clics en Edge y los requisitos de despliegue aplicables al lugar de instalación siguen pendientes. La integración del código revisado es independiente de la aprobación para distribución operativa.
