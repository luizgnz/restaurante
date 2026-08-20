# Catálogo de funcionalidades y configuraciones — POS restaurante

**Fecha:** 2026-08-19  
**Estado:** borrador para revisión del dueño del producto  
**Referencia de dominio:** Odoo POS Restaurant 19 (salón, comandas, recetas/BOM, empleados, presets), con un límite de producto propio: **este sistema no cobra**.  
**Qué no cubre este documento:** stack técnico, archivos, plan de implementación, pantallas pixel a pixel.

El cliente (dueño del restaurante) configura el comportamiento. El sistema no impone un único flujo: cada política tiene un **default de restaurante** y alternativas.

**Límite de producto (cerrado):** este sistema toma y carga pedidos, manda comandas, controla inventario por receta, gestiona mesas y empleados. **No** abre cajón, **no** recibe dinero, **no** tiene medios de pago, **no** da cambio, **no** hace arqueo. La validación de consumo es la **precuenta**. El cobro ocurre **fuera**, en **caja** (estación o módulo ajeno). Este producto **emite** el documento de consumo y lo **entrega a caja**.

**Leyenda de alcance**

| Marca | Significado |
| --- | --- |
| **v1** | Necesario para operar un salón con pedidos, comandas, inventario por receta, identidad de mesero, precuenta y envío a caja. |
| **posterior** | Profesional y configurable, pero no bloquea validar el núcleo. |

---

## 1. Mapa de módulos

El producto se organiza como Odoo: aplicaciones que se hablan, no un monolito de “pedido”.

| Área | Qué es | Estación típica |
| --- | --- | --- |
| Establecimiento y puntos de venta | Local, turnos de salón, si el POS es bar/restaurante | Back-office |
| Salón | Pisos, mesas, ocupación, pedidos abiertos | POS sala |
| Pedidos | Ticket de mesa o barra: líneas, notas, envíos a cocina | POS sala |
| Presets de servicio | Salón / para llevar / delivery (impuestos, lista de precios, capacidad) | POS sala |
| Preparación (KDS) | Comandas por estación (cocina, bar), etapas y tiempos | Pantalla cocina |
| Impresoras de comanda | Ticket de papel por categoría | Cocina / bar |
| Productos y recetas | Carta, categorías POS, BOM/kit, modificadores | Back-office |
| Inventario | Existencias, reserva, disponible, armables | Back-office + POS |
| Empleados | Quién usa el POS, PIN/badge, derechos, mesero del pedido | POS sala |
| Precuenta | Instantánea de consumo para que el cliente valide | POS sala |
| Handoff a caja | Entrega del consumo validado a una caja **externa** | POS sala → caja ajena |
| Cuentas | Transferir, unir mesas, partir consumo (antes de precuenta/caja) | POS sala |
| Cliente y fiscal | Precios e impuestos en la precuenta (la factura la emite caja) | POS sala / caja externa |
| Reservas | Bookings sobre mesas | Posterior |
| Autoservicio / QR / delivery externo | Pedido del comensal o aggregators | Posterior |

Sala y cocina son **estaciones distintas**, no un mesero que “se loguea como cocina”. El login de empleado es **quién** usa el terminal de sala.

**Caja no es un módulo de este producto.** Es una estación o sistema vecino que recibe el documento de consumo y cobra. Este POS no simula ese cobro.

---

## 2. Principios que el dueño configura

Estas políticas atraviesan varios módulos. Van primero porque el resto del catálogo las usa.

### 2.1 Momento de inventario

**Configuración:** `politica_inventario`

**Qué hace:** define cuándo los ingredientes de una receta dejan de estar libres. El descuento **firme** no está atado a “entró efectivo”: este producto no ve el dinero.

| Valor | Comportamiento |
| --- | --- |
| `descuento_al_enviar` | Al enviar la comanda se descuenta stock físico. Cancelar línea enviada **devuelve** stock (salvo merma, ver 8.6). |
| `reserva_al_enviar_firme_al_precuenta` | Al enviar a cocina se **reserva**. Al **emitir precuenta** la reserva pasa a descuento firme. |
| `reserva_al_enviar_firme_al_enviar_caja` | Al enviar a cocina se **reserva**. Al **enviar a caja** (último acto de este sistema) la reserva pasa a descuento firme. |
| `reserva_al_enviar_firme_al_ack_caja` | Igual que el anterior, pero el firme espera confirmación de que caja cerró el ticket. Sin ACK, la reserva sigue viva. |

**Default restaurante:** `reserva_al_enviar_firme_al_enviar_caja`.

**Por qué ese default:** encaja con “reserva pronto, firme tarde”, y el firme ocurre en **el último acto que este producto controla**. No finge un cobro. Emitir precuenta puede repetirse y el cliente aún puede pedir más; por eso la precuenta **no** es el default del firme.

**Cuándo cambiarla**

- A `descuento_al_enviar` si cocina no debe preparar nada que no esté ya “salido” del almacén.
- A `reserva_al_enviar_firme_al_precuenta` si la precuenta se considera consumo cerrado (poco habitual: se reimprime y se añaden líneas).
- A `reserva_al_enviar_firme_al_ack_caja` cuando exista integración real con caja y no se quiera firmar stock si el cajero rechaza o corrige el ticket.

**Efectos secundarios**

- Cambia “cuántos se pueden armar” en vivo.
- Precuenta reimpresa **no** vuelve a descontar (la precuenta es una foto, no un asiento).
- Si se añaden líneas **después** de una precuenta, hay que emitir otra precuenta; el firme (si está en enviar-a-caja) aún no ocurrió.
- Tras enviar a caja (default), el pedido queda bloqueado a ediciones; un recall desde caja es **posterior**.
- En `descuento_al_enviar`, un pedido cancelado después de cocinado no recupera el plato físico: hace falta política de merma (ver 8.6).
- En `firme_al_ack_caja`, si caja nunca confirma, el reservado se queda colgado hasta timeout o intervención avanzada.

**Alcance:** **v1** los tres primeros valores. `firme_al_ack_caja` **posterior** (hace falta callback). En v1, si se elige ACK sin integración, el pedido queda `en_caja` con reserva viva hasta un cierre manual avanzado — no es el default.

### 2.2 Cuatro cifras de stock (siempre visibles)

El sistema no muestra un solo número de “inventario”. Para cada ingrediente (y, derivado, para cada plato):

| Cifra | Significado |
| --- | --- |
| **A mano** (`on_hand`) | Cantidad física en la ubicación del POS. |
| **Reservado** (`reserved`) | Comprometido por líneas **enviadas a cocina** y aún no firmadas / no revertidas. Cero si la política no reserva. |
| **Disponible** (`available`) | `on_hand - reserved` (con política de reserva). Con `descuento_al_enviar`, coincide con lo que queda a mano. |
| **Armable** (`available_to_assemble`) | Para un producto con receta: mínimo de `disponible_ingrediente / cantidad_en_receta` entre componentes **obligatorios**, tras aplicar modificadores de esa línea. |

