# Arquitectura y calidad — POS restaurante (appliance local)

**Fecha:** 2026-08-19  
**Estado:** listo para revisión del dueño del producto  
**Catálogo de negocio:** `docs/superpowers/specs/2026-08-19-restaurante-funcionalidades-configuraciones.md`  
**Este documento cubre:** cómo se instala, ejecuta, prueba, parcha, **imprime comandas y precuentas en papel**, respalda y se accede de forma remota. **No** redefine mesas ni políticas de inventario.

**Límite de producto (igual que el catálogo):** este sistema no cobra. Precuenta + envío a caja. Un local = un servidor (Windows **o** Mac). Tablets y teléfonos son navegador.

---

## 1. Decisiones cerradas

| Tema | Decisión |
| --- | --- |
| Propiedad | Código cerrado comercial. Sin DRM ni ofuscación pesada. Dependencias MIT/Apache; CI falla si entra GPL/AGPL. |
| Licencia | Archivo firmado **por restaurante**. Validación local. El salón **no se detiene** sin internet. |
| Runtime de sala | Un PC servidor; clientes = navegador (PC, tablet, teléfono). **No Electron.** |
| Lenguaje | TypeScript de punta a punta (servidor Node + UI web). |
| Datos en vivo | SQLite en disco del local (WAL). La nube **no** es la base primaria. |
| Empaquetado Windows | Inno Setup (asistente con marca) + Node portable + WinSW. |
| Empaquetado Mac | **La misma app**; `.pkg` + launchd. Scripts `install.ps1` / `install.sh` para CI y técnicos, no sustituyen el instalador de cara al dueño. |
| Actualizaciones | El **mismo** instalador. Modo silencioso desde el POS **y** asistente (USB / doble clic). |
| Módulos | Monolito modular (un proceso). |
| Plugins v1 | **Ninguno.** UI de complementos con estado vacío. IVA, caja cobradora y apps de comida **no** entran en v1. |
| Dueña fuera del local | **Por defecto:** portal comercial en **nuestra** nube. **Opcional:** acceso directo tipo VPN/túnel (config avanzada; no es el producto). |
| Nube de pago | Extra configurable: respaldo cifrado + portal dueña. Apagado = no sube nada. |
| Impresión en papel | **v1:** comanda (al enviar, reimprimir, anular) **y** precuenta (al emitir y reimprimir). El **servidor** habla con las impresoras. Pueden ser dos equipos o el mismo. KDS y pantalla conviven. |
| Identidad en sala | Login + lock 60 s. **PIN al enviar a cocina, al emitir precuenta y al enviar a caja.** Cargar platos no pide PIN por ítem. |
| Fiscal Chile | Precuenta ≠ boleta SII. DTE (boleta/factura) = **caja, posterior**. |

Enfoque descartado: Electron en el PC (duplica el navegador), base viva en Turso/D1, puerto 8080 abierto a internet, `npm` en el restaurante, Tailscale como oferta comercial por defecto.

---

## 2. Arquitectura

Un restaurante tiene **un** proceso servidor. Los dispositivos no llevan copia operativa de pedidos.

```text
[Navegadores LAN] --HTTP--> [Servicio Node + UI] --SQL--> [salon.sqlite + WAL]
                                    |
                                    +--> [impresora cocina ESC/POS]   ticket de comanda
                                    +--> [impresora sala ESC/POS]     ticket de precuenta
                                    +--> [licencia.json]
                                    +--> [complementos: lista vacía en v1]
                                    |
                    (si extra nube on, hay internet)
                                    +--> [bucket cifrado] --> [portal dueña HTTPS]
[Servidor de updates nuestro] --> [Setup.exe / .pkg firmados]
```

**Componentes**

- **Servicio Node:** API + estáticos de la UI. Módulos internos. Arranque automático al encender (WinSW / launchd), aunque nadie inicie sesión. **También imprime** comandas y precuentas.
- **UI web única:** responsive/táctil. El PC servidor abre Edge/Chrome a `http://127.0.0.1:<puerto>`. Tablets: `http://<ip-lan>:<puerto>`.
- **SQLite:** única verdad del salón (incluye cola de impresión).
- **Impresora de comanda:** ticket de cocina. Red ESC/POS (IP, puerto típico 9100) y/o USB en el PC servidor. Bar = segunda impresora si hay estación bar.
- **Impresora de precuenta:** ticket para el cliente (mismas vías). En un local chico puede ser **el mismo** dispositivo que cocina, con otro formato de ticket.
- **Servidor de paquetes (nuestro):** manifiestos + instaladores firmados. El local no ejecuta `npm`.
- **Portal dueña (nuestro, extra nube):** HTTPS. No sustituye al salón.

