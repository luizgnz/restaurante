---
name: revision-ui
description: Revisión visual y de consistencia de la UI del POS del restaurante contra criterios fijos. Usar SIEMPRE al terminar una fase o tarea de UI, antes de abrir un PR con cambios de interfaz, cuando el usuario pida "revisar la UI", "revisión visual", "verificar la interfaz" o reporte inconsistencias visuales, y antes de cada release con capturas.
---

# Revisión UI del POS

Revisa la interfaz del restaurante contra una vara fija, no contra el criterio del momento. El output es un veredicto por pantalla + hallazgos priorizados. La UI vive en `ui/src/pantallas/`, el CSS en `ui/src/styles.css`.

## Proceso

1. **Define el alcance**: qué pantallas tocaron cambios (git diff del alcance) o pide el usuario cuáles.
2. **Captura las pantallas** con `browser-use:control-browser` en `http://127.0.0.1:8081/` (servidor: `npm start` en background; si el diff tocó código, `npm run build` en `ui/` antes y recargar). Toma una captura por pantalla y, si el cambio es de layout, repite a ancho 390, 768 y 1280.
3. **Aplica la checklist** completa a cada captura y al código fuente de las pantallas tocadas.
4. **Reporta** en el formato de abajo. Sin veredicto no hay revisión terminada.

## Checklist fija

### Consistencia (fase 2 del plan)
- [ ] Un mismo estado se muestra igual en toda la app: mismo texto en español y misma variante de badge. Los estados salen del mapa central (`ui/src/lib/estados.ts` cuando exista); nunca texto crudo de la BD (`abierta`, `precuenta_emitida`).
- [ ] Vocabulario único: "orden" (no "pedido" para una orden), "mesa" en el mapa, botones y títulos coherentes entre pantallas.
- [ ] Un solo sistema de modales: `Dialog` de Radix (`ui/src/components/ui/dialog.tsx`). Cero `.modal-fondo` nuevos.
- [ ] Errores visibles con un patrón único (componente de error), con `role="alert"`.
- [ ] Cargando ≠ vacío: la primera carga muestra skeleton/spinner, nunca un "no hay nada" que parece datos borrados.

### Dinero y datos
- [ ] Todo monto pasa por `dinero()` de `src/modules/formato.ts` (es-CL, miles con punto). Prohibido `$` concatenado a mano, centavos crudos o `$NaN`.
- [ ] Totales calculados con `Math.round` por línea (regla de `totales.ts`).

### Táctil y layout
- [ ] Objetivos táctiles ≥ 44px en pantallas de salón/cocina (el garzón usa dedos, a veces con guantes o mojado).
- [ ] Sin solapes de mesas ni cortes de texto a 390px. La barra superior no se rompe con nombres largos.
- [ ] Iconos con `aria-label` y/o tooltip; los botones destructivos piden confirmación.

### Cocina (KDS)
- [ ] Legible a 1,5 m: tipografía grande, contraste fuerte, color de espera (verde→ámbar→rojo) distinguible sin leer texto.

### Código (solo pantallas tocadas)
- [ ] Sin hex hardcodeados ni `!important` nuevos en pantallas nuevas (los tokens van en `styles.css`).
- [ ] Sin imports al pie, sin ramas muertas, sin toggles que no gobiernan nada real.

## Formato de salida

```markdown
## Revisión UI — <alcance y fecha>

**Veredicto: ✅ PASA / ⚠️ PASA CON OBSERVACIONES / ❌ NO PASA**

| # | Pantalla | Hallazgo | Severidad | Evidencia |
|---|----------|----------|-----------|-----------|
| 1 | Kds.tsx:123 | Botón sin etiqueta ni tooltip | P1 | captura kds.png |

Severidad: P0 rompe el flujo · P1 confunde o rompe layout · P2 inconsistencia visible · P3 pulido.
Cada P0/P1 lleva archivo:línea y qué cambiar. Cerrar con capturas guardadas en capturas/<fecha>_<tema>/.
```

## Reglas

- No apruebes por memoria: cada pantalla del alcance necesita captura reciente o diff revisado.
- Un hallazgo sin evidencia (captura o archivo:línea) no se reporta.
- Si el servidor sirve una build vieja (la pantalla no muestra el cambio), reconstruye y recarga antes de reportar: es la trampa más común de este proyecto.
