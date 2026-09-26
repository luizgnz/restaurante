# Pruebas pendientes del instalador Windows

Estado al 26 de septiembre de 2026. Esta lista distingue las comprobaciones observadas en el Windows de desarrollo de las que aún necesitan evidencia. El historial y los resultados están en [la revisión de instalación](REVISION_INSTALACION_STACK_2026-09-25.md).

## Comprobado en este equipo

- Instalación desde cero, actualización repetida con datos y desinstalación seguida de reinstalación. La categoría de control conservó el ID 9.
- Arranque después de reiniciar Windows, reinicio desde Opciones y recuperación del servidor tras cancelar una actualización por un archivo ocupado por McAfee.
- Salud de Go y botones de Mesa 1, Nueva orden e Inventario por `localhost` y por la IP del propio servidor en pestañas nuevas del navegador integrado.
- Creación y retirada de la regla opcional de firewall para `restaurante.exe`, TCP 8080, `LocalSubnet` y perfil Privado. El respaldo SQLite real pasó `PRAGMA integrity_check`.
- Restauración **aislada** de archivos y SQLite después de una migración fallida. Esta prueba no ejecutó la secuencia de error del instalador Inno Setup.

En la revisión de esta nota se repitieron `npm test` (**520/520 en 86 archivos**), `npm run test:go` y `npm run build`, todos correctos. El servidor instalado respondió `{"ok":true,"runtime":"go"}` en `127.0.0.1:8080/api/salud`. Estas verificaciones no sustituyen las pruebas pendientes de Setup ni modificaron los datos instalados.

## Falta comprobar

| Prueba | Motivo y alcance | Evidencia necesaria |
| --- | --- | --- |
| **Actualización fallida con restauración integral de Inno Setup** | El ejecutor de Codex rechazó antes de iniciar PowerShell la preparación de un Setup de fallo controlado (`blocked by policy`). No se conoce la regla exacta. Es la prueba que falta para autorizar el instalador para operación. | Registro completo de Setup y `install.log`; confirmar que se recuperan la versión anterior, el hash o contenido de SQLite y de la interfaz, el dato de control, la tarea `Restaurante POS` y `/api/salud`, también tras reiniciar Windows. Registrar explícitamente si falla la restauración. |
| Restaurar una **copia temporal** del respaldo real `20260926-015237` | Otro comando de Codex fue rechazado antes de ejecutarse. El respaldo solo se leyó para verificar integridad y el dato ID 9; no se modificó la instalación. | Resultado de `rollback-update.ps1` sobre rutas temporales, hashes antes/después, `restaurante.exe -verify-install` y registro de cualquier error. No usar la base activa como destino de esta prueba. |
| Navegador y acceso desde otro equipo | Luis excluyó de esta revisión local el Windows de la captura y la prueba desde un segundo dispositivo. La IP `192.168.1.85` se probó desde el propio servidor; ello no demuestra que el firewall o la red permitan conexiones entrantes. | En una red de confianza: IP actual del servidor, perfil de red, regla aplicable, navegador y versión, inicio de sesión, Mesa 1, Nueva orden, Órdenes e Inventario desde otro dispositivo. Comprobar también tras un reinicio y un cambio de IP o una reserva DHCP. |
| Plataformas y entrega | macOS no está disponible en este Windows. Tampoco se verificó un Windows 10 limpio ni se firmó el paquete. | Pruebas de instalación y operación en los sistemas objetivo y firma del ejecutable antes de distribuirlo. |

## Cuando Luis pueda ayudar con la prueba manual

1. Avísenos cuando haya una ventana de pruebas en un **equipo descartable o de prueba**, sin datos operativos. Antes de ejecutar nada, prepararemos el paquete de fallo controlado, indicaremos su versión y SHA-256, y revisaremos juntos qué versión sana se instala primero. No ejecutar una prueba de fallo sobre la base del restaurante en uso.
2. Conserve el `.exe` y todos sus `.bin` juntos. Antes del intento, anote la versión instalada, compruebe `/api/salud`, cree un dato de control, confirme un respaldo externo y guarde el registro de Setup. El paquete de prueba debe fallar **después del respaldo** y de sustituir archivos, de modo que se ejercite la restauración del instalador; un error previo no valida ese caso.
3. Después del fallo esperado, compruebe que la versión anterior abre, que el dato sigue allí y que la tarea `Restaurante POS` funciona. Reinicie Windows y repita salud y lectura del dato. Conserve los registros de Setup y `C:\ProgramData\Restaurante\logs`; no comparta contraseñas, PIN ni la base completa por chat.
4. Si la versión anterior, los datos o el arranque no se recuperan, detenga la prueba y conserve respaldo y registros para diagnosticar. No repita actualizaciones sobre ese estado.

La preparación y ejecución de esa prueba manual **todavía no están hechas**. Cuando se disponga del equipo de prueba, Alex entregará los comandos y el paquete específicos de esa sesión. Hasta entonces, el instalador compilado sigue siendo un artefacto de prueba, no una entrega para uso operativo.