**Firmado** no es una quinta cifra de existencias: es el asiento que baja `on_hand` y libera `reserved` en el momento de `politica_inventario`.

**Default restaurante:** mostrar las cuatro en back-office; en POS, armable y un aviso si armable = 0.

**Alcance:** **v1**.

### 2.3 Bloqueo por falta de stock

**Configuración:** `bloqueo_sin_stock`

| Valor | Qué hace |
| --- | --- |
| `permitir` | Se puede pedir aunque armable sea 0 (aviso). |
| `avisar` | Aviso fuerte; el mesero confirma. |
| `bloquear` | No se añade la línea ni se envía si no hay armable suficiente. |

**Default restaurante:** `avisar`.

**Cuándo cambiarla:** `bloquear` en carta corta con receta estricta; `permitir` si hay recetas flexibles o el chef sustituye al vuelo.

**Efectos secundarios:** `bloquear` + receta mal cargada deja de vender el plato. `permitir` puede dejar el armable negativo conceptualmente (se registra como quiebre).

**Alcance:** **v1**.

### 2.4 Precuenta vs envío a caja vs cobro

Tres documentos / actos distintos. Mezclarlos es el error que este catálogo evita.

| Acto | Qué es | Dinero | Inventario (default) | Mesa (default) |
| --- | --- | --- | --- | --- |
| **Precuenta** | Instantánea imprimible del consumo (líneas, cantidades, precios, modificadores, mesero, mesa, cubiertos, totales). El cliente valida. Se puede reimprimir. | No | No firma (sigue reservado) | Sigue ocupada; estado `precuenta` |
| **Enviar a caja** | Handoff: se entrega esa instantánea (o la última precuenta vigente) a la estación/módulo de caja. Último acto de **este** producto. | No (caja cobrará fuera) | **Firma** (reserva → descuento) | Según `liberar_mesa_cuando` |
| **Cobro en caja** | El cajero recibe dinero, da cambio, factura fiscal. **Fuera de este sistema.** | Sí | Solo si `firme_al_ack_caja` (**posterior**) | Solo si se espera ACK |

No existe “cobro simulado” en este producto.

---

## 3. Establecimiento y punto de venta

### Funcionalidades

- Un restaurante puede tener uno o varios **puntos de venta de salón** (salón, terraza, barra). Cada uno tiene mesas, almacén de descuento, impresoras de comanda y pantallas de cocina.
- La **caja de dinero** no se configura aquí. Sí se configura **a qué destino** se envían las precuentas (impresora de caja, cola, integración).
- Marca el POS como **bar/restaurante** para activar mesas, comandas y cursos (equivalente a *Is a Bar/Restaurant* de Odoo).
- Turno de **salón** (quién abrió el POS), distinto de un arqueo de efectivo.

### Configuraciones

**Nombre:** `es_bar_restaurante`  
**Qué hace:** activa piso/mesas, envío a preparación, cursos y ocupación de mesa.  
**Default:** sí.  
**Cuándo cambiarla:** no, en este producto. Un kiosco retail sería otro perfil.  
**Efectos:** sin esto no hay salón.  
**Alcance:** **v1**.

**Nombre:** `pantalla_inicial`  
**Qué hace:** al abrir el POS, entra a **plano de mesas** o a **registro** (pedido sin plano).  
**Default restaurante:** plano de mesas.  
**Cuándo cambiarla:** barra/cafetería sin mesas asignadas → registro.  
**Efectos:** no cambia reglas de negocio, solo el arranque.  
**Alcance:** **v1**.

**Nombre:** `ubicacion_stock_pos`  
**Qué hace:** de qué almacén/ubicación salen reservas y descuentos de este POS.  
**Default:** una ubicación “Cocina / cámara” por local.  
**Cuándo cambiarla:** multi-almacén (barra vs cocina) o varios locales.  
**Efectos:** el armable es por ubicación, no global.  
**Alcance:** **v1** una ubicación; multi-ubicación **posterior**.

**Nombre:** `destino_caja`  
**Qué hace:** a dónde se manda el documento al “enviar a caja” (cola interna, impresora de precuenta en caja, API).  
**Default v1:** cola/documento exportable + reimpresión; la integración viva es posterior.  
**Alcance:** **v1** documento y estado `en_caja`; conector **posterior**.

**Nombre:** `cierre_turno_salon_con_pedidos_abiertos`  
**Qué hace:** si se puede cerrar el turno de salón con mesas no enviadas a caja.  
**Default restaurante:** no.  
**Cuándo cambiarla:** turnos 24h que se solapan.  
**Efectos:** hay que decidir si se cancelan, se pasan al siguiente turno, o se fuerzan a caja.  
**Alcance:** **posterior** (v1: un turno simple o sin cierre de salón).

---

## 4. Salón (pisos y mesas)

### Funcionalidades

- Definir **pisos** (salón, terraza, VIP) y **mesas** (número, forma, asientos, color, activa/inactiva).
- El plano muestra estado en vivo: libre, ocupada, con comanda en cocina, precuenta emitida, en caja, reservada.
- Abrir mesa confirma ocupación.
- Pedido **sin mesa** (barra / para llevar): se nombra con pestaña (`tab`) o se asigna mesa después.
- Liberar mesa: vacía, cancelada, o según `liberar_mesa_cuando` después del handoff a caja.
- Saltar a mesa por número.

### Estados de mesa (v1)

| Estado | Significado |
| --- | --- |
| Libre | Sin pedido abierto. |
| Ocupada | Hay pedido en borrador (puede no haberse enviado nada a cocina). |
| En cocina | Hay al menos una línea enviada y no servida del todo. |
| Precuenta | Se emitió al menos una precuenta; el consumo aún se puede ampliar (nueva precuenta). |
| En caja | El consumo se entregó a caja; este POS ya no cobra ni (por default) edita. |
| Reservada | Hay booking futuro (**posterior**). |

Una mesa puede combinar indicadores (p. ej. en cocina + precuenta). El plano prioriza el más urgente (cocina retrasada > precuenta > ocupada). `En caja` gana sobre precuenta.

### Configuraciones

**Nombre:** `liberar_mesa_vacia`  
**Qué hace:** permite soltar ocupación con pedido vacío.  
**Default:** sí.  
**Cuándo cambiarla:** nunca, salvo protocolo de “mesa bloqueada por anfitrión”.  
**Alcance:** **v1**.

**Nombre:** `liberar_mesa_cuando`  
**Qué hace:** cuándo una mesa con consumo pasa a **libre** tras el handoff.  
**Valores:** `al_enviar_a_caja` | `cuando_caja_confirma` | `manual`.  
**Default restaurante:** `al_enviar_a_caja`.  
**Por qué:** es el último acto de este sistema y en v1 no hay ACK de caja. El plano se libera para el siguiente servicio (desbarasar / sentar).  
**Cuándo cambiarla:** `cuando_caja_confirma` si el comensal sigue sentado hasta pagar y no se debe sentar a nadie encima. `manual` si el capitán libera después de desbarasar.  
**Efectos:** con `al_enviar_a_caja`, una mesa “en caja” puede desaparecer del plano al instante (el documento sigue existiendo en la cola de caja). Con ACK, permanece `en_caja` hasta respuesta.  
**Alcance:** **v1** `al_enviar_a_caja` y `manual`. `cuando_caja_confirma` **posterior**.

