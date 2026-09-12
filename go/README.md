# Backend compilado en Go

Este directorio contiene el runtime de producción de Restaurante. React se
mantiene en `ui/`; Go sirve la interfaz, la API y la misma base SQLite local.

## Estado

El ejecutable abre `salon.sqlite`, aplica las migraciones SQL, inicializa una
instalación nueva y conserva las contraseñas Argon2id existentes. Implementa
sesiones y permisos, configuración, salón, carta, inventario, cuentas,
órdenes y correcciones, Cocina, incidencias, entrega/retiro, precuenta,
cancelación, impresión, jornadas, respaldo y reinicio demo.

La interfaz React consume exclusivamente el contrato nuevo de cuentas y
órdenes. Los adaptadores históricos bajo `/api/pedidos` permanecen solo en el
backend Node de referencia y no forman parte del servidor Go de producción.

## Prueba de la base

```sh
npm run test:go
npm run build
npm start
```

Los datos permanecen en la ruta local habitual. Puede cambiarse con
`RESTAURANTE_DATA_DIR` o con `-data-dir`.
