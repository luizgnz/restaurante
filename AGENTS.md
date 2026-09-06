# AGENTS.md

Instrucciones para agentes de código que trabajen en este repositorio.

## El proyecto

Sistema de gestión para restaurantes (POS) que opera en la red local del negocio, con interfaz táctil y responsive. Centraliza salón, órdenes, cocina, inventario y configuración administrativa.

- **Backend:** Node.js >= 22, Hono y better-sqlite3, en `src/`.
- **Frontend:** React 19 + Vite + Tailwind CSS 4 + Radix/shadcn, en `ui/`.
- **Pruebas:** Vitest con happy-dom, en `test/`.
- **Datos:** SQLite local. Nunca commitear archivos `*.sqlite*`.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm start` | Ejecuta la app completa (servidor + UI) |
| `npm run dev` / `npm run dev:ui` | Desarrollo del backend / de la UI |
| `npm test` | Suite de pruebas (`vitest run`) |
| `npm run build` | Chequeo de tipos + build de producción de la UI |
| `npm run licenses` | Verificación de licencias de dependencias |

En macOS la app también se abre con doble clic en `Iniciar Restaurante.command`.

## Estructura

- `src/` — backend (API y lógica de negocio).
- `ui/` — frontend (componentes React, estilos, configuración de Vite).
- `test/` — pruebas con Vitest.
- `docs/` — auditorías, manual de usuario y especificaciones; `docs/superpowers/` contiene planes y specs de diseño por fecha.
- `capturas/` y `screenshots/` — capturas de la interfaz, organizadas en carpetas por fecha y commit corto (ver `manifest.json` dentro de cada carpeta).
- `scripts/` — utilidades (verificación de licencias, smoke de migraciones).

## Convenciones

- Español para documentación, commits y comunicación.
- Commits en minúsculas, sin punto final, con prefijo de tipo: `docs:`, `feat:`, `fix:`, `chore:` (mirar `git log` como referencia).
- Rama de trabajo: `prototype/ui-responsive`. Los PRs se dirigen a `feat/nucleo-pos-v1`.
- No commitear: `node_modules/`, builds (`ui/dist*`), bases de datos, `capturas/*.zip`, ni carpetas de trabajo local (`tmp/`, `output/`, `backups/`).

## Antes de dar un trabajo por terminado

- `npm test` en verde y `npm run build` sin errores de tipos.
- Actualizar `TAREAS.md` si el trabajo cierra pendientes o genera nuevos.
