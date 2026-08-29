# Especificación de jerarquía, semántica y tamaños de interfaz

**Producto:** Sistema de gestión de restaurante  
**Dirección visual:** Turno  
**Enfoque de experiencia:** Transaction-first  
**Estado:** Especificación de diseño previa a implementación  
**Alcance prioritario:** Mesas, nueva orden, cuenta, cocina y caja

## 1. Propósito

Este documento define qué elementos deben existir en las pantallas operativas, cuál debe ser su tamaño y cuándo deben representarse como texto, botón, enlace, campo, tarjeta, pestaña o indicador de estado.

La interfaz se organiza alrededor de la transacción principal, no alrededor de todas las funciones disponibles:

```text
Mesero: elegir mesa → agregar productos → ajustar cantidades → revisar → enviar
Cocina: detectar pedido → preparar → marcar avance → completar
Caja: localizar cuenta → revisar → cobrar → confirmar
```

Las funciones que no ayudan directamente al paso actual deben perder jerarquía o aparecer bajo demanda.

## 2. Fuentes y criterios normativos

Esta especificación combina:

- **ISO 9241-210:** diseño centrado en las personas, sus tareas y su contexto real de uso. Referencia: <https://www.iso.org/standard/77520.html>.
- **WCAG 2.2:** contraste, foco visible, navegación y tamaño mínimo de objetivos interactivos. Referencia: <https://www.w3.org/TR/WCAG22/>.
- **Objetivos táctiles:** WCAG fija un mínimo de 24 × 24 px con excepciones; para este POS se adopta 44–48 px para acciones frecuentes porque se usará con rapidez y posiblemente con pantalla táctil. Referencia: <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html>.
- **Divulgación progresiva:** opciones excepcionales como notas, filtros avanzados o anulaciones aparecen cuando el usuario las solicita.
- **Responsive por composición:** la pantalla no se reduce proporcionalmente; reorganiza columnas, paneles y prioridades según el espacio disponible.

## 3. Enfoque de decisión

El tamaño de un elemento se decide evaluando cuatro variables:

| Variable | Pregunta | Efecto en la jerarquía |
|---|---|---|
| Frecuencia | ¿Cuántas veces se usa durante una transacción? | Más frecuencia implica mayor accesibilidad y visibilidad. |
| Importancia | ¿Es imprescindible para completar el flujo? | Las acciones necesarias permanecen visibles. |
| Urgencia | ¿Debe encontrarse sin explorar la pantalla? | Mayor urgencia implica posición estable y contraste. |
| Riesgo | ¿Un toque accidental genera pérdida, cobro o anulación? | Mayor riesgo exige separación, confirmación y un estilo inequívoco; no necesariamente mayor tamaño. |

### 3.1 Matriz práctica

| Frecuencia | Importancia | Tratamiento |
|---|---|---|
| Alta | Alta | Grande, visible y en posición estable. Ej.: producto, cantidad, enviar a cocina. |
| Alta | Media | Mediano y próximo al contenido. Ej.: categorías, selector de mesa. |
| Baja | Alta | Visible, pero separado del flujo frecuente. Ej.: anular orden. |
| Baja | Baja | Compacto y bajo demanda. Ej.: nota, filtro avanzado, configuración. |

### 3.2 Tamaño visual y tamaño interactivo no son lo mismo

Un icono puede medir 18–20 px, pero su botón debe conservar un área pulsable de 40 px con puntero y 46 px con pantalla táctil. Nunca se reduce el área interactiva solo porque la representación visual sea pequeña.

## 4. Reglas semánticas: texto o control

| Necesidad | Elemento correcto | Justificación |
|---|---|---|
| Comunicar un título o una cifra sin interacción | Texto (`h1`, `h2`, `p`, `strong`) | El texto no debe parecer pulsable si no realiza una acción. |
| Ejecutar una acción en la pantalla | Botón (`button`) | “Agregar”, “Enviar”, “Cobrar” y “Cancelar” cambian el estado del sistema. |
| Ir a otra pantalla o dirección | Enlace (`a`) | La navegación debe conservar la semántica del navegador. |
| Elegir una vista dentro de la misma pantalla | Pestaña (`button` dentro de `tablist`) | Categorías y pisos cambian un conjunto visible, no navegan a un documento nuevo. |
| Introducir datos libres | Campo (`input` o `textarea`) con etiqueta | Es información editable; la etiqueta explica qué se espera. |
| Mostrar un estado | Badge o texto de estado | “Libre”, “En cocina” o “Atrasado” informan; no son acciones por sí mismos. |
| Seleccionar una entidad visual | Botón con apariencia de tarjeta | Mesas y productos completos son objetivos interactivos; toda la superficie debe responder. |
| Abrir una opción excepcional | Botón secundario | “+ Nota” o “Filtros” revelan controles que no deben ocupar espacio permanentemente. |
| Mostrar ayuda | Texto secundario | La ayuda explica, no compite con la operación ni debe simular un control. |