**Puerto por defecto:** `8080`, configurable en un archivo de config junto a los datos (no hace falta recompilar). Firewall: entrada **solo redes privadas** (LAN). No hay reenvío de puerto en el router como diseño soportado.

**Un local, una base.** No se opera el mismo salón con un Windows y un Mac a la vez.

### 2.1 Impresión en papel (comanda y precuenta)

Los tickets **salen en papel**. No son un plugin ni un extra de nube. Las tablets no imprimen por su cuenta: el **PC servidor** envía ESC/POS.

**Comanda (cocina)**

1. El mesero pulsa Enviar **y confirma con PIN**.
2. Se confirma la transacción (KDS + inventario según política).
3. El servicio arma el ticket (mesa, mesero, notas, modificadores, curso) y lo manda a la impresora de esa estación.
4. Reimpresión y **ticket de anulación** por la misma vía.

**Precuenta (cliente)**

1. El mesero pulsa emitir precuenta **y confirma con PIN**.
2. Queda el documento-instantánea (sin firmar inventario en el default).
3. El servicio imprime el ticket de consumo (líneas, precios, total, mesa, cubiertos) en la impresora de precuenta.
4. Reimprimir **no** crea asiento de inventario ni número nuevo si el consumo no cambió. Si el consumo cambió, hay que emitir otra (y se imprime esa).

Si una impresora no responde: el hecho de negocio **ya ocurrió** (comanda en KDS / precuenta emitida en pantalla); el job queda en cola, se reintenta, aviso a avanzado. El salón no se bloquea.

**Ejemplo:** mesa 7, 5 hamburguesas + 2 jugos + 3 aguas con gas → PIN al Enviar (ticket cocina con mesa y mesero) → más tarde PIN al emitir precuenta (ticket cliente con las mismas líneas y totales).

Cajón: no aplica.

---

## 3. Datos, corte de luz y respaldo

### 3.1 Ubicación (programa vs datos)

| OS | Programa (se actualiza) | Datos (no se pisan al actualizar) |
| --- | --- | --- |
| Windows | `C:\Program Files\Restaurante\` | `C:\ProgramData\Restaurante\` |
| macOS | `/usr/local/restaurante/` | `/Library/Application Support/Restaurante/` |

Bajo datos:

- `data/salon.sqlite`, `salon.sqlite-wal`, `salon.sqlite-shm`
- `licencia.json`
- `config.json` (puerto, extra nube on/off, acceso directo on/off, URL del servidor de updates)
- `backups/` (snapshots locales)
- `plugins/` (vacío en v1)

El servicio **no** resuelve la base respecto al directorio de trabajo del proceso: usa siempre la ruta de datos del OS.

### 3.2 Creación y migraciones

- **Primera instalación:** si no existe `salon.sqlite`, el instalador copia una **plantilla** generada en el build (esquema = el de los tests).
- **Actualizar / reinstalar:** si el archivo existe, **no se reemplaza**. Al arrancar, el servicio aplica **migraciones** versionadas (tabla `schema_migrations`).
- No se embebe la base en vivo dentro del ejecutable (una SQLite incrustada vive en RAM y se pierde al apagar).

### 3.3 Corte de luz

- Cada acto de negocio (abrir mesa, enviar comanda, emitir precuenta, enviar a caja, ajuste de stock) es **una transacción**.
- `PRAGMA journal_mode=WAL;` y `PRAGMA synchronous=FULL;` (en macOS además `PRAGMA fullfsync=ON`).
- Apagón a mitad de transacción: al volver, SQLite completa o deshace esa transacción; no deja el archivo a medias.
- WinSW / launchd reinician el servicio. Las tablets recargan; no tenían BD propia.
- Snapshots locales: API `backup` / `VACUUM INTO` de SQLite (consistente con el salón abierto), rotación de 7 copias diarias en `backups/`.
- El software no sustituye un SAI ni un disco muerto; el WAL cubre el corte eléctrico del proceso/OS.

### 3.4 Extra de nube (pago, interruptor)

**Apagado (default de instalación):** ningún byte de la BD sale del local.

**Encendido (licencia / flag de extra):**

- Copia **cifrada AES-256-GCM** (clave por local, no en texto claro en el bucket) a un bucket **S3-compatible**. Proveedor por defecto: **Cloudflare R2** (capa free permanente ~10 GB). `config.json` puede apuntar a otro endpoint S3 (B2, MinIO) sin cambiar de producto.
- Sin internet: el salón sigue; las copias se **encolan** y se suben al volver.
- Restaurar: acción explícita de usuario **avanzado** (copia local o nube) → parar servicio → sustituir `salon.sqlite` → arrancar. No hay restore automático silencioso.

La nube es **copia + portal**, no Turso/D1/SQLite Cloud como motor en vivo.

---

## 4. Acceso de la dueña fuera del restaurante

El respaldo **no** es “abrir el POS en casa”. Restaurar la copia en otro PC crearía **otra** base y partiría el salón.

### 4.1 Default — portal comercial (nuestra nube)

- La dueña entra con **cuenta nuestra** (HTTPS), ligada a la licencia de ese local.
- Ve carta, armable/stock, mesas, precuentas, informes: estado de la **última sincronización**.
- El salón sigue siendo el PC local. Si ese PC está apagado, el portal muestra lo último sync y un aviso de **no en vivo**.
- Cambios de dueña (precios, 86, empleados) se **aplican en el local** cuando hay red. El local es quien escribe de verdad; no hay dos salones concurrentes.

El extra de nube **incluye** respaldo cifrado y este portal. Precio modesto de producto; coste de bucket bajo.

### 4.2 Opcional — acceso directo al POS

Configuración avanzada (off por defecto): el local monta **su** VPN o túnel. El navegador de casa usa el mismo HTTP de sala que en la LAN. Tailscale es un ejemplo de herramienta de terceros, no un módulo nuestro.

No es la oferta comercial. No se documenta como “el producto usa Tailscale”. No se abre el puerto del POS a internet público.

---

## 5. Instalación y actualizaciones

### 5.1 Qué ve el dueño (Windows)

`Restaurante-Setup.exe` (Inno Setup, marca, español): bienvenida → carpeta → pegar o elegir archivo de **licencia del local** → instalar.

El Setup **copia de verdad**:

1. `node.exe` (**Node 22 LTS** portable de nodejs.org; no el MSI instalado “para todo el sistema”).
2. `app\` (servidor + UI empaquetados; sin `node_modules` de desarrollo).
3. `RestauranteService.exe` + XML (WinSW).
4. Crea `ProgramData\Restaurante\` y, si no hay BD, la plantilla SQLite.
5. `install` + `start` del servicio (inicio automático).
6. Regla de firewall **solo LAN**.
7. Acceso directo que abre el navegador en `http://127.0.0.1:8080`.

