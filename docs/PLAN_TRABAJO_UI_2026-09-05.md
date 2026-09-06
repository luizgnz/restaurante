# Plan de trabajo — POS profesional — 2026-09-05

Origen: hallazgos de `docs/AUDITORIA_FUNCIONAL_UX_2026-09-05.md`. Orden por riesgo para el negocio y confianza del usuario, no por facilidad.
Tamaños: **S** = medio día · **M** = 1–2 días · **L** = 3+ días. Cada fase termina con `npm test` en verde, `npm run build` sin errores y recorrido GUI de humo (skill `web-gui-tester`).

---

## Fase 0 — Correctitud: lo que rompe la confianza del negocio (prioridad absoluta)

| Tarea | Detalle | Tamaño |
|---|---|---|
| **0.1 Armado de platos multi-grupo** | `ModalArmadoPlato.tsx:36`: cambiar `elegidas` a `Record<slotPosicion, Record<grupoId, varianteId>>`; resumen y `completos` desde ese mapa. Ajustar `validarSelecciones` (`src/modules/contornos/contornos.ts:191-203`) para aceptar una elección por grupo sin costo. Agregar test E2E del caso Arroz+Ensalada. | M |
| **0.2 Cancelar cuenta** | Endpoint `POST /api/cuentas/:id/cancelar` (solo admin/encargado, con PIN + motivo → auditoría), y acción en CuentaMesa. Libera la mesa. Cierra el hallazgo ALTA #1. | M |
| **0.3 Merma real al anular** | Si la línea anulada ya estaba `en_proceso/listo/servido` en KDS: no devolver stock firmado; registrar salida por merma con motivo automático "anulación post-preparación". Solo devolver lo pendiente. Cierra ALTA #2 y conecta con #3. | M |
| **0.4 Guarda de etapa en correcciones** | `correcciones.ts:127-143`: rechazar correcciones de líneas `en_proceso/listo/servido` salvo anulación con PIN+motivo; encender `auditoria_anulaciones` y `justificacion_anulacion` por defecto. | S |
| **0.5 Stock al vender** | Leer `bloqueo_sin_stock` en `enviarOrden`/`corregirOrden`: avisar o bloquear según config; `CHECK (on_hand >= 0)` opcional por política. Cierra ALTA #4 y activa la config muerta. | M |
| **0.6 Redondeo de dinero** | Todo el cálculo en enteros de centavos (redondeo por línea); unificar `totalEfectivoCuenta` y `snapshotCuenta` en una sola función. | S |

**Criterio de salida:** ninguna mesa queda atrapada; anular un plato cocinado genera merma visible; vender sin stock avisa/bloquea según config; ningún total con decimales.

## Fase 1 — Dinero visible y confiable (UI que el mesero mira 200 veces al día)

| Tarea | Detalle | Tamaño |
|---|---|---|
| **1.1 Formateador único** | `ui/src/lib/formato.ts`: moneda `Intl es-CL` y fechas/relativos (`hace 8 días`, no "Hace 192 horas"). Aplicar en Constructor, CuentaMesa, Precuenta, ConfirmarCierre, Comanda, Órdenes, Plano. | S |
| **1.2 Montos en el resumen** | Precio por línea y **total** en el resumen del constructor y en el botón Enviar (`ConstructorOrden.tsx:242-299`). | S |
| **1.3 Comanda legible** | Separadores en el detalle de contornos ("Menú del día · Carne · Papas fritas…") en `VistaPreviaComanda` y en el texto que va a cocina/impresión; atribución por PIN (quien autorizó), no por sesión. | S |
| **1.4 PIN configurable de verdad** | Leer `pin_al_emitir_precuenta` / `pin_al_enviar_caja` / `pin_momento` en los flujos (o retirarlas de Opciones). Meta: ciclo completo con 0–1 PIN si el negocio lo decide. | M |
| **1.5 Reimprimir precuenta** | Botón en CuentaMesa (el endpoint ya existe: `app.ts:983`). | S |

**Criterio de salida:** ningún monto sin formato; el mesero ve el total antes de enviar; PIN solo donde el negocio pida.

## Fase 2 — Consistencia UI (una sola forma de hacer cada cosa)

| Tarea | Detalle | Tamaño |
|---|---|---|
| **2.1 Estados y vocabulario centralizados** | `ui/src/lib/estados.ts` con un único mapa estado→etiqueta/variante de badge; corregir "abierta" crudo (`CuentaMesa.tsx:76`); decidir orden/pedido y mesa/salón una vez. | S |
| **2.2 Un solo sistema de modal y de errores** | Migrar los 4 `.modal-fondo` a Radix Dialog; un componente de error con variante y cierre; unificar confirmaciones destructivas (mapa y slots piden confirmación). | M |
| **2.3 Carga ≠ vacío** | Skeletons/spinners de primera carga en Plano, KDS, Órdenes, Inventario. | S |
| **2.4 Toggles fantasma: implementar o quitar** | `pin_momento`, `enviar_a_caja_requiere_avanzado`, `confirmar_comanda` — que la pantalla de Opciones solo muestre lo que el sistema cumple. | S |
| **2.5 Limpieza de muertos** | Borrar `Pedido.tsx`, `Complementos.tsx`, ramas `uiVersion`, imports al pie, `table.tsx` sin uso (o usarlo en Inventario). | S |

