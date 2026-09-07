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
| 2 | `Complementos.tsx` | 12 | 3 | **(Archivo retirado: ya no existe en `ui/src/pantallas/`.)** |
| 3 | `VistaPreviaComanda.tsx` | 32 | 5 | **Hecho** (2026-09-06). Dialog/Button; familia `ticket-preview` en una generación, tokenizada (`--paper`). |
| 4 | `ConfirmarCierreCuenta.tsx` | 35 | 6 | **Hecho.** Dialog/Button, sin clases heredadas (igual que `ConfirmarCancelarCuenta.tsx`, posterior a esta tabla). |
| 5 | `Backend.tsx` | 56 | 9 | **Hecho** (2026-09-06). Card/Button; borradas `.backend-odoo__atajos .tactil` (muerta: el JSX usa `.backend-atajo`) y las generaciones pisadas; familia en una definición por token. |
| 6 | `PrecuentaEnPantalla.tsx` | 56 | 9 | **Hecho** (2026-09-06). Dialog/Button; familia `ticket-papel` única y tokenizada (`--paper`, discontinuas con `color-mix`). |
| 7 | `ComandaEnPantalla.tsx` | 57 | 10 | **Hecho** (2026-09-06). Misma familia `ticket-papel` que la fila 6. |
| 8 | `ModalOrdenesCuenta.tsx` | 61 | 9 | **Hecho** (2026-09-06). Dialog/Button; `ordenes-cuenta-modal` en una generación, bordes por token. |
| 9 | `Categorias.tsx` | 70 | 9 | **Hecho** (2026-09-06). Dos generaciones de `categorias-lista` fusionadas en una (grid + tarjetas por token). |
| 10 | `PinPad.tsx` | 79 | 6 | **Hecho** (2026-09-06). Familia `pin-*` única; `pin-error` con `--destructive`. |
| 11 | `ModalCrearProducto.tsx` | 83 | 8 | **Hecho.** Dialog/Button, sin clases heredadas. |
| 12 | `Recetas.tsx` | 116 | 8 | Pendiente |
| 13 | `ModalArmadoPlato.tsx` | 175 | 14 | Pendiente |
| 14 | `CuentaMesa.tsx` | 177 | 19 | Pendiente |
| 15 | `CrearProducto.tsx` | 180 | 14 | Pendiente. Ya usa Checkbox/Switch con envoltorio `.settings-switch`; falta la familia `form-odoo`. |
| 16 | `Pedidos.tsx` | 202 | 27 | Pendiente |
| 17 | `Pedido.tsx` | 207 | 21 | **(Archivo retirado: absorbido por `Pedidos.tsx`.)** |
| 18 | `Barra.tsx` | 208 | 24 | Pendiente. JSX rehecho en la ronda de limpieza (2026-09-06); la familia `pos-nav` perdió sus generaciones muertas pero sigue apilada. |
| 19 | `Inventario.tsx` | 239 | 21 | Pendiente |
| 20 | `Opciones.tsx` | 262 | 55 | Pendiente. `switch.tsx` ya existe y se usa (12 controles `role="switch"`); quedan las familias `settings-*` y los checkboxes del selector de roles. |
| 21 | `Kds.tsx` | 273 | 26 | **Hecho.** `.cocina-tarjeta` consolidada; etapas, espera e incidencias por token. Sin hex cableados. |
| 22 | `Contornos.tsx` | 275 | 18 | Pendiente |
| 23 | `Plano.tsx` | 319 | 22 | **Hecho.** `.mesa-odoo` y `.plano-mapa` consolidadas (33 reglas → 2). Estado por token. Corregido el bug del radio en móvil. |
| 24 | `ModalEditarOrden.tsx` | 322 | 8 | Pendiente |
| 25 | `ConstructorOrden.tsx` | 385 | 30 | **Hecho.** Familia `carta` consolidada (23 reglas → 10). Píldora de cantidad ya no tapa el precio. |
| 26 | `EditarMapa.tsx` | 490 | 22 | Pendiente. La más grande: dejar para el final. |

Las columnas «Líneas» y «Clases» son de la auditoría inicial (2026-09-05) y quedan referenciales: los archivos cambiaron desde entonces.

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

## 8 bis. Restos del diseño anterior que sí se veían (corregido)

No todo lo que "no se ve moderno" es una pantalla sin migrar: había restos visuales del diseño viejo pisando el sistema "Turno" en zonas que ya se habían migrado. Encontrados verificando `getComputedStyle` sobre el CSS compilado real (mismo método de la sección 2):

- **Halo verde en el botón principal.** El `Button` con variante `default` (fondo negro correcto) tenía un `box-shadow` heredado en verde marca (`rgb(8 125 104)`) tanto en reposo como en `:hover`, más un `background:#066d5b` en hover que por suerte la capa `utilities` de Tailwind neutraliza — pero la sombra no tenía competencia y sí se pintaba. Aparecía en cualquier botón con `className="primario"` (Enviar orden, Nueva orden, Cerrar cuenta, Confirmar armado). Se sacó el `className="primario"` de esos cinco botones (es redundante: la variante `default` ya pinta negro) y se le sacó el `box-shadow` verde a la regla `button.primario, button.is-on, button[data-variant="default"]` en `styles.css`.
- **La pestaña activa de la barra de navegación era invisible.** `Barra.tsx` marcaba la vista activa agregando la clase `is-on` a un `Button` con `variant="ghost"`. Pero `ghost` ya trae `bg-transparent` como utilidad de Tailwind (capa `utilities`), y esa gana siempre contra cualquier regla de `.pos-nav__item.is-on` en `styles.css` (capa `components`) sin importar cuántas clases combine el selector. Resultado: Mesas/Órdenes/Cocina/Inventario y el toggle Mesero/Cocina no mostraban ninguna diferencia visual entre activo e inactivo. Arreglado usando el mismo patrón que ya usan los filtros de categoría en `ConstructorOrden.tsx`: `variant={activo ? "secondary" : "ghost"}` en vez de pelear con una clase de `components` contra una utilidad. **Lección para el resto de la migración: un estado "seleccionado/activo" en un componente shadcn se resuelve cambiando la prop `variant`, nunca agregando una clase CSS propia que intente pisar la utilidad del variante base — pierde siempre.**
- **El fondo de toda la app tenía un degradado verde.** `.pos-odoo` (el contenedor raíz, detrás de cada pantalla) pintaba dos `radial-gradient` en verde menta de la marca vieja, encima de `var(--background)`. Se dejó solo `background: var(--background)` (fondo plano, como pide la dirección "Turno"). También se sacó el tinte verde de la sombra de `.pos-nav` (`rgb(29 66 55 / …)` → `var(--shadow-lifted)` / gris neutro), en escritorio y en la variante móvil.