**Nombre:** `pedido_sin_mesa`  
**Qué hace:** permite venta directa / tab sin asignar mesa.  
**Default restaurante:** sí (barra y para llevar).  
**Cuándo cambiarla:** off si todo debe sentarse.  
**Efectos:** esos pedidos aparecen en “órdenes”, no en el plano; el mismo flujo precuenta → caja.  
**Alcance:** **v1**.

**Nombre:** `capacidad_mesa_obligatoria`  
**Qué hace:** exige número de cubiertos al abrir.  
**Default:** sí.  
**Cuándo cambiarla:** off en barra.  
**Efectos:** cubiertos alimentan reportes y, si hay, límite de preset.  
**Alcance:** **v1**.

**Nombre:** `reservas_en_plano`  
**Qué hace:** muestra bookings y estados late / no-show.  
**Default:** off hasta activar módulo reservas.  
**Alcance:** **posterior**.

**Nombre:** `qr_menu_por_mesa`  
**Qué hace:** genera QR de carta / pedido en mesa.  
**Alcance:** **posterior**.

---

## 5. Pedidos (estación sala)

### Funcionalidades

- Crear pedido ligado a mesa, a tab, o directo.
- Añadir productos por categoría POS, buscador, (posterior) código de barras.
- Líneas: cantidad, nota, modificadores, curso/tiempo, mesero responsable, precio (para la precuenta).
- Distinguir líneas **no enviadas** vs **enviadas**. Enviar (`Send` / `Order`) solo manda lo nuevo; se puede añadir una segunda ronda.
- Cancelar pedido o línea: si ya hubo comanda, se genera **ticket de anulación** (si hay impresora) y se aplica política de inventario.
- Transferir pedido a otra mesa; unir con mesa ocupada. Split de consumo **antes** de precuenta vigente / envío a caja.
- Ver todas las órdenes abiertas (no solo el plano).
- Identidad: no hay pedido anónimo. Mesa primero; el mesero se identifica (PIN) **al operar esa mesa** o, como tarde, **al Enviar**. **Al emitir/imprimir precuenta** también se identifica (PIN). El ticket de comanda y el de precuenta llevan mesa + nombre del mesero que pasó el PIN.
- Tras **enviar a caja**, el pedido queda cerrado para este POS (salvo recall **posterior**).

### Ciclo de vida del pedido

```
borrador  →  (enviar cocina)  parcialmente_enviado / enviado
          →  precuenta_emitida     (foto; reimprimible; se puede seguir pidiendo)
          →  en_caja               (handoff; último acto de este producto)
          →  cerrado_por_caja      (solo si llega ACK; posterior)

rama: cancelado (desde borrador, enviado o precuenta, con reglas)
rama: recall_desde_caja (posterior; reabre edición)
```

Estados `cobrado` / `pagado` **no existen** en este producto.

Una línea tiene su propio subciclo:

```
nueva → enviada → [en_preparacion → lista → servida] → firmada_en_inventario
nueva → anulada_antes_de_enviar   (sin impacto stock)
enviada → anulada_en_cocina       (libera reserva o merma; KDS recibe cancelación)
```

`firmada_en_inventario` ocurre según `politica_inventario`, no cuando alguien entrega billetes.

### Configuraciones

**Nombre:** `envio_parcial`  
**Qué hace:** se puede enviar un subconjunto del carrito (lo no enviado).  
**Default:** sí.  
**Cuándo cambiarla:** off solo en locales que mandan el ticket completo una vez.  
**Efectos:** varias comandas por mesa; inventario reserva por envío.  
**Alcance:** **v1**.

**Nombre:** `nota_por_linea`  
**Qué hace:** nota libre a cocina (“término medio”, “alergia”).  
**Default:** sí.  
**Alcance:** **v1**.

**Nombre:** `mesero_por_linea`  
**Qué hace:** si al cambiar de empleado, las líneas nuevas llevan el nuevo mesero (las ya enviadas conservan el anterior).  
**Default:** no en v1 (un mesero por pedido).  
**Cuándo cambiarla:** sí cuando hay relevo a mitad de mesa y se pagan comisiones por ítem.  
**Efectos:** comisiones y “quién pidió qué” a grano fino.  
**Alcance:** **posterior**.

**Recomendación v1:** un **mesero por pedido**, según `atribuir_mesero_en`.

**Nombre:** `atribuir_mesero_en`  
**Qué hace:** cuándo se graba el mesero del pedido.  
**Valores:** `al_abrir_mesa` | `en_cada_envio` | `al_enviar_a_caja`.  
**Default:** `en_cada_envio` (el pedido queda del empleado que hizo el último envío a cocina).  
**Alcance:** **v1** `al_abrir_mesa` o `en_cada_envio`; `al_enviar_a_caja` opcional **v1**.

**Nombre:** `cancelar_linea_enviada`  
**Qué hace:** permite anular en sala una línea ya en cocina.  
**Default:** sí, con derecho básico+ y aviso a KDS. Bloqueado si el pedido ya está `en_caja`.  
**Cuándo cambiarla:** off si solo cocina puede desechar.  
**Efectos:** impresora de cancelación; inventario según 2.1 y 8.6.  
**Alcance:** **v1**.

**Nombre:** `editar_linea_enviada`  
**Qué hace:** cambiar cantidad/modificadores después de enviar.  
**Default:** no; hay que anular y crear línea nueva (comandas delta claras).  
**Cuándo cambiarla:** sí si el local prefiere “+1 igual” como recocina.  
**Efectos:** KDS debe entender deltas (+1 / −1), no solo tickets nuevos.  
**Alcance:** **posterior** (v1: anular + nueva).

**Nombre:** `editar_despues_de_precuenta`  
**Qué hace:** permitir añadir/quitar líneas tras emitir precuenta.  
**Default:** sí; invalida la precuenta anterior (hay que emitir otra antes de caja si `precuenta_obligatoria_antes_de_caja`).  
**Efectos:** la foto vieja no debe enviarse a caja.  
**Alcance:** **v1**.

**Nombre:** `editar_despues_de_enviar_caja`  
**Qué hace:** reabrir un pedido ya entregado a caja.  
**Default:** no.  
**Alcance:** **posterior** (recall + ACK inverso).

---

## 6. Presets de servicio (salón, para llevar, delivery)

Equivalente a *Presets* de Odoo: un pedido no es solo productos; tiene **tipo de servicio**.

### Funcionalidades

- Aplicar al pedido: lista de precios, posición fiscal (impuestos en la precuenta), nombre obligatorio, horario, capacidad de preparación.
- Filtrar comandas en KDS por preset (p. ej. delivery primero).

### Configuraciones