Mac: mismo contenido de `app/`; `.pkg` registra launchd; `install.sh` replica los pasos para CI.

SQLite en runtime: `better-sqlite3` con **prebuilds** para `win32-x64`, `darwin-x64`, `darwin-arm64`. El restaurante no compile nada.

### 5.2 Actualizaciones (mismo Inno / mismo pkg)

- El POS consulta nuestro manifiesto (`versión`, URL, hash, firma) usando la licencia.
- **Silencioso:** avanzado pulsa “Actualizar ahora” → descarga → verifica → Windows: Setup `/SILENT`; Mac: `installer -pkg … -target /` → progreso en la web.
- **Asistente:** el mismo Setup a doble clic o USB (sin internet).
- Mismo `AppId`: un solo programa en “Agregar o quitar programas”.
- Orden: parar servicio → reemplazar programa → no tocar datos → arrancar → migraciones.
- USB: el mismo artefacto firmado.

Nunca `npm install` en el local.

### 5.3 Scripts

`scripts/install.ps1` y `scripts/install.sh`: mismos efectos (copiar, BD si falta, servicio). Uso: desarrollo, CI, técnico. El dueño del restaurante usa Inno/pkg.

---

## 6. Módulos y plugins

### 6.1 Módulos v1 (núcleo)

Un proceso. Carpetas/paquetes internos, tests por carpeta, se encienden/apagan por **config o licencia** donde el catálogo ya lo permite (p. ej. cursos).

| Módulo | Rol |
| --- | --- |
| `salon` | Pisos, mesas, ocupación |
| `pedidos` | Líneas, envíos, cancelaciones |
| `kds` | Comandas, etapas |
| `impresion` | Tickets ESC/POS: comanda y precuenta; cola si falla la impresora |
| `inventario` | Recetas, reserva/firme, armable |
| `empleados` | PIN, derechos, lock, **confirmación de PIN en Enviar / precuenta / caja** |
| `precuenta` | Snapshot, handoff a caja |
| `updates` | Manifiesto, aplicar Inno/pkg |
| `nube` | Interruptor, cola, cifrado, portal (cliente) |
| `complementos` | UI de lista; en v1 siempre vacía |

El catálogo funcional detalla reglas de negocio; este diseño no las duplica.

### 6.2 Plugins en v1

**No se envía ningún plugin.** No hay zips de IVA, caja cobradora ni aggregators.

Pantalla **Complementos**:

- Título de la sección visible.
- Lista vacía.
- Mensaje fijo de estado vacío (las dos frases, en este orden):
  1. **No hay plugins para mostrar**
  2. **No hay plugins disponibles**

No se consulta un catálogo remoto de plugins en v1 (evita ruido y fallos de red en una lista que siempre está vacía).

Cargar zips de plugins, contratos `pedidoEntrante` / `consumoHaciaCaja` / `exportarFiscal` y catálogo remoto de complementos: **fuera de v1** (sección 10).