### 4.1 Reglas obligatorias

- No usar un `div` clicable cuando corresponde un botón.
- No convertir títulos, estados o cifras en botones si no ejecutan una acción.
- No usar un botón para navegación entre páginas cuando corresponde un enlace.
- Los botones de icono deben tener nombre accesible (`aria-label` o texto visible).
- El color nunca será el único indicador de estado; debe existir una palabra, icono o forma adicional.
- Un badge informa. Si al pulsarlo debe filtrar, pasa a ser un botón con apariencia de filtro.

## 5. Escala global

### 5.1 Espaciado

Se utilizará una retícula base de 4 px:

| Token | Tamaño | Uso |
|---|---:|---|
| `space-1` | 4 px | Separación interna entre icono y dato muy relacionado. |
| `space-2` | 8 px | Separación normal entre controles hermanos. |
| `space-3` | 12 px | Padding compacto y separación de líneas. |
| `space-4` | 16 px | Padding normal de tarjetas y grupos. |
| `space-6` | 24 px | Separación entre secciones. |
| `space-8` | 32 px | Separación excepcional entre bloques principales. |

No deben introducirse valores arbitrarios si uno de estos resuelve la composición.

### 5.2 Tipografía

| Elemento | Tamaño | Peso | Justificación |
|---|---:|---:|---|
| Título principal de pantalla | 28–34 px escritorio; 24 px móvil | 600–700 | Identifica el contexto, pero no debe desplazar contenido operativo. |
| Título de panel | 20–22 px | 600 | Separa catálogo, orden, cuenta o cocina. |
| Nombre de producto o mesa | 15–17 px | 600 | Es información primaria repetida y debe leerse rápidamente. |
| Texto normal | 14–16 px | 400–500 | Equilibra densidad y legibilidad. |
| Precio o total destacado | 18–24 px | 600–700 | Es una cifra crítica de la transacción. |
| Texto secundario | 12–13 px | 400–500 | Código, asientos, mesero o ayuda breve. |
| Badge de estado | 12 px | 500–600 | Complementa el elemento principal sin dominarlo. |
| Eyebrow o sección | 11–12 px | 600 | Solo cuando aporta orientación; debe evitarse si repite el título. |

No se usará texto menor de 12 px para información operativa.

### 5.3 Controles

| Control | Puntero | Táctil | Uso |
|---|---:|---:|---|
| Botón normal | 40 px | 46–48 px | Acciones habituales. |
| Botón compacto | 34–36 px | 40–44 px | Filtros o acciones secundarias con espacio suficiente. |
| Botón principal | 48 px | 52–56 px | Enviar a cocina, cobrar, confirmar. |
| Botón solo icono | 40 × 40 px | 46 × 46 px | Buscar, cerrar, editar; icono visual de 18–20 px. |
| Input/select | 40 px | 46–48 px | Campos visibles del flujo. |
| Textarea | 80–112 px cuando está abierto | 88–120 px | Solo para texto multilínea solicitado explícitamente. |
| Checkbox/switch | Área pulsable mínima 40 px | Área pulsable mínima 46 px | Preferencias binarias; el control visual puede ser menor. |

## 6. Responsive

| Rango funcional | Composición |
|---|---|
| Escritorio amplio, desde 1200 px | Tres zonas: navegación/categorías, contenido principal y resumen. |
| Tablet horizontal, 768–1199 px | Dos zonas; categorías horizontales o compactas y resumen más estrecho. |
| Móvil o tablet vertical, menos de 768 px | Una zona; resumen como panel inferior y navegación adaptada. |
| Entrada táctil (`pointer: coarse`) | Controles de 46–48 px aunque el ancho de pantalla sea grande. |

Los breakpoints responden a cuándo deja de caber la tarea, no a modelos específicos de dispositivos.

## 7. Pantalla Mesas

### 7.1 Jerarquía

1. Mesas y su estado.
2. Piso o zona actual.
3. Nueva orden y búsqueda por número.
4. Resumen de libres/ocupadas.
5. Últimos pedidos y atrasados, colapsables.