**Nombre:** `presets_activos`  
**Qué hace:** lista de tipos (Salón, Para llevar, Delivery, Members…).  
**Default restaurante:** Salón + Para llevar.  
**Cuándo cambiarla:** añadir Delivery cuando haya envíos.  
**Alcance:** **v1** Salón y Para llevar; Delivery **posterior**.

**Nombre:** `preset_por_defecto`  
**Qué hace:** el que se aplica al abrir mesa.  
**Default:** Salón. Pedido sin mesa → Para llevar.  
**Alcance:** **v1**.

**Nombre:** `impuestos_por_preset`  
**Qué hace:** p. ej. takeout con otra tasa **en la precuenta**. La factura fiscal sigue siendo de caja.  
**Default:** misma tasa hasta configurar.  
**Alcance:** **posterior** (v1: un impuesto simple o ninguno).

**Nombre:** `lista_precios_por_preset`  
**Qué hace:** recargo delivery, menú ejecutivo, etc.  
**Alcance:** **posterior**.

**Nombre:** `gestionar_por_horario`  
**Qué hace:** slots de pickup/delivery y capacidad de platos por franja.  
**Alcance:** **posterior**.

---

## 7. Preparación: KDS y comandas

### Funcionalidades

- Al **enviar** desde sala, se crea una **comanda** (no es el mismo documento que la precuenta).
- Enrutado por **categoría POS** a una o más estaciones (cocina, bar, postres).
- Pantalla de preparación: tarjetas con mesa, cubiertos, mesero, preset, timer, notas y modificadores.
- Etapas configurables (p. ej. Por cocinar → Listo → Servido).
- Marcar ítem o tarjeta completa; al completar todos los ítems, pasa de etapa.
- Recall (deshacer último avance), reset de completados, alertas por tiempo.
- Pedido para llevar: pantalla de **estado para el cliente** (listo / casi).
- Impresora de comanda **obligatoria en v1** para el ticket de cocina (además del KDS en pantalla): al enviar, reimpresión y ticket de anulación.

### Ciclo de la comanda (ítem enviado)

```
pendiente_disparo  →  por_preparar  →  listo  →  servido
         ↑ cursos no disparados (Fire course)
cancelado (en cualquier punto anterior a servido, con reglas)
```

- Primer curso se dispara al enviar el pedido (default).
- Cursos siguientes quedan `pendiente_disparo` hasta `Fire course N` en sala.

### Configuraciones

**Nombre:** `estaciones_preparacion`  
**Qué hace:** define pantallas (Cocina principal, Bar, …), POS de origen y categorías que reciben.  
**Default restaurante:** una estación Cocina (todas las categorías de comida) y opcional Bar (bebidas).  
**Cuándo cambiarla:** cocina fría/caliente, sushi, pastelería.  
**Efectos:** un mismo ítem puede ir a dos estaciones si comparte categorías; hay que evitar duplicar con categorías disjuntas.  
**Alcance:** **v1** una estación; multi-estación **v1** si hay bar+cocina, si no una sola.

**Nombre:** `etapas_kds`  
**Qué hace:** nombres, color, timer de alerta (minutos).  
**Default:** Por preparar (8 min) → Listo (5 min) → Servido.  
**Cuándo cambiarla:** barra más rápida; asador más lento.  
**Efectos:** no cambia inventario; cambia urgencia visual.  
**Alcance:** **v1**.

**Nombre:** `kds_marcar`  
**Qué hace:** si se avanza por ítem o solo por ticket completo.  
**Default:** por ítem y por tarjeta.  
**Alcance:** **v1**.

**Nombre:** `auto_limpiar_servidos`  
**Qué hace:** quita tarjetas servidas a los N minutos (y de la pantalla cliente).  
**Default:** 15 min.  
**Alcance:** **v1**.

**Nombre:** `cuando_enviar_a_kds`  
**Qué hace:** restaurante: al pulsar Enviar (consumo aún abierto). No está ligado al cobro.  
**Default restaurante:** al enviar.  
**Cuándo cambiarla:** solo si un perfil tipo retail quisiera preparar al cerrar consumo (no es el caso de este producto).  
**Efectos:** desacoplado de `politica_inventario`, pero la reserva suele ocurrir en el mismo instante.  
**Alcance:** **v1**.

**Nombre:** `impresoras_comanda`  
**Qué hace:** impresora por estación/categoría; al **enviar** imprime el ticket de comanda; reimpresión; ticket de anulación. El trabajo lo dispara el **servidor local**, no la tablet.  
**Default:** on. Hace falta al menos una impresora de cocina configurada (IP de red ESC/POS y/o USB en el PC servidor).  
**Si la impresora falla:** la comanda **sí** queda en KDS e inventario; el ticket se **encola** y se reintenta; aviso a cocina/avanzado. No se bloquea el salón.  
**Alcance:** **v1**.

**Nombre:** `pantalla_estado_cliente`  
**Qué hace:** display de retiro.  
**Alcance:** **posterior**.

**Nombre:** `avisos_sms_whatsapp`  
**Qué hace:** “pedido recibido / listo” al cliente.  
**Alcance:** **posterior**.

---

## 8. Productos, recetas (BOM) y modificadores

### Funcionalidades

- Productos de carta: nombre, precio (para precuenta), categoría POS, estación de preparación, impuestos, activo, disponible.
- Producto **simple** (si es almacenable, se descuenta él mismo: bebida embotellada).
- Producto **con receta / kit**: no se almacena el plato; se consumen componentes.
- Receta: lista de componentes, cantidad, unidad (g, ml, unidad, rodaja).
- Recetas anidadas (salsa que a su vez tiene BOM): el armable se resuelve en hojas. **v1:** un nivel; anidación **posterior**.
- **Armable** = mínimo entre componentes requeridos usando stock **disponible**.
- Modificadores: grupos (término, extras, “sin X”) que alteran precio y/o receta.

### 8.1 Configuraciones de producto

**Nombre:** `tipo_consumo`  
**Valores:** `no_almacenable` (servicio) | `almacenable_unitario` | `receta_kit`.  
**Default en platos:** `receta_kit`. Bebidas cerradas: `almacenable_unitario`.  
**Alcance:** **v1**.

**Nombre:** `categoria_pos`  
**Qué hace:** agrupa en el registro de sala y enruta a KDS/impresora.  
**Default:** Entradas, Principales, Postres, Bebidas.  
**Alcance:** **v1**.

**Nombre:** `disponible_en_pos`  
**Qué hace:** 86 del plato (ocultar o marcar agotado) sin borrar receta.  
**Default:** sí. El 86 manual convive con armable = 0.  
**Alcance:** **v1**.

**Nombre:** `umbral_aviso_armable`  
**Qué hace:** avisa en el POS de sala si armable ≤ N.  
**Default:** 3.  
**Alcance:** **v1**.

### 8.2 Receta