---

## 7. Seguridad y software propietario

- Entrega: instalador + app empaquetada. El código fuente no se publica.
- Licencia: payload (id de local, extras, caducidad) firmado con clave privada **nuestra**; verificación con pública en la app. Sin internet: operación normal. Tras **30 días** sin poder contrastar caducidad en línea: aviso persistente a avanzado; **el salón no se bloquea** (no se apaga el restaurante por la nube).
- PIN: Argon2id; no texto plano. Lock por inactividad según catálogo. **Enviar a cocina, emitir precuenta y enviar a caja** no se ejecutan sin PIN válido en ese acto (el servidor rechaza la API si no hay prueba de PIN).
- API de sala: no autenticada desde internet; solo LAN (y el túnel opcional si alguien lo activa).
- Portal dueña: HTTPS, sesión, ligado a la licencia.
- SQL parametrizado; sin concatenar input en consultas.
- Secretos de bucket/update: en config del local o variables del servicio, no en el repo público interno de ejemplo.
- Inventario de licencias de npm en CI (`allowedLicenses`).
- Artefactos de release: hash + firma. El cliente rechaza paquetes que no verifiquen.
- Cabeceras HTTP locales: no exponer stack traces al mesero.

---

## 8. Tests y validación

CI **bloquea** el release si falla la batería. Cada módulo nuevo o cambiado trae tests o no se publica.

| Nivel | Obligatorio | Ejemplo |
| --- | --- | --- |
| Unidad | Sí, por módulo | Armable, reserva vs firme, hash de PIN, ESC/POS de comanda y de precuenta, **rechazo de Enviar/Precuenta sin PIN** |
| Impresión | Sí, impresora falsa | Enviar → job comanda; emitir precuenta → job precuenta; fallo → cola; anular enviado → job anulación; reimpresión de precuenta sin nuevo inventario |
| Sistema | Sí | Mesa → envío cocina (**papel comanda**) → precuenta (**papel**) → `en_caja` (sin dinero) |
| Resiliencia | Sí | Abortar proceso a mitad de transacción → WAL coherente |
| Empaque | Sí | Instalar sobre datos existentes no borra `salon.sqlite`; migración desde esquema N−1 |
| Nube | Sí, con extra simulado | Extra off → 0 subidas; extra on → blob cifrado; portal no escribe el salón en vivo |
| UI vacía plugins | Sí | La pantalla Complementos muestra las dos frases de vacío |
| Complementos reales | No en v1 | — |

Herramientas: Vitest (unidad/sistema en proceso) y Playwright (UI táctil mínima: plano + un pedido). Mismo esquema SQLite que la plantilla del instalador.

Optimización: índices en mesa, pedido abierto, stock por ubicación; consultas de armable con receta de un nivel (v1 del catálogo). No hay microservicios ni caché distribuida.

---

## 9. Pantallas (tablet, teléfono, PC)

- Una SPA/PWA servida por el Node local.
- Táctil: blancos de toque grandes, plano de mesas y KDS usables con el pulgar.
- Layout fluido: en ancho estrecho se apila; no hay columnas ilegibles.
- PC servidor: navegador, no shell de escritorio propia.
- Teléfono: se puede “Añadir a pantalla de inicio”.
- Dueña fuera: **portal nube** (default), no el origen LAN publicado.

Idioma UI v1: **español**.

---

## 10. Fuera de esta spec (y de v1 de arquitectura)

- Plugins reales (IVA, caja que cobra, Rappi, etc.).
- Electron, Bun compile, Deno compile, `pkg`.
- Cobro, cajón, arqueo (catálogo).
- **Boleta/factura electrónica SII** (Chile): las emite caja **después**; este POS no se certifica ante el SII en v1.
- Tailscale como producto empaquetado por defecto.
- Multi-servidor activo-activo en un local.

---

## 11. Criterio de hecho (v1 arquitectura)

1. Inno en Windows (y pkg en Mac) instalan, crean la BD si falta, levantan el servicio; el dueño no usa terminal.
2. Tablets en LAN usan la web; un corte de luz no corrompe SQLite; el servicio vuelve.
3. Al enviar a cocina se **imprime la comanda**; al emitir precuenta se **imprime el papel** (cola si la impresora está caída).
4. Complementos: solo el mensaje de vacío.
5. Extra nube off: nada sale. Extra on: copia cifrada + portal dueña; el salón offline sigue.
6. CI verde en unidad, sistema, WAL, empaque, impresión (mock) y vacío de plugins.
7. Licencia por local; sin internet el salón opera.
8. Actualizar (silencioso o asistente) no borra pedidos ni la cola de tickets.

---

*Fin del diseño técnico. El plan de implementación (archivos, tareas, orden) se escribe después de aprobar este documento.*
