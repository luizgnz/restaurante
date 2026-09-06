# Marca — Turno (sistema) y La Olla de Casa (local)

Dos marcas, un mismo lenguaje visual. El sistema se llama **Turno**; el restaurante de la
demostración es **La Olla de Casa**. Ambas comparten paleta y geometría para que el negocio y
su herramienta se lean como una familia.

---

## Turno — el sistema

**Concepto.** Una campana de servicio: alguien pide, otro atiende, un turno avanza. La
geometría es plana, de trazo grueso y esquinas redondeadas; funciona desde 16 px (favicon)
hasta impresión.

| Archivo | Uso |
|---|---|
| `ui/public/marcas/turno-icono.svg` | Icono principal: campana cobre sobre tile negro |
| `ui/public/marcas/turno-horizontal.svg` | Lockup con wordmark (documentos, README, presentaciones) |
| `ui/public/marcas/turno-mono.svg` | Monocromo `currentColor`, sin tile: recibos e impresos |
| `ui/public/favicon.svg` | Favicon de la pestaña (igual al icono principal) |

## La Olla de Casa — el local de la demo

**Concepto.** Olla con vapor sobre tile negro, wordmark en Fraunces y ceja "COCINA CASERA" en
cobre tinta. Es la marca que ve el usuario al entrar (pantalla de inicio de sesión).

| Archivo | Uso |
|---|---|
| `ui/public/marcas/olla-horizontal.svg` | Login y documentos |
| `ui/public/marcas/olla-icono.svg` | Icono solo (avatares, marcadores) |
| `ui/public/marcas/olla-mono.svg` | Impresos |

> Si el negocio real tiene otro nombre u otro logo, se reemplazan estos tres archivos (o se
> sube el logo real desde Administración cuando exista ese flujo). El sistema Turno no cambia.

---

## Paleta

Tokens definidos en `ui/src/styles.css` — no introducir hex fuera de ellos.

| Token | Valor | Rol |
|---|---|---|
| `--primary` | `#17191d` | Negro de acción: botones, tiles de marca |
| `--brand` | `#8a4a26` | Cobre quemado: acentos, iconos de marca (6.8:1 con blanco) |
| `--brand-tinta` | `#a3572b` | Cobre en tinta: wordmark sobre fondos claros (5:1) |
| `--background` | `#f7f7f8` | Fondo de página |
| `--card` | `#ffffff` | Superficies/tarjetas |
| `--foreground` | `#16181c` | Texto |

Reglas: el negro es el color de acción y el cobre el de marca; verde, ámbar y rojo quedan
reservados para estado (libre, atrasada, anulada) y no compiten con la marca.

## Tipografías

- **Fraunces Variable** (self-hosted, `ui/public/fonts/`): display — nombres, wordmarks,
  título del salón. En los SVG fuera de la app cae a Georgia.
- **Archivo Variable**: texto de interfaz y etiquetas.

## Fotos de carta (demo)

Las fotos de producto viven en la base de datos como data URL (`productos.foto_data`) y la
carta las muestra tal cual. Fuentes de relleno: el seed solo coloca la letra de color al
**crear** un producto; nunca pisa una foto existente (ver `src/modules/productos/seed.ts`).

- Material fuente: `assets/fotos-carta/` + `manifest.json` (licencias y origen de cada foto).
- Carga a la base: `node --import tsx scripts/cargar-fotos-carta.ts` — reescala a 640 px,
  comprime a JPEG ~70 y actualiza `foto_data` por nombre de producto. Idempotente.
