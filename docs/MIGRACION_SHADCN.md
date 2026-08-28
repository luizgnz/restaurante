# Migración al sistema de diseño — estado de tareas

Este documento existe para que cualquier asistente de IA (ChatGPT u otro) pueda continuar esta migración sin contexto previo, usando solo este archivo y el repositorio en `/Users/luisgonzalez/Documents/Restaurante`.

## 1. Objetivo

Las 25 pantallas de `ui/src/pantallas/*.tsx` dependían de ~500 clases CSS escritas a mano. La migración consiste en reescribir cada pantalla para que use los componentes de `ui/src/components/ui/` y las utilidades de Tailwind, y luego borrar del `styles.css` las reglas que quedaron sin uso.

## 2. Lo más importante que hay que entender antes de tocar nada

**En Tailwind v4, una regla CSS SIN capa le gana a cualquier regla CON capa, sin importar la especificidad.** Las utilidades de Tailwind viven en `@layer utilities`. Mientras las ~4.000 líneas de CSS heredado estuvieron sueltas (sin capa), le ganaban a todas las clases de Tailwind: `bg-primary` perdía contra `button { background:#3a3a3a }`.

Esa era la razón real de que migrar pantallas no cambiara nada visualmente. No era el marcado ni los componentes: era el orden de capas.

**Ya está resuelto:** todo el CSS heredado quedó envuelto en `@layer components { ... }` al final de `ui/src/styles.css`. `components` va antes que `utilities`, así que ahora las utilidades ganan. Reglas para no romperlo:

- No sacar CSS fuera de ese `@layer components`. Si se agrega CSS nuevo suelto, vuelve a ganarle a todo Tailwind.
- Las excepciones que SÍ van fuera de la capa, al principio del archivo: `@import`, `@custom-variant`, `@font-face`, `:root`, el `@media (pointer: coarse)` y `@theme inline`.
- Los `!important` heredados (19) siguen ganándole a las utilidades. Si una utilidad no aplica, buscar un `!important` antes de pelear con la especificidad.

## 2 bis. El patrón que cambia el método (descubierto migrando Salón/Carta/Cocina)

El CSS no está sucio: está **apilado**. La misma clase se redefinió una y otra vez sin borrar la anterior. Medido:

- **134 clases** están definidas más de una vez, con **354 definiciones redundantes**.
- `.mesa-odoo` tenía 4 generaciones (29 reglas), `.plano-mapa` 4, `.carta__item` 5, `.cocina-tarjeta` 4.
- Solo gana la última; las anteriores son ruido que hace imposible predecir qué pasa al cambiar un color.

**Consecuencia para el plan:** migrar el JSX pantalla por pantalla no arregla esto. El trabajo real es
**consolidar cada familia de clases en una sola definición basada en tokens**. En las tres pantallas hechas,
el JSX casi no se tocó — todo el cambio visual salió de consolidar el CSS.

### Cómo consolidar una familia (procedimiento probado)

1. Volcar todas las definiciones de nivel superior de la clase y sus variantes.
2. Escribir **una** definición nueva que use tokens (`--success`, `--warning`, `--info`, `--destructive`, `--radius`, `--control-h`).
3. Borrar las viejas. **Cuidado con los selectores compartidos:** si la regla es
   `.cocina-tarjeta, .recipes-editor, .settings-nav { }`, no borrar la regla — quitar solo el selector que se migra.
4. Compilar, correr los tests de UI y mirar la pantalla renderizada antes de dar por buena la consolidación.

### No confiar en un merge automático

Un script que fusione definiciones parece atractivo y es peligroso: en `.constructor-orden__cabecera` (12
definiciones) se mezclan reglas de contenedor con reglas de título, y el resultado fusionado es incoherente.
Además, si entre dos generaciones hay una regla de igual especificidad que toca la misma propiedad, mover la
definición cambia el resultado. Consolidar a mano, familia por familia.

### Bugs reales que aparecieron al consolidar

- `border-radius: 0.95rem !important` en el `@media` móvil pisaba a `.mesa-odoo--round`: **las mesas redondas
  salían cuadradas en pantalla chica**.
- `.carta__cantidad` (la píldora de −/+) flota en `position: absolute` sobre la tarjeta y **tapaba el nombre y
  el precio**. Resuelto reservando el hueco con `.carta__item:has(.carta__cantidad) .carta__contenido`.
