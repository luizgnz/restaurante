# Opciones del POS

Pantalla única de configuración, abierta desde el menú hamburguesa (☰) de la barra. La persistencia es el `config.json` existente. Al terminar el circuito se evaluará si conviene pasar esto a SQLite u otro backend; no forma parte de este trabajo.

## Navegación

- Nuevo destino `opciones` en `Destino` (`Barra.tsx`).
- Ítem **Opciones** en el panel del menú, junto a Backend.
- Cabecera: título **Opciones**. Guardar al cambiar cada control (como barras del plano), no un formulario con un solo submit, salvo nombre/logo que se confirman al salir del campo o al elegir archivo.

## Identidad

| Campo | Tipo | Default | Uso |
| --- | --- | --- | --- |
| `nombre_local` | texto, máx. 40 | `Restaurante` | Barra (centro) |
| `logo_data` | data URL o `null` | `null` | Imagen en la barra, a la izquierda del nombre. Máx. 400 KB. Formatos imagen. Quitar deja `null`. |

El logo no se imprime todavía; el campo queda listo para tickets cuando se conecte impresora.

## Apariencia

Aplica a **toda la interfaz** del POS (no solo las tarjetas de producto), vía variables CSS en `:root`.

| Campo | Valores | Default |
| --- | --- | --- |
| `tipografia` | `sans` · `serif` · `redondeada` | `sans` |
| `tamano_ui` | `compacto` · `normal` · `grande` | `normal` |

Escala: compacto 0.9 · normal 1 · grande 1.15, sobre `html { font-size }`.

## Seguridad y autorizaciones

No hay control de “tablet en cocina” en Opciones. El interruptor actual se quita de Órdenes. El flag interno `tablet_cocina` no se toca en esta entrega: sigue gobernando la editabilidad **del flujo legacy de `pedidos`** (`quitarLinea`, `cambiarCantidad`).

En el modelo Cuenta→Órdenes manda el diseño de cuentas §7: toda orden enviada se corrige o anula con PIN, y `tablet_cocina` no participa. La corrección no borra historia de cocina —una línea `servido` o `cancelado` no se reescribe— pero tampoco se bloquea por la etapa.

### Contraseña (PIN de empleado)

| Campo | Valores | Default |
| --- | --- | --- |
| `pin_habilitado` | sí / no | `true` |
| `pin_momento` | `crear_orden` · `enviar` | `enviar` |

`pin_momento` solo se muestra y se usa si `pin_habilitado` está activo.

- **Deshabilitado:** no se pide PIN al crear orden ni al enviar. El mesero de la comanda es el administrador de la sesión abierta.
- **Antes de crear la orden:** PIN **antes** de `POST /api/pedidos` y **antes** de abrir mesa libre (`POST /api/mesas/:id/abrir`). PinPad título “PIN para crear orden”. Acción `crear_pedido` (derecho básico o avanzado). Si el PIN falla, no se crea nada. Al enviar no se vuelve a pedir PIN.
- **Al hacer clic en Enviar:** comportamiento actual. PinPad “PIN para Enviar” tras Continuar (si hay vista previa) o al pulsar Enviar (si no hay vista previa). Acción `enviar`.

`pin_al_enviar` del config actual queda derivado: `true` solo si PIN habilitado y momento `enviar`. Así el código de cocina existente no se reescribe de más.

### Anulación

| Campo | Default |
| --- | --- |
| `pin_al_anular` | `true` (no se ofrece apagarlo en la UI de esta entrega) |

Al pulsar **Anular** (pedido o lista de órdenes) se pide PIN. Título “PIN para anular”. Acción `anular` (básico o avanzado). `POST /api/lineas/:id/quitar` exige `{ pin }`. PIN incorrecto o sin derecho: no se anula. Cancelar el pad deja la línea intacta.

### Auditoría de anulaciones (cuenta → órdenes)

Opcional. Default: todo apagado.

| Campo | Default | UI |
| --- | --- | --- |
| `auditoria_anulaciones` | `false` | Interruptor: “Guardar registro de órdenes anuladas” |
| `justificacion_anulacion` | `false` | Interruptor: “Pedir justificación al anular”. Solo visible si el anterior está on. Si se apaga la auditoría, este queda `false`. |

Detalle en `2026-08-22-cuentas-ordenes-design.md` §7.1.

### Confirmar comanda

| Campo | Default |
| --- | --- |
| `confirmar_comanda` | `false` |

Si está activo, Enviar no manda a cocina de inmediato. Se abre un modal del sistema con el texto **idéntico** a `renderComanda` (mesa, mesero de sesión, indicaciones, `cantidad x producto (nota)`). Tipografía monoespaciada, fondo claro, aspecto de ticket. **Volver** cierra sin enviar. **Continuar** sigue el flujo de PIN (si aplica) y luego `POST .../enviar`. Un solo envío: no se reabre otra vista previa al repetir clics mientras está abierta.

Orden cuando PIN al enviar y confirmación están on: **Enviar → ticket → PIN → cocina**.

## Impresoras

Sección visible, controles deshabilitados, texto “Configuración próximamente”. Campos de muestra: impresora de comanda, impresora de precuenta. No se persisten.

## Reservas

Tres interruptores independientes controlan qué datos opcionales aparecen en el modal de reserva:

| Campo | Default | Etiqueta |
| --- | --- | --- |
| `reserva_campo_nombre` | `true` | Pedir nombre |
| `reserva_campo_rut` | `false` | Pedir RUT |
| `reserva_campo_contacto` | `false` | Pedir contacto |

Los campos habilitados siguen siendo opcionales. Fecha y hora siempre son obligatorias y no pueden superar 12 meses desde el momento actual.

## API

`GET /api/config` y `POST /api/config` exponen y aceptan además: `nombre_local`, `logo_data`, `tipografia`, `tamano_ui`, `pin_habilitado`, `pin_momento`, `confirmar_comanda`, `auditoria_anulaciones`, `justificacion_anulacion`, `reserva_campo_nombre`, `reserva_campo_rut`, `reserva_campo_contacto`.

`GET /api/pedidos/:id/comanda-preview` devuelve `{ texto }` con el cuerpo de comanda (líneas `nueva` + indicaciones; sin nota privada).

`POST /api/pedidos` y `POST /api/mesas/:id/abrir` aceptan `pin` cuando `pin_habilitado && pin_momento === "crear_orden"`.

`POST /api/pedidos/:id/enviar` no exige PIN si `!pin_al_enviar`; usa el administrador de sesión.

`POST /api/lineas/:id/quitar` exige `pin` y `exigirPin(..., "anular")`.

## Pruebas

- Config: defaults nuevos y persistencia de nombre, tipografía, PIN, confirmación, logo nulo.
- API: POST config escribe `nombre_local`; preview no incluye nota privada; quitar sin PIN falla; enviar sin PIN cuando está deshabilitado usa sesión.
- UI: menú tiene Opciones; pantalla tiene Identidad, Apariencia, Seguridad, Impresoras; no dice “Tablet en cocina”; impresoras deshabilitadas; vista previa contiene `COMANDA` y no la nota privada.
- Empleados: `crear_pedido` y `anular` aceptan básico; mínimo no.

## Fuera de alcance

Conectar impresoras reales, imprimir el logo, cambiar `tablet_cocina`, migrar config a SQLite.
