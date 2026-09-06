# Auditoría funcional y de UX — 2026-09-05

**Alcance:** auditoría funcional del backend, prueba real de la interfaz como usuario (GUI), evaluación de consistencia UI y de la experiencia de uso.
**Rama:** `prototype/ui-responsive` · **App probada en:** `http://127.0.0.1:8081` · **Capturas:** `capturas/2026-09-05_auditoria/`
**Método:** revisión profunda del código `src/` y `ui/src` por agentes de auditoría + recorrido GUI caja-negra (login → orden → cocina → precuenta → caja) con evidencia visual, + evaluación heurística.

---

## Veredicto general

**El ciclo de negocio principal funciona de punta a punta** (orden → cocina → precuenta → caja → mesa libre) y el núcleo transaccional está bien construido (correcciones versionadas, idempotencia, libro de inventario por línea, sello de precuenta). **Pero hay tres brechas que impiden operar en producción** y varias fallas de confianza que un usuario nota en el primer uso:

1. **No se puede cancelar una cuenta** → las mesas quedan ocupadas para siempre (el salón arrancó con 10/10 mesas "En pedido" de hace 8 días y 0 libres).
2. **No hay cobro real**: sin pagos, boleta, propina, descuentos ni división de cuenta; "en caja" es un callejón sin salida.
3. **El inventario cree que los platos devueltos no se cocinaron**: anular un plato servido devuelve el stock (stock fantasma, sin merma) y nunca se valida stock al vender.

En UI, la falla más grave es de **correctitud**: el armado del "Menú del día" **pisa selecciones** del segundo contorno (elige Arroz + Ensalada → solo se guarda la última). El cocinero jamás se entera de que debía preparar arroz.

---

## 1. Resultados de la prueba como usuario (GUI)