- Un selector partido por siete líneas en blanco (`.cocina-tarjeta,` … `.settings-nav {`), resto de una edición
  a medias.
- Restos de temas anteriores invisibles porque los pisaba la última generación: un morado `#714b67` de Odoo en
  la tarjeta seleccionada de la carta, y un juego completo de `.espera-*` con colores de tema oscuro.

### Regresión semántica al cambiar `--primary` a negro

Siete reglas usaban `--primary` para decir "correcto" o "activo" — funcionaban por accidente cuando era verde.
Al pasar a negro perdieron el significado y hubo que repuntarlas a `--success`. **Antes de cambiar un token,
buscar sus usos y preguntarse si cada uno quiere decir "acción" o "estado".**

## 3. El sistema visual: dirección "Turno"

Definido en el bloque `:root` de `ui/src/styles.css`. **Es la única fuente de verdad del aspecto.** Antes había tres bloques `:root` pisándose entre sí; ahora hay uno solo, y agregar otro rompe todo en silencio.

Ideas que sostienen la dirección, para no contradecirlas al migrar:

- **El negro es el color de acción** (`--primary: #17191d`). Así el verde, el ámbar y el rojo quedan libres para significar estado. Antes el verde de marca competía con el verde de "mesa libre" y ninguno comunicaba.
- **El color siempre significa algo.** `--success` / `--warning` / `--destructive` (y sus variantes `-soft` para fondos) son para estado, nunca decoración.
- **La jerarquía la hace el borde y el contraste, no la sombra.** Sombras casi nulas.
- **Densidad con altura táctil segura.** `--control-h` vale 40 px con puntero y 46 px con dedo (`@media (pointer: coarse)`). No cablear alturas: usar `h-[var(--control-h)]`.
- **Tipografía:** Archivo variable, servida desde `ui/src/fonts/archivo-latin.woff2`. Se sirve desde el proyecto a propósito: el local puede quedarse sin internet y la app tiene que verse igual. No agregar enlaces a Google Fonts.

## 4. Componentes en `ui/src/components/ui/`

Todos alineados a la dirección "Turno": `rounded-lg` (10 px), altura por token, peso 500–600, sin sombra, foco con anillo de 2 px.

| Componente | Estado |
|---|---|
| `button.tsx` | Hecho. Variantes default (negro) / secondary / outline / ghost / destructive / success. Tamaños default / sm / lg / icon. |
| `input.tsx` | Hecho. Lleva `h-` y `min-h-` con el token (el CSS heredado impone `min-height:42px` y sin `min-h-` gana él). |
| `label.tsx` | Hecho. |
| `card.tsx` | Hecho. Sin sombra, radio 10 px. |
| `badge.tsx` | Hecho. Variantes de estado: success / warning / danger. |
| `select.tsx` | Hecho. |
| `textarea.tsx` | Hecho. |
| `checkbox.tsx` | Hecho. |
| `dialog.tsx` | Hecho. Overlay + contenido, sin librería externa. |
| `switch.tsx` | Pendiente. Lo necesita `Opciones.tsx` (hoy usa una clase `.toggle` a mano). |
| `table.tsx` | Pendiente. Evaluar si vale la pena para Inventario / Recetas / Pedidos. |

**El CLI de shadcn no funciona en este entorno:** `ui.shadcn.com` está bloqueado por el allowlist de red (403, `X-Proxy-Error: blocked-by-allowlist`). Hay que escribir los componentes a mano, imitando el estilo de los que ya están.

## 5. Pantallas — estado

Orden sugerido: de menor a mayor complejidad, para validar el patrón antes de las pantallas grandes.