**Nombre:** `receta` (por producto)  
**Qué hace:** componentes y cantidades por 1 unidad vendida.  
**Ejemplo:** Hamburguesa = 1 pan + 150 g carne + 1 queso + 20 g lechuga.  
**Armable:** `min(pan/1, carne_g/150, queso/1, lechuga_g/20)` usando **disponible**.  
**Alcance:** **v1**.

**Nombre:** `escalado_por_cantidad`  
**Qué hace:** pedir 2 hamburguesas duplica componentes.  
**Default:** sí.  
**Alcance:** **v1**.

**Nombre:** `permitir_receta_vacia`  
**Qué hace:** plato sin BOM (no mueve ingredientes).  
**Default:** sí, con aviso en back-office (“sin control de stock”).  
**Alcance:** **v1**.

### 8.3 Modificadores

**Nombre:** `grupos_modificadores`  
**Qué hace:** p. ej. Término (1 obligatorio), Extras (0..n), Quitar (0..n).  
**Default restaurante:** activar modificadores.  
**Alcance:** **v1** (un conjunto pequeño en la carta demo).

**Nombre:** `modificador_efecto_receta`  
**Valores por modificador:**

| Efecto | Ejemplo | Impacto stock |
| --- | --- | --- |
| `agregar_componente` | Extra queso +1 | Suma al BOM de esa línea |
| `quitar_componente` | Sin cebolla | No reserva/descuenta ese componente |
| `sustituir_componente` | Pan integral por pan | Quita A, pone B |
| `solo_precio` | Término “azul” | Sin cambio de receta |
| `solo_nota` | “Alérgico sésamo” | Visible en KDS; sin stock |

**Default:** cada modificador declara su efecto; no hay “nota mágica” que descuente.

**Nombre:** `acreditar_ingrediente_quitado`  
**Qué hace:** “sin queso” ¿devuelve disponibilidad del queso?  
**Default restaurante:** sí (no se reserva lo que no se usa).  
**Cuándo cambiarla:** no, si el queso ya está puesto y se tira (entonces el 86 es merma, no modificador).  
**Efectos:** el armable de la **siguiente** hamburguesa puede subir si quitan queso en esta.  
**Alcance:** **v1**.

**Nombre:** `extra_usa_mismo_stock`  
**Qué hace:** extra queso consume del mismo producto-ingrediente.  
**Default:** sí.  
**Alcance:** **v1**.

**Nombre:** `modificador_obligatorio`  
**Qué hace:** no enviar a cocina sin elegir término / punto de pasta.  
**Default:** según grupo.  
**Alcance:** **v1**.

### 8.4 Productos compuestos / combos

**Nombre:** `combo`  
**Qué hace:** menú = varios platos, cada uno con su receta y estación.  
**Alcance:** **posterior** (v1: líneas sueltas).

### 8.5 Unidades

**Nombre:** `unidades_ingrediente`  
**Qué hace:** receta en g/ml y compra en kg/L; conversión.  
**Default v1:** trabajar en la unidad de receta (gramos) para no implementar un maestro UoM completo.  
**Alcance:** **v1** una unidad por ingrediente; conversiones **posterior**.

### 8.6 Cancelaciones, void y merma

**Nombre:** `politica_cancelacion_enviada`  
**Valores:**

| Valor | Inventario | KDS |
| --- | --- | --- |
| `liberar_si_no_listo` | Libera reserva (o devuelve stock en modo descuento-al-enviar) si la etapa es anterior a Listo | Quita o tacha la línea |
| `merma_si_listo_o_servido` | No devuelve; genera movimiento de merma | Marca cancelado/desperdicio |
| `siempre_merma` | Nunca devuelve (ya se consideró usado) | Igual |
| `siempre_devolver` | Siempre libera/devuelve | Igual |

**Default restaurante:** `liberar_si_no_listo` + `merma_si_listo_o_servido`.

**Cuándo cambiarla:** cocina que mise-en-place extrema → más merma; bar de latas → siempre devolver si no se abrió.

**Efectos:** reportes de merma vs consumo. El armable refleja la verdad operativa.

**Alcance:** **v1** esta política combinada.

**Nombre:** `anular_despues_de_enviar_caja`  
**Qué hace:** void del documento ya entregado a caja (derecho avanzado). Requiere coordinación con caja (ellos anulan el cobro si ya existió). Este POS no devuelve dinero. Inventario: reverse del firme o merma según 8.6.  
**Alcance:** **posterior**.

**Nombre:** `devolucion_ingredientes_por_cortesia`  
**Qué hace:** rehacer plato: segunda receta a merma + nueva reserva.  
**Alcance:** **posterior** (v1: nueva línea “cortesía” con precio 0 y receta igual). Precio 0 **v1** si hay descuento de línea (avanzado).

---

## 9. Inventario (operación diaria)

### Funcionalidades

- Existencias iniciales y ajustes (entrada de compra simplificada, merma, conteo).
- Consulta: a mano, reservado, disponible, armable por plato.
- El POS puede mostrar stock/armable en la tarjeta del producto.
- En el momento configurado (`politica_inventario`), las reservas pasan a **descuento firme**.
- Al cancelar, se libera o se manda a merma (8.6).

### Configuraciones

**Nombre:** `mostrar_stock_en_pos`  
**Qué hace:** enseña armable (y opcionalmente disponible de ingredientes clave).  
**Default restaurante:** mostrar armable, no el detalle de receta al comensal/mesero salvo toggle.  
**Cuándo cambiarla:** off si distrae; on en carta corta.  
**Alcance:** **v1** armable.

**Nombre:** `tipo_cifra_en_pos`  
**Valores:** `armable` | `disponible_producto` | `a_mano`.  
**Default:** `armable` para recetas, `disponible` para unitarios.  
**Alcance:** **v1**.

**Nombre:** `timeout_reserva_en_caja`  
**Qué hace:** si `firme_al_ack_caja` y no llega ACK, qué hacer con la reserva (mantener, firmar igual, alertar).  
**Default posterior:** alertar a avanzado; no firmar solos.  
**Alcance:** **posterior**.

**Nombre:** `compras`  
**Qué hace:** órdenes de compra a proveedor.  
**Alcance:** **posterior** (v1: ajuste manual de entrada).

**Nombre:** `multi_almacen` / `transferencias`  
**Alcance:** **posterior**.

**Nombre:** `inventario_negativo`  
**Qué hace:** si `bloqueo_sin_stock=permitir`, el disponible puede quedar negativo.  
**Default:** sí, con registro de quiebre.  
**Alcance:** **v1**.

---

## 10. Cursos (tiempos)

### Funcionalidades

- Partir el pedido en tiempos (entrada, fondo, postre).
- Enviar dispara el **curso 1**.
- Sala ejecuta `Fire course 2…` cuando toca.
- KDS muestra pendientes con etiqueta “Pendiente” hasta el disparo.
- Mover un plato de un curso a otro antes de enviar.

### Configuraciones

**Nombre:** `cursos_activos`  
**Qué hace:** habilita tiempos.  
**Default restaurante:** sí.  
**Cuándo cambiarla:** off en barra/qsr.  
**Alcance:** **v1**.