Preparación: app servida localmente, BD demo existente. Se probaron los flujos con datos reales del sistema (se creó la Orden #3 de la Mesa 1 y se cerró la cuenta). Evidencia en `capturas/2026-09-05_auditoria/`.

| # | Punto de prueba | Resultado | Evidencia |
|---|---|---|---|
| T1 | Login admin/admin | ✅ Pasa. Limpio, pero genérico: sin logo y sin acceso por PIN (los empleados del seed usan PIN). | `t1_login.png` |
| T2 | Salón / estado de mesas | ⚠️ Funciona, pero: "Hace 192 horas" en vez de "hace 8 días"; 10 tarjetas idénticas sin diferenciación visual de estado; tablist "Pisos" con un solo tab (UI muerta). | `t2_salon.png` |
| T3a | Nueva orden con 0 mesas libres | ❌ **Dead-end sin explicación**: el combobox solo tiene "Selecciona una mesa", sin mensaje de "no hay mesas libres" y Enviar deshabilitado. | `t3_nueva_orden_sin_mesas.png` |
| T3b | Tomar orden en mesa ocupada | ✅ Cuenta de mesa clara; agregar productos y +/− funciona; fechas en formato técnico ("28/8/2026, 2:50:28"); Anular es un icono de basura sin etiqueta. | `t3_cuenta_mesa1.png` |
| T3c | Armado "Menú del día" | ❌ **Bug de datos**: se elige Carne + Papas fritas + Arroz + Ensalada rusa; el progreso dice 3/3 pero **solo se guarda "Segundo contorno: Ensalada rusa"** (el Arroz se pierde). El suplemento Carne +$500 sí se cobra bien ($9.400). | `t3_armado_completo.png`, `t3_resumen_falta_arroz.png` |
| T3d | Resumen de la orden | ❌ **No muestra precios ni total**: el mesero envía a ciegas. | `t3_resumen_falta_arroz.png` |
| T3e | Enviar a cocina (PIN + comanda) | ✅ Flujo funciona con PIN táctil. ⚠️ Comanda con detalle **concatenado sin separadores** ("Menú del díaCarnePapas fritasEnsalada rusa" — así se imprimiría); atribución inconsistente: comanda dice "Jefa" (sesión) pero la orden queda a nombre de Ana (PIN). | `t3_orden_enviada.png`, `t3_comanda_enviada.png` |
| T4 | Cocina (KDS) | ⚠️ Avance de línea Enviado → En preparación → Listo funciona y los contadores reaccionan. Pero: 35 ítems de hace 8 días saturan la cola sin forma de limpiarla en bloque; botones solo de iconos (▶ ⇄ ⊘) sin etiquetas; sin colores por tiempo de espera; refresco manual ("Actualizar") — el sondeo automático se apaga si el admin entra a cocina por el menú (bug en `App.tsx:291`). | `t4_cocina.png`, `t4_cocina_en_preparacion.png` |
| T5 | Precuenta → Cerrar cuenta → Caja | ✅ Ticket correcto, confirmación clara ("la mesa queda libre" y se cumple). ❌ **Tres PIN en un mismo ciclo** (enviar, precuenta, cerrar) y las opciones de configuración que los controlan no se leen del backend (toggles muertos). | `t5_precuenta.png`, `t5_cuenta_en_caja.png` |
| T5b | Mesa liberada | ✅ Mesa 1 "Libre" (chip verde) y resumen "1 libres / 9 en servicio". El chip de color por estado **sí existe** para libre, pero las 9 ocupadas se ven idénticas entre sí. | `t5_cuenta_cerrada.png` |
| T6 | Órdenes | ⚠️ Útil, pero el chip "En pedido" es **ámbar aquí y gris en Salón** (mismo estado, dos estilos); "Hace 193 horas". | `t6_ordenes.png` |
| T6b | Inventario | ⚠️ Tabla clara con filtros; ajuste exige PIN admin ✓; **sin historial de movimientos (kardex)**: no se puede ver cuándo salió stock ni por qué orden; unidades pegadas al nombre ("Carne g", "Lechuga g"). | `t6_inventario.png`, `t6_inventario_carne.png` |
| T9 | PIN incorrecto | ✅ Muestra puntos al tipear y banner "PIN incorrecto. Vuelve a ingresar el PIN." | `t9_pin_incorrecto.png` |
| T10 | Responsive móvil (390px) | ❌ **Roto en el núcleo**: el plano con coordenadas absolutas hace que las mesas se superpongan; el botón "Nueva orden" pierde el texto (queda un "+"); "Últimos/Atrasados" cortados. La promesa "táctil y responsive" del README no se cumple en el salón. | `t10_movil_inventario.png` |

**Fricción medida (recorrido mesero):** completar "una ronda" simple (1 mesa, 2 productos, 1 personalizable con 4 selecciones, indicación, envío, precuenta, cierre) exige **~20 toques + 3 PIN + 3 confirmaciones/modales**. El PIN repetido es la mayor fricción y no es configurable pese a existir las opciones.

---

## 2. Hallazgos funcionales (backend) — top 10

Informe completo de 21 hallazgos generado en la auditoría de código; los críticos:

| # | Sev. | Hallazgo | Dónde |
|---|---|---|---|
| 1 | **ALTA** | No se puede cancelar una cuenta; mesas ocupadas para siempre. `cancelada` solo lo escribe la migración legacy; sin consumo → `cuenta_sin_consumo` bloquea precuenta y caja. | `src/modules/precuenta/precuenta.ts:174-176`, `src/http/rutas/cuentas.ts` |
| 2 | **ALTA** | Anular plato preparado/servido devuelve el stock al inventario (sin merma, sin registro). | `src/modules/inventario/asientos.ts:310-313` vs `src/modules/kds/kds.ts:149-162` |
| 3 | **ALTA** | Se puede editar/anular una orden ya enviada o servida sin control de etapa; auditoría de anulaciones apagada por defecto. | `src/modules/ordenes/correcciones.ts:127-143`, `src/config.ts:88-89` |
| 4 | **ALTA** | Nunca se valida stock al vender; stock negativo silencioso; la config `bloqueo_sin_stock` no la lee nadie. | `src/modules/inventario/asientos.ts:29-43`, `src/config.ts:33` |
| 5 | **ALTA** | El ciclo de caja no termina en cobro: sin pagos, medios, boleta, propina ni cierre de caja. | `src/modules/caja/caja.ts:181-189`, `src/print/queue.ts:18-24` |
| 6 | MEDIA | Idempotencia global de envíos: la misma clave en otra mesa devuelve la orden ajena como éxito. | `008_cuentas_ordenes.sql:27`, `enviar.ts:46-50` |
| 7 | MEDIA | Totales con centavos fraccionarios (REAL × entero sin redondeo) impresos tal cual. | `src/modules/cuentas/totales.ts:10,93`, `escpos.ts:85` |
| 8 | MEDIA | Correcciones no soportan contornos: un plato con suplemento re-emitido cobra de menos y cocina no ve contornos. | `entrada.ts:141-152`, `correcciones.ts:255-266` |
| 9 | MEDIA | Rol `inventario` decorativo: no puede registrar entradas/pérdidas (PIN niega a no-admins). | `empleados.ts:209-221`, `app.ts:113` |
| 10 | MEDIA | Config mostrada en Opciones que el backend ignora: `bloqueo_sin_stock`, `pin_al_anular`, `pin_al_emitir_precuenta`, `pin_al_enviar_caja`, etc. | `src/config.ts:33-36,71-77` |

Otros: catálogo sin edición/baja de productos ni precios; legacy (`pedidos`) convive sin guardas (doble cuenta posible); PIN sin límite de intentos (y cada intento prueba N hashes argon2 → DoS barato en red local); pérdida manual ignora lo reservado; sin kardex de ventas.

---

## 3. Hallazgos de UI (consistencia y profesionalismo) — top 10

Informe completo en la sección de mejoras del auditor; lo esencial:

1. **Bug de armado multi-grupo** (`ModalArmadoPlato.tsx:36`): las elecciones se guardan por `slot.posicion` con un solo valor; los subgrupos "Carbohidrato"/"Ensalada" se pisan. El backend sí soporta múltiples selecciones por línea.
2. **Dinero sin formatear en todo el POS** ("$8900"), con dos excepciones que sí formatean (Inventario `es-CL`, vista de impresión "$5.000") y sin formateador compartido. Fechas con 3 estilos.
3. **Resumen de la orden sin precios ni total** (`ConstructorOrden.tsx:242-299`).
4. **Dos sistemas de modal conviven** (Radix con focus trap vs `.modal-fondo` a mano sin Escape) y **4 estilos de error distintos**; confirmaciones destructivas inconsistentes (anular orden pide PIN; descartar mapa no confirma nada).
5. **Terminología inestable**: orden/pedido, mesa/salón, quitar/eliminar/descartar/anular; el badge "abierta" sale crudo en minúsculas (`CuentaMesa.tsx:76`); 3 mapas de estados distintos.
6. **Identidad visual sin resolver**: logo en "Snell Roundhand" (solo macOS — en Windows/Android se ve una cursiva genérica); tipografía serif de marca inexistente; iniciales serif gigantes con colores arbitrarios en la grilla de productos (sin fotos ni iconografía por categoría).
7. **CSS apilado**: ~4.000 líneas heredadas con 95 hex hardcodeados, ~258 px, 15 `!important` y **dos colores primarios compitiendo** (negro del token "Turno" vs púrpura Odoo heredado). El plan de migración existe (`docs/MIGRACION_SHADCN.md`) pero está a medio camino.
8. **Estados de carga indistinguibles del vacío** (KDS, Órdenes, Inventario muestran "no hay…" mientras cargan); sin skeletons.
9. **Toggles fantasma y código muerto**: `pin_momento`, `enviar_a_caja_requiere_avanzado` se muestran y no se consultan; `Pedido.tsx`, `Complementos.tsx`, ramas `uiVersion` muertas; sin router (F5 vuelve al inicio).
10. **Accesibilidad táctil**: botones solo-icono en KDS sin `title`/etiqueta; alturas de control táctiles bien definidas en tokens pero no aplicadas en todas las pantallas.

---

## 4. Evaluación heurística (Nielsen, resumen)

| Heurística | Nota /5 | Observación principal |
|---|---|---|
| Visibilidad del estado | 2 | Sin diferenciación visual de estados en salón; carga vs vacío indistinguible; KDS sin urgencia temporal. |
| Correspondencia con el mundo real | 3 | Terminología de restaurante correcta pero inestable (orden/pedido); unidades en nombres de materiales. |
| Control y libertad del usuario | 2 | No se puede cancelar cuenta; confirmaciones destructivas inconsistentes; sin deshacer. |
| Consistencia y estándares | 2 | Dos sistemas de modal, 4 estilos de error, moneda/fechas sin formato único. |
| Prevención de errores | 2 | Dead-end sin mesas libres; fallo silencioso al abrir armado; corrección sin guarda de etapa. |
| Reconocer antes que recordar | 3 | Resumen de orden visible siempre (bien) pero sin montos; comanda previa al envío (bien). |
| Flexibilidad y eficiencia | 2 | PIN repetido 3× por ciclo; sin "repetir armado"; sin acciones en bloque en cocina. |
| Estética y diseño minimalista | 3 | Base limpia (tokens "Turno"), pero CSS heredado compite y la identidad de marca flota. |
| Ayudar a reconocer errores | 3 | Errores de dominio bien tipados; PIN incorrecto con buen mensaje; banner global sin cierre y con texto técnico. |
| Ayuda y documentación | 3 | Manual de usuario y ayuda contextual en pantalla (bien), sin onboarding de primeros pasos. |

**Promedio: 2,7 / 5** — coherente con un prototipo funcional avanzado, aún no operable por personal real.

---

## 5. Skills recomendadas para trabajar a nivel profesional

### Ya instaladas y validadas en esta auditoría
- **`browser-use:web-gui-tester` + `control-browser`** — la metodología usada aquí: prueba GUI caja-negra con evidencia visual. Usarla en cada release como "recorrido de humo".
- **`document-skills:pdf` / `docx` / `xlsx`** — para entregar informes y propuestas a stakeholders (p. ej., esta auditoría como PDF presentable).
- **`skill-creator`** — para crear las skills a medida de abajo.
- **`orchestration`** — para correr en paralelo las fases del plan (frontend/backend/QA) con coordinación.

### Para instalar (ecosistema abierto de Agent Skills)
- **[anthropics/skills](https://github.com/anthropics/skills)** — repo oficial: incluye `webapp-testing` (pruebas E2E scripted) y skills de diseño frontend; formato SKILL.md instalable como plugin.
- **[VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills)** — catálogo comunitario (1.000+) para buscar skills de QA, diseño y documentos.
- **[alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills)** — 380 skills/plugins compatibles con varios agentes.

### A crear a medida con `skill-creator` (máximo valor para este repo)
1. **`auditor-pos`** — checklist de auditoría funcional POS sembrada con los 21 hallazgos de este informe (estados de cuenta, inventario/merma, caja, roles, concurrencia) para re-ejecutar tras cada cambio.
2. **`revision-ui`** — checklist de consistencia UI (tokens vs hardcodeados, vocabulario único, estados carga/vacío/error, formato CLP/fechas, foco táctil) + flujo de capturas por pantalla.
3. **`capturas-release`** — automatiza la galería `capturas/<fecha>_<commit>/` con `manifest.json` (hoy se hace a mano) para documentar cada release.

---

## 6. Conclusión

La base de ingenieria es notablemente sólida para un prototipo (transacciones, idempotencia, tests de UI abundantes) y el recorrido principal se completa sin errores duros. Lo que falta no es "más features": es **cerrar los bordes del negocio** (cancelación, cobro, merma/stock), **hacer confiable lo que la pantalla promete** (armado de platos, montos, opciones) y **unificar la capa visual** (tokens, vocabulario, identidad) para que se vea y se sienta profesional. El plan de trabajo con fases, prioridades y criterios de aceptación está en `docs/PLAN_TRABAJO_UI_2026-09-05.md`.