**Criterio de salida:** mismo estado = mismo badge en toda la app; un patrón de modal, error y confirmación; cero opciones decorativas.

## Fase 3 — Identidad visual profesional (que "se vea caro")

| Tarea | Detalle | Tamaño |
|---|---|---|
| **3.1 Marca** | Reemplazar "Snell Roundhand" por una display self-hosted con fallback (`styles.css:4098-4104`); subir logo real desde Opciones; definir paleta de marca sobre los tokens "Turno" y eliminar el púrpura Odoo (`styles.css:162-170,222`). | S–M |
| **3.2 Grilla de productos** | Fotos de producto (o iconografía por categoría + color de categoría coherente) en vez de iniciales serif; precio formateado y destacado; chip "14 disponibles" → "14 productos". | M |
| **3.3 Salón con semáforo real** | Tarjetas por estado: libre (verde), con órdenes pendientes (neutro), precuenta emitida (ámbar), atrasada (>X min, rojo suave);映射 del `estadoMesa` derivado del backend; resumen clickable por filtro. | M |
| **3.4 KDS operable** | Botones con etiqueta o tooltip+icono estándar; franja de color por tiempo de espera (verde→ámbar→rojo); arreglar sondeo por vista (`App.tsx:291`) y pausar con `document.hidden`; acción de limpiar/archivar cola vieja. | M |
| **3.5 Consolidación CSS** | Familia por familia según `docs/MIGRACION_SHADCN.md`: cero hex hardcodeados y cero `!important` en las pantallas nuevas. | L |

**Criterio de salida:** mirando el salón se entiende el estado en <2 s; ninguna pantalla mezcla los dos "primarios"; la marca se ve igual en macOS/Windows/Android.

## Fase 4 — Táctil y responsive de verdad

| Tarea | Detalle | Tamaño |
|---|---|---|
| **4.1 Plano responsive** | Escalar las coordenadas absolutas del mapa al viewport (transform/scale) o layout relativo por debajo de 768px; nunca solapar mesas. | M |
| **4.2 Controles táctiles** | Botón "Nueva orden" con texto en móvil; targets ≥44px; bottom-nav ya existente como única nav en móvil. | S |
| **4.3 Matriz de pruebas responsive** | Recorrido GUI en 390 / 768 / 1280 de las 5 pantallas core con capturas (`web-gui-tester`); criterios: sin solapes, sin cortes, flujo completo posible en cada ancho. | S |

**Criterio de salida:** tomar una orden completa en un teléfono sin tocar el scroll horizontal ni perder texto.

## Fase 5 — Operación y QA continuo

| Tarea | Detalle | Tamaño |
|---|---|---|
| **5.1 Cobro real (nuevo módulo)** | Tabla de pagos (medio, monto, vuelto), cierre de cuenta con boleta/receipt impresa, división de cuenta simple (por ítem o monto). Es la brecha #1 para producción. | L |
| **5.2 Skills a medida** | Crear con `skill-creator`: `auditor-pos`, `revision-ui`, `capturas-release` (ver auditoría §5). | S |
| **5.3 Rutina de release** | `npm test` + `npm run build` + recorrido de humo GUI + galería de capturas del release → commit de docs. | S |
| **5.4 Endurecer red local** | Límite de intentos de PIN (con bloqueo temporal), no verificar contra todos los hashes, sesiones con expiración en BD. | M |

---

## Orden sugerido de ejecución

**0.1 → 0.2 → 1.1 → 1.2 → 0.3/0.4/0.5 → 2.1–2.3 → 3.1–3.4 → 4.1–4.3 → 5.x**
(primero los bugs que cuestan dinero y mesas, luego la confianza visual diaria, luego la cara nueva, luego móvil, y el cobro real como proyecto aparte).

## Riesgos

- **0.1 y 0.3 tocan dinero e inventario**: hacerlo detrás de tests (ya hay suite amplia) y con datos de prueba, nunca directo en la BD de la tienda.
- **3.5 (CSS)** es el más largo; hacerlo familia por familia para evitar una rama eterna.
- **5.1 (cobro)** define el modelo fiscal (¿boleta? ¿IVA incluido en precio? — los precios seed ya van "con todo incluido"); decidir con el negocio antes de empezar.