**Nombre:** `asignacion_automatica_curso`  
**Qué hace:** la categoría POS coloca el ítem en un curso (entradas→1, principales→2, postres→3). El mesero puede override.  
**Default:** sí, con override.  
**Alcance:** **v1**.

**Nombre:** `disparo_primer_curso_al_enviar`  
**Qué hace:** el primer tiempo sale solo al Send.  
**Default:** sí.  
**Cuándo cambiarla:** off si el mesero debe disparar también el primero (servicio muy controlado).  
**Alcance:** **v1**.

**Nombre:** `nombres_cursos`  
**Default:** Tiempo 1 / 2 / 3 o Entrada / Fondo / Postre.  
**Alcance:** **v1**.

---

## 11. Transferir, unir, partir consumo

Split, merge y transfer operan sobre **consumo abierto**, no sobre un cobro. Deben ocurrir **antes** de un envío a caja (y, si la precuenta está vigente, suelen exigir nueva precuenta).

### Funcionalidades

- **Transferir:** mesa origen → destino libre (clientes + pedido).
- **Unir:** destino ocupado; se fusionan líneas (comandas ya enviadas siguen con referencia; la mesa visible es la destino).
- **Partir consumo:** sub-pedido por ítems (o por asiento, posterior). Cada sub-pedido tiene su precuenta y su envío a caja. El resto sigue en la mesa.
- Transferir ítems o un curso a otra mesa (**posterior**).

### Configuraciones

**Nombre:** `permitir_transferir`  
**Default:** sí, si el pedido no está `en_caja`.  
**Alcance:** **v1**.

**Nombre:** `permitir_unir`  
**Default:** sí, si ninguno está `en_caja`.  
**Efectos:** un solo documento de consumo hacia caja; mesero: se conserva el de la mesa destino o se pide elegir (`mesero_al_unir`).  
**Alcance:** **v1**.

**Nombre:** `partir_consumo`  
**Qué hace:** split por producto (análogo a Odoo *Allow Bill Splitting*, sin cobro).  
**Default restaurante:** sí.  
**Efectos:** crea sub-orden; esa parte puede ir a precuenta/caja mientras el resto sigue abierto. Inventario: reservas se reparten con las líneas; el firme ocurre por sub-orden al enviarla a caja (default).  
**Alcance:** **v1** split por ítems; por asiento / partes iguales **posterior**.

**Nombre:** `split_despues_de_precuenta`  
**Qué hace:** partir después de haber impreso precuenta de la mesa entera.  
**Default:** sí; invalida esa precuenta.  
**Alcance:** **v1**.

**Nombre:** `transferir_item_o_curso`  
**Alcance:** **posterior**.

---

## 12. Empleados e identidad (sala)

Inspirado en *Log in with Employees* de Odoo. No sustituye a la estación cocina ni crea un “cajero” en este producto.

### Funcionalidades

- Abrir el POS exige empleado autorizado (si la opción está on).
- Login: PIN, badge/código, o lista de nombres + PIN si tiene PIN.
- Cambio de empleado en caliente; bloqueo (lock) del terminal.
- **Clave (PIN) otra vez** antes de **enviar a cocina** y antes de **emitir precuenta**, aunque la sesión esté abierta. Así no se manda comida ni se imprime consumo con la sesión de otro.
- El empleado que pasó el PIN queda asociado al pedido / a ese envío / a esa precuenta.
- Tres niveles de derecho sobre **el mismo** POS de salón, no “rol cocina” ni “rol caja”.

### Niveles de derecho (Odoo-like)

| Nivel | Puede | No puede (salvo que se abra después) |
| --- | --- | --- |
| **Mínimo** | Ver pedidos, bloquear/desbloquear, reimprimir precuentas ya emitidas, consultar | Anular enviados, descuentos, enviar a caja, ajustes de stock |
| **Básico** | Tomar pedidos, enviar comandas, transferir/unir, partir consumo, notas, cancelar no enviado, **emitir precuenta** | Enviar a caja (si `enviar_a_caja_requiere_avanzado`), void hacia caja, cambiar precios a mano, 86 masivo |
| **Avanzado** | Todo lo básico + descuentos libres, anular enviado, enviar a caja, ajustes, configurar (o ir a back-office) | Cobrar dinero (nadie en este sistema) |

Cocina en KDS **no usa estos niveles** en v1: la pantalla de estación está abierta. Identidad de cocinero **posterior**. El cajero vive en el sistema de caja.

### Configuraciones

**Nombre:** `login_con_empleados`  
**Qué hace:** obliga identificación en el POS de sala.  
**Default restaurante:** sí.  
**Cuándo cambiarla:** off en local de un solo operador.  
**Efectos:** sin esto no hay “quién tomó el pedido”.  
**Alcance:** **v1**.

**Nombre:** `metodos_login`  
**Valores:** PIN, lista+PIN, badge.  
**Default v1:** lista de meseros + PIN numérico.  
**Alcance:** **v1** PIN; badge **posterior**.

**Nombre:** `empleados_minimos` / `basicos` / `avanzados`  
**Qué hace:** asignación de personas a niveles. Vacío en mínimos/básicos = todos los empleados pueden entrar (patrón Odoo).  
**Default:** al menos un avanzado (dueño) y meseros básicos.  
**Alcance:** **v1**.

**Nombre:** `pin_obligatorio`  
**Qué hace:** aunque elijan el nombre, piden PIN.  
**Default:** sí.  
**Alcance:** **v1**.

**Nombre:** `bloqueo_inactividad_seg`  
**Qué hace:** lock automático del terminal.  
**Default:** 60 s.  
**Cuándo cambiarla:** 0 en barra de un solo operador.  
**Alcance:** **v1**.

**Nombre:** `pin_al_enviar`  
**Qué hace:** antes de **Enviar** a cocina (comanda + papel), pide el PIN. Si el terminal está bloqueado, primero lista + PIN. Derecho mínimo: no puede enviar.  
**Default restaurante:** sí.  
**Efectos:** el mesero del envío es quien acertó el PIN. PIN incorrecto: no se envía, no se imprime.  
**Alcance:** **v1**.

**Nombre:** `pin_al_emitir_precuenta`  
**Qué hace:** igual, antes de **emitir precuenta** (documento + papel). Reimprimir una precuenta **ya emitida** sigue permitido a mínimo+ **sin** nuevo PIN (solo consulta/papel de lo ya validado). Nueva emisión sí pide PIN.  
**Default restaurante:** sí.  
**Alcance:** **v1**.

**Nombre:** `pin_al_enviar_caja`  
**Qué hace:** el avanzado confirma con PIN al hacer el handoff a caja.  
**Default:** sí.  
**Alcance:** **v1**.

Cargar líneas en la mesa **no** pide PIN en cada plato (la sesión desbloqueada basta). Los actos que salen a cocina o al cliente **sí**.

**Nombre:** `cocina_requiere_login`  
**Qué hace:** KDS con empleado.  
**Default:** no.  
**Alcance:** **posterior**.

---