### 7.2 Elementos

| Elemento | Semántica | Tamaño | Justificación |
|---|---|---|---|
| Plano del salón | Región visual principal | Todo el espacio restante; mínimo 60% del alto útil | Elegir mesa es la tarea principal. |
| Mesa | Botón con apariencia de objeto | 80–160 px según espacio; mínimo interactivo 64 × 64 px | Debe reconocerse y pulsarse rápidamente. Escala sin crecer indefinidamente. |
| Número de mesa | Texto dentro del botón | 15–17 px, peso 600 | Es el identificador primario. |
| Estado de mesa | Badge dentro del botón | 12 px | Informa sin competir con el número. |
| Asientos | Texto secundario | 12–13 px | Es útil, pero no decide normalmente la siguiente acción. |
| Tiempo de ocupación | Texto o badge de estado | 12–13 px | Gana visibilidad solo cuando existe espera relevante. |
| Selector de piso | Pestañas | 34–40 px; táctil 44 px | Cambia el conjunto de mesas visible. |
| Nueva orden | Botón normal destacado | 40–48 px; icono + texto | Es importante, pero la mesa continúa siendo el acceso principal. |
| Buscar mesa | Botón de icono | 40/46 px | La búsqueda es una ayuda, no la protagonista. |
| Campo “Mesa #” | Input temporal | 120–160 px de ancho; 40/46 px de alto | Aparece al pulsar buscar y se cierra al confirmar o cancelar. |
| Libres/ocupadas | Texto con cifra | Bloque compacto de 64–96 px de ancho | Sirve como resumen, no como acción. |
| Últimos/atrasados | Botón de filtro o panel colapsable | 34–40 px cerrado | No debe reducir permanentemente el plano. |

### 7.3 Adaptación de las mesas

- Con plano libre, las coordenadas y dimensiones se guardan normalizadas y se escalan usando el tamaño disponible del contenedor.
- El escalado debe mantener proporciones y aplicar límites mínimo/máximo.
- Una mesa no debe crecer solo porque haya pocas mesas; el espacio libre también comunica la distribución del salón.
- En pantallas estrechas donde el plano deja de ser legible, se cambia a una cuadrícula de dos columnas; no se intenta conservar posiciones absolutas ilegibles.
- Las formas redonda, cuadrada o rectangular deben conservarse después del escalado.

## 8. Pantalla Nueva orden

### 8.1 Distribución de escritorio

```text
┌──────────────┬──────────────────────────────────┬──────────────────┐
│ Categorías   │ Productos                        │ Orden actual     │
│ 160–200 px   │ flexible                         │ 320–360 px       │
│              │                                  │ total + enviar   │
└──────────────┴──────────────────────────────────┴──────────────────┘
```

El catálogo recibe el mayor ancho porque agregar y quitar productos es la actividad dominante.

### 8.2 Elementos del catálogo

| Elemento | Semántica | Tamaño | Justificación |
|---|---|---|---|
| Mesa actual | Texto contextual | 16–20 px | Informa dónde se cargará la orden; no es botón si la mesa es fija. |
| Cambiar mesa | Botón secundario o select | 40/46 px | Solo aparece cuando la operación permite cambiarla. |
| Categoría | Pestaña/botón de filtro | 36–40 px; táctil 44–46 px | Filtra productos y debe mostrar claramente el estado seleccionado. |
| Buscar | Botón de icono inicialmente | 40/46 px | Evita una barra vacía permanente. |
| Campo de búsqueda abierto | Input | 220–300 px escritorio; ancho disponible móvil | Es temporal; Escape o X lo cierran y limpian. |
| Tarjeta de producto | Botón/tarjeta interactiva | 140–190 px de ancho; 104–144 px de alto | Toda la tarjeta agrega o configura el producto. |
| Foto de producto | Imagen informativa | 48–72 px o fondo parcial de tarjeta | Ayuda al reconocimiento, pero no debe desplazar nombre, precio ni cantidad. |
| Nombre de producto | Texto primario | 15–16 px, 2 líneas máximo | Es el dato que el mesero busca. |
| Precio | Texto destacado | 14–16 px, peso 600 | Debe verse antes de agregar, sin superar al nombre. |
| Código | Texto secundario | 12 px | Útil para búsqueda o identificación, no para decisión visual principal. |
| Cantidad | Texto numérico | 16–18 px, peso 700 | Muestra el resultado inmediato de la interacción. |
| Restar/agregar | Botones de icono | 40/46 px cada uno | Son acciones frecuentes; `−` y `+` deben estar separados y tener etiquetas accesibles. |
| “Personalizable” | Badge | 12 px | Informa que tocar abrirá opciones antes de agregar. |