| # | Archivo | Líneas | Clases | Estado |
|---|---|---|---|---|
| 1 | `Login.tsx` | 71 | 0 | **Hecho.** Usa Button/Card/Input/Label. Sin clases heredadas. |
| 2 | `Complementos.tsx` | 12 | 3 | Pendiente |
| 3 | `VistaPreviaComanda.tsx` | 32 | 5 | Pendiente |
| 4 | `ConfirmarCierreCuenta.tsx` | 35 | 6 | Pendiente |
| 5 | `Backend.tsx` | 56 | 9 | Pendiente |
| 6 | `PrecuentaEnPantalla.tsx` | 56 | 9 | Pendiente |
| 7 | `ComandaEnPantalla.tsx` | 57 | 10 | Pendiente |
| 8 | `ModalOrdenesCuenta.tsx` | 61 | 9 | Pendiente |
| 9 | `Categorias.tsx` | 70 | 9 | Pendiente |
| 10 | `PinPad.tsx` | 79 | 6 | Pendiente |
| 11 | `ModalCrearProducto.tsx` | 83 | 8 | Pendiente |
| 12 | `Recetas.tsx` | 116 | 8 | Pendiente |
| 13 | `ModalArmadoPlato.tsx` | 175 | 14 | Pendiente |
| 14 | `CuentaMesa.tsx` | 177 | 19 | Pendiente |
| 15 | `CrearProducto.tsx` | 180 | 14 | Pendiente |
| 16 | `Pedidos.tsx` | 202 | 27 | Pendiente |
| 17 | `Pedido.tsx` | 207 | 21 | Pendiente |
| 18 | `Barra.tsx` | 208 | 24 | Pendiente |
| 19 | `Inventario.tsx` | 239 | 21 | Pendiente |
| 20 | `Opciones.tsx` | 262 | 55 | Pendiente. Necesita `switch.tsx`. |
| 21 | `Kds.tsx` | 273 | 26 | **Hecho.** `.cocina-tarjeta` consolidada; etapas, espera e incidencias por token. Sin hex cableados. |
| 22 | `Contornos.tsx` | 275 | 18 | Pendiente |
| 23 | `Plano.tsx` | 319 | 22 | **Hecho.** `.mesa-odoo` y `.plano-mapa` consolidadas (33 reglas → 2). Estado por token. Corregido el bug del radio en móvil. |
| 24 | `ModalEditarOrden.tsx` | 322 | 8 | Pendiente |
| 25 | `ConstructorOrden.tsx` | 385 | 30 | **Hecho.** Familia `carta` consolidada (23 reglas → 10). Píldora de cantidad ya no tapa el precio. |
| 26 | `EditarMapa.tsx` | 490 | 22 | Pendiente. La más grande: dejar para el final. |

## 6. Metodología para cada pantalla

1. Leer el `.tsx` completo y listar las clases CSS heredadas que usa.
2. Reescribir el JSX con los componentes de `ui/src/components/ui/` y utilidades de Tailwind, conservando exactamente el comportamiento (props, estados, handlers).
3. **Antes de borrar cualquier regla de `styles.css`, verificar que nadie más la use:**
   ```
   grep -rn "nombre-clase" ui/src/pantallas/*.tsx ui/src/App.tsx
   ```
   Varias clases con nombre "de una pantalla" son en realidad utilidades compartidas. `login-odoo__ayuda`, por ejemplo, se usa en 12 pantallas distintas; borrarla al migrar Login habría roto las otras once. Si aparece en un archivo no migrado, no borrarla todavía.
4. **Revisar el test de esa pantalla.** Varios tests afirman nombres de clases CSS heredadas, así que fallan al migrar. Eso es correcto: hay que cambiar la afirmación por uno de comportamiento (un `name=`, un texto visible, un `role=`), no borrar el test ni restaurar la clase. Los que todavía dependen de nombres de clases: `modulo-restaurante-ui` (3), `plano-ui`, `comanda-pantalla-ui`, `barra-ui`.
5. Correr `npx tsc -p tsconfig.json --noEmit`, `npx vite build --config ui/vite.config.ts` y los tests de UI.
6. Actualizar la tabla de la sección 5.

## 7. Comandos

```bash
cd /Users/luisgonzalez/Documents/Restaurante
npx tsc -p tsconfig.json --noEmit          # tipos
npx vite build --config ui/vite.config.ts  # build de la UI
npx vitest run test/<pantalla>-ui.test.ts  # test de una pantalla
npm start                                  # levantar la app (admin / admin)
```

## 8. Pendientes conocidos

- **Colores cableados en el CSS heredado.** Quedan ~179 valores hex sueltos (`#714b67` morado de Odoo, `#67500f`, `#fff8dc`, etc.) que no responden a los tokens. Se van yendo a medida que cada pantalla se migra; conviene no cazarlos sueltos.
- **`switch.tsx`** para `Opciones.tsx`.
- **Copia de seguridad** del estado previo al rediseño en `ui/_backup_pre_turno/` — borrar cuando ya no haga falta.
- La carpeta `tmp/shot/` son artefactos de captura para revisar el diseño; no forma parte de la app.