## 13. Precuenta y envío a caja (handoff)

Este capítulo sustituye cualquier “caja, pagos, propinas y cierre” **dentro** de este producto. El dinero no entra.

### 13.1 Precuenta

**Qué es:** un **documento-instantánea** del consumo de la mesa (o del sub-pedido partido): líneas, cantidades, modificadores, precios, impuestos de precuenta, mesero, mesa, cubiertos, notas visibles al cliente, totales. No es un pago. No abre cajón.

### Funcionalidades

- Emitir precuenta (pantalla **y papel**). El servidor local imprime el ticket para el cliente.
- Reimprimir la última precuenta **sin** nuevo asiento de inventario y **sin** nuevo número si no cambió el consumo (`reimpresion` vs `nueva_emision` si el consumo cambió).
- Si el consumo cambia después, la precuenta anterior queda **obsoleta**; hay que emitir otra.
- El cliente valida el consumo. Aún no hay handoff a caja.

### Configuraciones

**Nombre:** `precuenta_activa`  
**Qué hace:** habilita el documento.  
**Default:** sí (sin esto no hay validación de consumo).  
**Alcance:** **v1**.

**Nombre:** `mostrar_precios_en_precuenta`  
**Qué hace:** lista con precios y total, o solo cantidades (poco habitual).  
**Default:** con precios y total.  
**Alcance:** **v1**.

**Nombre:** `impresora_precuenta`  
**Qué hace:** impresora de ticket de precuenta (papel para el cliente; opcionalmente la misma máquina que cocina, o una de sala). El **servidor local** imprime al emitir y al reimprimir.  
**Default:** on. Hay que configurar destino (IP ESC/POS y/o USB en el PC servidor). Puede ser la **misma** impresora que comandas en un local chico, o otra.  
**Si falla:** el documento de precuenta **sí** queda emitido (pantalla); el papel se encola y se reintenta. No se bloquea el salón. No hay asiento de inventario extra.  
**Alcance:** **v1**.

**Nombre:** `reimprimir_precuenta`  
**Qué hace:** permite reimpresión (mínimo+).  
**Default:** sí.  
**Efectos:** no duplica inventario ni crea segundo handoff.  
**Alcance:** **v1**.

### 13.2 Enviar a caja

**Qué es:** el **handoff**. Este POS entrega a caja el consumo validado (la última precuenta vigente, o un snapshot equivalente). La mesa/pedido pasa a `en_caja`. Caja, fuera de aquí, cobra.

### Funcionalidades

- Enviar a caja un pedido o un sub-pedido partido.
- Dejar el pedido inmutable en este POS.
- Emitir el documento hacia `destino_caja`.
- (Posterior) recibir ACK de cerrado / rechazado.

### Configuraciones

**Nombre:** `enviar_a_caja_requiere_avanzado`  
**Qué hace:** solo derecho avanzado entrega a caja.  
**Default restaurante:** sí.  
**Cuándo cambiarla:** off si el mesero básico también cierra el servicio hacia caja.  
**Efectos:** el básico imprime precuenta; el capitán/avanzado hace el handoff.  
**Alcance:** **v1**.

**Nombre:** `precuenta_obligatoria_antes_de_caja`  
**Qué hace:** no se puede enviar a caja sin una precuenta **vigente** (no obsoleta).  
**Default restaurante:** sí.  
**Cuándo cambiarla:** off en barra ultra rápida (el snapshot se genera al vuelo al enviar a caja).  
**Efectos:** obliga al cliente a ver el consumo antes del handoff.  
**Alcance:** **v1**.

**Nombre:** `lineas_sin_enviar_al_enviar_caja`  
**Qué hace:** si quedan líneas no enviadas a cocina.  
**Valores:** `bloquear` | `enviar_cocina_y_caja` | `permitir_sin_cocina`.  
**Default:** `bloquear` (no cerrar consumo con comida no comandada).  
**Alcance:** **v1**.

**Nombre:** `formato_documento_caja`  
**Qué hace:** qué recibe caja (número de mesa, mesero, líneas, totales, id de precuenta).  
**Default:** snapshot completo de la precuenta vigente.  
**Alcance:** **v1** contenido; esquema de integración **posterior**.

**Nombre:** `propinas`  
**Qué hace:** línea de propina **en la precuenta** (sugerida) para que caja la cobre. Este POS no la recauda.  
**Default:** off en v1.  
**Alcance:** **posterior**.

**Nombre:** `descuentos`  
**Qué hace:** % o monto por línea o cuenta en el consumo; quién puede (básico vs avanzado). Queda reflejado en precuenta.  
**Default v1:** % o precio 0 (cortesía) solo avanzado.  
**Alcance:** **v1** mínimo.

**Nombre:** `factura_electronica`  
**Qué hace:** boleta o factura **ante el SII** (DTE). La emite **caja** (u otro facturador certificado), no este POS. La precuenta de este sistema **no** es boleta ni factura: no lleva folio SII.  
**Alcance:** **fuera de v1**; **posterior** como dato enviado a caja (consumo ya validado). En Chile el SII se informa al **cobrar/documentar la venta**, no al enviar a cocina ni al imprimir precuenta.

No hay configuraciones de medios de pago, cajón, arqueo, fondo, cash in/out ni “cobro simulado”.

---

## 14. Impuestos y precios

Los precios e impuestos existen para que la **precuenta** coincida con lo que caja va a cobrar. Este POS no es el emisor fiscal.

**Nombre:** `impuestos_activos`  
**Default v1:** precio incluye impuesto o un IVA único, según país al implementar; no mezclar presets.  
**Alcance:** **v1** un esquema simple; por preset **posterior**.

**Nombre:** `listas_de_precios`  
**Qué hace:** happy hour, delivery, members.  
**Alcance:** **posterior**.

**Nombre:** `precio_manual`  
**Qué hace:** el avanzado pisa el precio (queda en precuenta).  
**Default:** no, salvo avanzado.  
**Alcance:** **posterior**.

---

## 15. Impresión y hardware (visión)

| Configuración | Qué hace | Alcance |
| --- | --- | --- |
| Impresora de comanda (red ESC/POS / USB en el PC servidor) | Ticket cocina al enviar, reimpresión, anulación | **v1** |
| Impresora de precuenta (red ESC/POS / USB en el PC servidor) | Papel para el cliente al emitir/reimprimir | **v1** |
| Visor / PDF de precuenta | Misma foto en pantalla; respaldo si se quiere ver en el navegador | v1 |
| Cajón portamonedas | **No aplica** — no es de este producto | fuera |
| Terminal de tarjeta / mixto | **No aplica** — es de caja | fuera |
| Visor cliente de sala | Total de consumo (no cobro) | posterior |
| Lector badge / código | Login y productos | posterior |

v1: POS + KDS en pantalla, **comanda en papel** y **precuenta en papel**. El hardware de **dinero** (cajón, datáfono) no entra.

---

## 16. Reservas, autoservicio, delivery externo

