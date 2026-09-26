# Prueba instalada de la PR #24 · 2026-09-26

Luis pidió instalar y probar el paquete en este Windows. Se actualizó primero a `0.1.0-pr24-70025ef` y, tras detectar un desbordamiento adicional, a **`0.1.0-pr24-e8e7c9e`**. Ambas instalaciones terminaron con código 0, validación 0 y servidor disponible 1. La versión final permanece instalada.

## Datos y recuperación

- Antes de instalar se creó una instantánea consistente de SQLite, una copia del programa anterior y otra de `config.json` en `C:\Users\Fermin\Documents\Restaurante-pr24-respaldo-20260926`. La base pasó `integrity_check`: 40 tablas y 139 productos.
- Justo después de la primera actualización, las huellas del contenido de las 40 tablas eran idénticas a las anteriores. Tras todo el recorrido, solo cambiaron `sesiones_pos` y `sesiones_usuario`, por los inicios de sesión. Productos y las otras 38 tablas permanecieron iguales. No se enviaron pedidos.
- Los valores de configuración se compararon al terminar y no cambió ninguna clave. Se probó Grande y se restauró Normal.
- El punto automático `C:\ProgramData\Restaurante\backups\updates\20260926-130523` conserva la versión previa a ambas actualizaciones. Se copió y restauró de forma aislada en `validacion-retorno` dentro del respaldo externo: ejecutable, HTML y SQLite coincidieron por SHA-256, y el ejecutable anterior pasó `-verify-install`. La instalación activa no fue destino de ese ensayo.

## Comportamiento observado

- Inicio de sesión y recarga autenticada vuelven al salón. Las tres pruebas de sesión inicial cubren que el login no se renderiza mientras se consulta la sesión; una captura puntual de navegador por sí sola no demuestra cada fotograma.
- Mesa 1 abrió la carta con 81 productos; Nueva orden mostró el selector de destino. Se abrieron Órdenes en vistas de mesero y cocina, Inventario con 82 materiales, Administración, editor de mapa y Opciones.
- A 1280 px las diez mesas operativas miden aproximadamente 137 × 137 px. A 390 px la marca queda en el encabezado y la barra inferior contiene los controles sin el texto cortado.
- A 320 px Grande, los cuatro filtros de Inventario muestran su texto completo. El editor conserva un lienzo de 560 px dentro de una región desplazable y la página sigue midiendo 320 px.
- La instalación real reveló un caso ausente en el servidor temporal: al estar disponible el reinicio, la ruta `C:\ProgramData\Restaurante\config.json` ensanchaba Opciones a 350 px. Se añadió `overflow-wrap: anywhere` a los códigos de Red local. Tras reinstalar, el documento mide 320 px y la ruta ocupa dos líneas dentro de la tarjeta.
- Reinicio desde Opciones comprobado en ambas compilaciones. En la final, el PID pasó de 4060 a 13376 y cambió `idArranque`; `/api/salud` respondió correctamente. La interfaz pidió iniciar sesión de nuevo, comportamiento anunciado por Opciones. En el primer ensayo se comprobó que Grande persistía tras el reinicio.
- Por `http://192.168.1.85:8080`, desde este mismo Windows, se inició sesión y se abrieron Mesa 1 e Inventario sin errores de consola. Esto no prueba el acceso desde otro dispositivo.

## Verificación y límites

La compilación final pasó TypeScript, Vite, Go e Inno Setup; las seis pruebas focales de Opciones y sesión inicial pasaron. La suite completa de 528 pruebas y Go ya habían pasado antes del ajuste CSS de una línea. El ejecutable y el HTML instalados coinciden con los de la compilación final.

Registros de Setup, instantáneas y huellas están en la carpeta externa de respaldo. Capturas del salón móvil y escritorio están en `output/pr24-instalado` del worktree. No se reinició Windows en este recorrido; queda comprobar el arranque automático de esta compilación exacta después de reiniciar el equipo, así como iPhone físico y acceso desde un segundo dispositivo. El rollback integral de Inno de la PR #23 conserva su evidencia previa; esta sesión validó la actualización normal y la restauración aislada del respaldo real.