### 8.3 Comportamiento de la tarjeta de producto

- Primer toque en un producto simple: agrega una unidad inmediatamente.
- Al quedar seleccionado: aparecen `− cantidad +` sin tapar nombre ni precio.
- Producto configurable: abre primero las opciones requeridas; no agrega una combinación incompleta.
- No mostrar permanentemente botones “Agregar” en todas las tarjetas si tocar la tarjeta ya realiza esa acción.
- La respuesta debe ser visible de inmediato mediante cantidad, estado seleccionado y actualización del resumen.

## 9. Resumen de orden

| Elemento | Semántica | Tamaño | Justificación |
|---|---|---|---|
| Panel de orden | Región complementaria | 320–360 px escritorio | Permanece visible sin quitar el protagonismo al catálogo. |
| Línea de producto | Grupo informativo con controles | 52–72 px de alto | Debe permitir leer, ajustar y eliminar sin tarjetas excesivas. |
| Nombre y variante | Texto | 14–15 px; variante 12–13 px | Nombre primario, personalización subordinada. |
| Cantidad de línea | Texto + botones | Botones 34–40 px; táctil 44 px | En el resumen puede ser un poco más compacto que en el catálogo. |
| Eliminar línea | Botón de icono destructivo discreto | 40/46 px | Es menos frecuente y riesgoso; no debe competir con agregar. |
| Subtotal | Texto numérico | 14–16 px | Informa el valor de cada línea. |
| Total | Texto destacado | 22–28 px, peso 700 | Es una cifra crítica antes de enviar o cobrar. |
| Enviar a cocina | Botón principal persistente | 48 px puntero; 52–56 px táctil; ancho completo del panel | Completa la transacción principal del mesero. |
| Cancelar/volver | Botón secundario | 40/46 px | Debe estar disponible, pero visualmente subordinado. |

En móvil, el resumen se representa mediante una barra inferior persistente de 52–60 px con cantidad y total. Al pulsarla se abre un panel inferior que ocupa hasta 80% de la pantalla.

## 10. Notas e indicaciones

### 10.1 Regla general

Los campos de notas no se muestran vacíos de manera permanente. Una nota es una excepción, no el camino normal para agregar un producto.

| Elemento | Semántica | Tamaño | Justificación |
|---|---|---|---|
| `+ Nota` en una línea | Botón secundario textual | 34–40 px; táctil 44 px | Revela el campo únicamente para el producto correspondiente. |
| Nota abierta | Textarea | 80–96 px iniciales | Permite dos o tres líneas sin consumir el panel completo. |
| Nota guardada | Texto secundario + botón editar | 12–13 px; acción 40/46 px | La información sigue visible, pero el campo deja de ocupar espacio. |
| `+ Indicaciones para cocina` | Botón secundario | 36–40 px; táctil 44–46 px | Revela la nota general solo cuando se necesita. |
| Indicaciones generales abiertas | Textarea | 88–112 px | Se distingue de las notas por producto y se envía a toda la orden. |

No usar placeholder como única etiqueta. Debe existir una etiqueta visible o un nombre accesible asociado.

## 11. Cocina

| Elemento | Semántica | Tamaño | Justificación |
|---|---|---|---|
| Tarjeta de comanda | Grupo operativo | 280–360 px de ancho | Permite leer varias comandas en paralelo. |
| Mesa y tiempo | Título + estado | 18–22 px | Son los datos usados para priorizar. |
| Producto y cantidad | Texto | 16–20 px; cantidad peso 700 | Debe leerse a distancia y rápidamente. |
| Nota de cocina | Texto destacado solo si existe | 14–16 px | Es excepcional pero crítica cuando aparece. |
| Cambiar etapa | Botón principal contextual | 44–52 px | Es la acción repetida de cocina. |
| Incidencia | Botón secundario/destructivo | 40–46 px | Importante, pero no debe provocar activaciones accidentales. |
| Estado | Badge con texto | 12–13 px | El color ayuda, pero la palabra confirma el significado. |

## 12. Caja y cuenta