| Capacidad | Qué hace | Alcance |
| --- | --- | --- |
| Bookings sobre mesas | Recursos, capacidad, late, no-show, unir mesas para grupo | posterior |
| QR / self-order | El comensal pide; entra al mismo flujo de comanda, inventario, precuenta y caja | posterior |
| Kiosco | Preset takeout; precuenta; handoff a caja | posterior |
| UrbanPiper / aggregators | Pedidos Rappi/etc. al POS | posterior |
| Ship later / cotizaciones | Retail, no restaurante núcleo | posterior |

---

## 17. Informes (visión para el dueño)

No son operación en vivo, pero justifican identidad de mesero e inventario. No hay informe de arqueo.

| Informe | Para qué | Alcance |
| --- | --- | --- |
| Mesas abiertas / tiempo de ocupación | Salón | v1 (lista operativa) |
| Comandas pendientes y tiempo KDS | Cocina | v1 |
| Armable y quiebres | Carta | v1 |
| Precuentas emitidas vs enviadas a caja | Handoff | v1 |
| Consumo por mesero (no “ventas cobradas”) | Identidad | posterior |
| Merma vs consumo | Receta | posterior |
| Productos / categorías | Carta | posterior |

---

## 18. Matriz v1 vs posterior (resumen)

### v1 — el dueño ya configura esto

- POS restaurante, un piso, mesas, pedido con/sin mesa, cubiertos.
- Dos estaciones: **sala** (POS) y **cocina** (KDS **y** impresora de comanda). Bar como segunda estación/impresora si hace falta.
- Login de mesero con PIN y derechos mínimo / básico / avanzado. **PIN otra vez** al enviar a cocina, al emitir precuenta y al enviar a caja.
- Mesero grabado en el pedido.
- Envío parcial a cocina, notas, cancelación de línea no enviada y enviada (KDS + ticket de anulación en papel).
- Política de inventario **configurable**. Default: **reserva al enviar a cocina, firme al enviar a caja**.
- Cifras: a mano, reservado, disponible, armable.
- Recetas de un nivel, modificadores que suman/quitan componente o son nota/precio.
- Cancelación: libera si no está listo; merma si ya está listo/servido.
- Cursos con disparo del primero al enviar.
- Transferir, unir, partir consumo **antes** del handoff.
- Presets Salón y Para llevar.
- Precuenta **en papel** (y en pantalla), reimprimible; envío a caja (avanzado por default; precuenta vigente obligatoria).
- Liberar mesa al enviar a caja (configurable a manual).
- Aviso/bloqueo por armable.
- **Impresora de comanda** y **impresora de precuenta** en papel (pueden ser el mismo equipo).
- **Fuera de v1 y del producto:** cajón, medios de pago, arqueo, cobro.

### Posterior — listado para no sorprender

- ACK de caja: firme de inventario y/o liberación de mesa al confirmar cierre.
- Recall del pedido desde caja; anular después del handoff.
- Multi-almacén, compras, UoM, recetas anidadas, combos.
- Badge.
- Reservas, QR, delivery, pantalla cliente, SMS.
- Split por asiento, transferir ítem/curso, editar línea enviada con deltas.
- Impuestos/listas por preset, happy hour, propina sugerida en precuenta.
- Login en KDS, mesero por línea, rehacer plato con merma.
- Informes de comisión y merma.
- Conector real a un software de caja / factura electrónica (caja sigue cobrando).

---

## 19. Recorrido operativo mínimo (para leer el catálogo)

1. Dueño carga ingredientes, recetas, mesas y meseros (PIN + derecho).
2. Mesero básico se identifica, abre mesa, elige preset Salón, anota cubiertos.
3. Carga líneas y modificadores; el POS muestra armable.
4. Envía a cocina: **introduce su PIN**; KDS recibe la comanda del tiempo 1; **se imprime el ticket**; inventario **reserva** ingredientes (default).
5. Cocina marca listo / servido.
6. Mesero dispara tiempo 2 si aplica.
7. Opcional: partir consumo; cada parte sigue su precuenta.
8. Mesero **pone su PIN** y emite **precuenta**: **se imprime el papel** para el cliente; queda también en pantalla. Se puede reimprimir (sin nuevo inventario si no cambió el consumo; reimpresión sin PIN). El stock sigue **reservado**. La mesa sigue ocupada.
9. Si piden algo más: nuevas líneas, nueva precuenta.
10. Avanzado **envía a caja**: este POS hace el handoff, **firma** el inventario (default) y **libera la mesa** (default). El cliente paga **en caja**, fuera de esta app.
11. Si anula un fondo aún “por preparar”, se libera reserva, KDS se actualiza y **sale ticket de anulación**; si ya estaba listo, va a merma.

Eso es el núcleo profesional. El resto son interruptores sobre este circuito.

### Ejemplo (una ronda)

Mesa 7 pide **5 hamburguesas, 2 jugos y 3 aguas con gas**.

1. En el plano, el mesero toca **mesa 7** (si el terminal está bloqueado, **lista + PIN** al desbloquear: ya está identificado para operar).
2. Carga las cantidades (5 / 2 / 3). **No** pide PIN en cada plato.
3. **Enviar:** teclado PIN (aunque la sesión estuviera abierta). Si el PIN falla, no sale comanda ni papel.
4. Cocina: KDS + **ticket de papel** con mesa 7, las 10 líneas (o agrupadas), nombre del mesero que confirmó.
5. Cuando el cliente pide la cuenta: **PIN** otra vez → se **imprime la precuenta** en papel (5 hamburguesas, 2 jugos, 3 aguas, totales) con el mesero que confirmó esa emisión. Eso **no** es la boleta del SII.
6. En **caja** (otro sistema, **después**): el cliente paga y ahí sale **boleta o factura electrónica** al SII.

Identificarse al abrir la mesa **o** al pulsar Enviar: las dos valen; lo que no vale es mandar a cocina o imprimir precuenta **sin** mesero.

---

## 20. Decisiones ya cerradas en este catálogo

- Producto profesional y **configurable**; el cliente decide.
- Este producto **no cobra** ni gestiona cajón. Precuenta + envío a caja.
- **Boleta/factura SII (Chile):** no en v1. Las emite **caja después**. La precuenta no es un DTE.
- Default de inventario: reserva al enviar a cocina, **firme al enviar a caja**; no es el único modo.
- Default de mesa: **libre al enviar a caja**; alternativa manual en v1 y ACK de caja después.
- Sala y cocina son estaciones; el PIN es identidad en sala, no “login cocina”. **Enviar comanda** y **emitir precuenta** exigen PIN en el acto (v1).
- La **comanda** y la **precuenta** se imprimen en **papel** (servidor local → impresoras ESC/POS). El KDS y la pantalla conviven; no sustituyen el ticket.
- v1 no es un CLI de usar y tirar; este documento es el mapa de producto. La interfaz de v1 se decidirá después (web POS + KDS, no catálogo técnico aquí).

---

*Fin del catálogo. Confirmar defaults de inventario firme y liberación de mesa antes de bajar a diseño de pantallas o implementación.*