Los cinco archivos tocados: `styles.css`, `Barra.tsx`, `ConstructorOrden.tsx`, `CuentaMesa.tsx`, `ModalArmadoPlato.tsx`, `Plano.tsx`. Verificado con `tsc --noEmit`, `vite build` y los tests de `barra-ui`, `plano-ui`, `cuenta-mesa-ui`, `armado-plato-ui`, `login-ui`, `pinpad-ui` (todos verdes). Sigue habiendo más casos de `.algo.is-on` en `EditarMapa.tsx`, `Opciones.tsx` y el propio `ConstructorOrden.tsx` (mesas, pisos, contornos, filtros) que no pasan por `Button` — a esos no les toca este bug porque no son botones shadcn, pero vale revisarlos con el mismo método si se ven "planos" al migrar esas pantallas.

## 8. Pendientes conocidos

- **Colores cableados en el CSS heredado: cerrados (2026-09-06).** 0 hex fuera de `:root` en
  `styles.css`: los 96 sueltos que quedaban migraron a tokens (`--destructive` y compañía para
  estados, `color-mix` para bordes suaves) o se borraron porque eran declaraciones oscuras ya
  pisadas por la generación consolidada (panel, modales, `.tarjeta`, pisos). Se agregó un token:
  `--paper` (crema cálida de tickets y comprobantes; superficie, no estado). En los `.tsx` solo
  quedan hex que son *datos* (colores de producto/mapa guardados en la base), no estilos.
- **`switch.tsx`: hecho (2026-09-06).** Patrón de la casa como `checkbox.tsx` (input nativo +
  `role="switch"` + utilidades, sin Radix). Opciones lo usa en sus 12 interruptores; el CSS ad hoc
  `switch-tablet` se retiró (`.settings-switch` lo reemplaza; `switch-compacto` queda solo como
  etiqueta de texto compacto).
- **`--paper` no se ve en los modales de ticket (pendiente).** El token está aplicado en
  `.ticket-papel`/`.ticket-preview__cuerpo` (capa `components`), pero esos elementos llevan también
  `bg-card` como utilidad de Tailwind (capa `utilities`), y la utilidad gana: el ticket de precuenta
  y la comanda en modal se pintan blancos. Es idéntico al caso de la §8 bis (utilities siempre le
  gana a components); se verá al migrar esas pantallas — quitar `bg-card` del JSX o subir la familia
  de papel, nunca agregar `!important`.
- **Copia de seguridad** del estado previo al rediseño en `ui/_backup_pre_turno/` — borrar cuando ya no haga falta.
- La carpeta `tmp/shot/` son artefactos de captura para revisar el diseño; no forma parte de la app.

## 9. 3.5 — consolidación de deudas introducidas en la fase 3 (2026-09-05)

La fase 3 (marca, carta, semáforo, cocina operable) dejó el patrón viejo otra vez: 27 reglas sueltas
al final del archivo, fuera de `@layer components` — incluidas las 4 de la fase 1. Estado corregido:

- **0 reglas fuera de capa.** Todo lo de la fase 3.3/3.4 vive dentro de `@layer components` junto a
  su familia: franja de espera y chip en la familia `.cocina-tarjeta`, `.mesa-odoo--atrasada` y
  `.mesa-odoo__atraso` en la familia de mesa, `.cocina-entregadas` en cocina.
- **Estado activo de botones shadcn por variante, no por clase** (lección de la §8 bis aplicada):
  "Comenzar" usa la variante nueva `brand` (cobre `--brand`), "Listo" la `success`, y el filtro
  "atrasadas" activo la `destructive`. Se borraron `.cocina-accion` (colores) y
  `.cocina-accion-icono.is-start/.is-ready` (sin usuarios).
- **Muertas borradas:** las 4 definiciones de `.modal-fondo` (sin usuarios desde la migración a
  Radix de la fase 2.2) y las 5 de `.salon-odoo__metricas` (los `> div` apuntaban a nada desde que
  el resumen pasó a Button; el layout ahora son utilidades `flex flex-wrap gap-2` en el JSX).
  `styles.css`: 4.637 → 4.500 líneas.
- El texto de espera visible usa `textoEspera()` de `src/modules/tiempo.ts` (días/horas/minutos).
- Pendientes que siguen (actualizado 2026-09-06): `switch.tsx` y los hex sueltos quedaron
  cerrados; los estados de mesa están en una sola generación. De la tabla §5 siguen pendientes
  las pantallas grandes (Opciones, Inventario, EditarMapa, CuentaMesa, Pedidos, Contornos,
  CrearProducto, Recetas, ModalArmadoPlato, ModalEditarOrden) y la familia `pos-nav` de Barra.