| Elemento | Semántica | Tamaño | Justificación |
|---|---|---|---|
| Identificación de mesa/cuenta | Título | 20–24 px | Confirma qué cuenta se está cobrando. |
| Líneas consumidas | Lista o tabla | 44–56 px por fila | Debe revisarse rápidamente sin tarjetas voluminosas. |
| Total | Texto destacado | 26–32 px | Es el dato más importante de caja. |
| Forma de pago | Botones de selección | 44–48 px | Opciones frecuentes, mutuamente excluyentes y claramente seleccionadas. |
| Cobrar | Botón principal | 52–56 px | Completa la transacción y debe tener posición estable. |
| Dividir cuenta | Botón secundario | 40–46 px | Flujo alternativo que aparece antes de cobrar. |
| Anular/corregir | Botón destructivo separado | 40–46 px + confirmación | El riesgo se controla con separación y confirmación, no haciéndolo dominante. |

## 13. Navegación global

| Elemento | Semántica | Tamaño | Justificación |
|---|---|---|---|
| Destino principal | Enlace o botón de navegación | 40 px puntero; 46 px táctil | Mesas, Órdenes, Cocina e Inventario cambian de módulo. |
| Icono de navegación | Icono decorativo acompañado de texto | 18–20 px | El texto evita ambigüedad; no se requiere un icono grande. |
| Destino activo | Variante visual seleccionada | Misma dimensión que los demás | La posición no salta al cambiar de pantalla. |
| Usuario/opciones | Botón de menú | 40/46 px | Es secundario y permanece fuera del flujo transaccional. |
| Logo/nombre del local | Imagen + texto no interactivo, salvo que navegue | Logo 28–36 px | Identifica el sistema sin dominar la barra. |

## 14. Color, iconos y estados

- Negro (`primary`) significa acción principal.
- Verde significa libre, correcto o completado.
- Ámbar significa espera, atención o precuenta.
- Rojo significa error, anulación o acción destructiva.
- Azul se reserva para información o estado neutral que necesita atención.
- El color no se usa como decoración en elementos operativos.
- Iconos normales: 18–20 px. Iconos de estado o vacío: hasta 24 px. Solo una ilustración puede superar ese tamaño.
- Un botón con icono y texto usa el icono como apoyo; el texto lleva el significado.
- Los iconos sin texto se reservan para acciones universales y repetidas: buscar, cerrar, sumar, restar, editar o eliminar.

## 15. Contenido y redacción

- Botones: verbo directo y breve (`Enviar`, `Cobrar`, `Agregar nota`).
- Títulos: sustantivo o contexto (`Mesa 7`, `Orden actual`, `Cocina`).
- Estados: presente y breves (`Libre`, `En cocina`, `Lista`).
- Ayuda: una frase corta solo cuando evita un error real.
- No repetir en un párrafo lo que el título y los controles ya explican.
- Evitar texto técnico frente al personal operativo.

## 16. Criterios de aceptación

La implementación cumple esta especificación cuando:

1. Mesas y productos ocupan la mayor parte del espacio operativo.
2. Búsqueda, notas y filtros avanzados no reservan espacio mientras están cerrados.
3. Las acciones principales se identifican en menos de un segundo y mantienen una posición estable.
4. Todas las acciones táctiles frecuentes tienen un objetivo mínimo aproximado de 44 × 44 px.
5. Cada elemento interactivo usa una semántica apropiada y funciona con teclado.
6. Ningún badge, texto o título parece un botón si no ejecuta una acción.
7. El flujo completo funciona en escritorio, tablet y móvil sin reducir todo proporcionalmente.
8. Las mesas conservan forma, estado y legibilidad al adaptar el plano.
9. Los controles de cantidad nunca cubren el nombre o el precio del producto.
10. El resumen, el total y la acción final permanecen accesibles durante toda la transacción.
11. Las acciones destructivas están separadas de las frecuentes y requieren confirmación cuando el daño no es reversible.
12. Color, texto e iconografía comunican estados de manera consistente en todos los módulos.

## 17. Orden recomendado de implementación

1. **Mesas:** plano responsive, búsqueda compacta y paneles secundarios colapsables.
2. **Nueva orden:** catálogo transaction-first, cantidades inmediatas y resumen persistente.
3. **Notas:** divulgación progresiva por producto y para la orden general.
4. **Cuenta/caja:** jerarquía de total, forma de pago y cobro.
5. **Cocina:** densidad, prioridad por tiempo y avance rápido.
6. **Resto de módulos:** aplicar los mismos tokens y decisiones semánticas sin forzar el patrón transaccional donde no corresponda.

Esta especificación define la intención y los límites. La implementación puede ajustar medidas dentro de los rangos indicados cuando una prueba real de uso demuestre una mejora, pero no debe alterar la jerarquía transaction-first sin documentar el motivo.
