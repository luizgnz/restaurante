# TAREAS v3 — catálogo real, interfaz y cierre de producto

Creado el 2026-09-12 como nueva lista viva de decisiones y ejecución. Hereda únicamente los pendientes vigentes de `TAREAS_V2.md`; `TAREAS.md` permanece como historial cerrado.

## Cómo usar esta lista

- `[x]` significa únicamente trabajo implementado y verificado.
- `[ ]` significa trabajo pendiente, aunque la decisión ya esté aprobada.
- **APROBADA — pendiente de implementar** identifica una decisión ya tomada cuyo trabajo todavía no terminó.
- **POR DECIDIR** identifica una pregunta que debe revisarse con Luis antes de implementar.
- **DESCARTADA** identifica una propuesta que no se implementará.
- Las preguntas se revisan una por una. No se completarán precios, nombres, permisos ni reglas por suposición.
- Para cerrar una implementación deben aprobar `npm test`, `npm run test:go` y `npm run build`. Los cambios visuales también requieren revisión a 390, 768 y 1280 px.

## 1. Alcance confirmado del catálogo real

- [x] Menú real normalizado desde `Menu.xlsx`, hoja `Hoja1`.
- [x] Comida de demostración sustituida por el catálogo real, sin borrar historia.
- **DESCARTADA — reemplazada el 2026-09-12:** conservar las nueve bebidas de demostración.
- [x] Bebidas anteriores sustituidas por las 28 bebidas normalizadas de `Menu.xlsx`, con sus precios originales.
- [x] Los productos referenciados por ventas u órdenes históricas se desactivan; no se eliminan.
- [x] El sistema no procesa pagos ni emite comprobantes de pago.

## 2. Decisiones del menú que bloquean la sustitución

### 2.1 Precios faltantes

- [x] Precios iniciales de la propuesta para Rancagua incorporados; Administración puede editarlos posteriormente.
- [x] Valores del Excel interpretados como pesos chilenos completos, igual que el catálogo actual.

#### Propuesta inicial para Rancagua

Los valores se estimaron el 2026-09-12 con cartas publicadas de restaurantes de Rancagua y alrededores. Se priorizó un posicionamiento económico-medio y se redondearon los montos para venta directa. Las plataformas de delivery pueden mostrar precios superiores por sus comisiones.

| Categoría | Producto | Precio propuesto |
| --- | --- | ---: |
| Platos completos | Bandeja paisa | $12.000 |
| Platos completos | Bistec a lo pobre | $10.000 |
| Platos completos | Arroz con pollo | $8.500 |
| Platos completos | Arroz chaufán | $7.500 |
| Platos completos | Frijolada | $9.000 |
| Platos completos | Tilapia frita | $9.500 |
| Platos completos | Sopa especial | $8.500 |
| Platos completos | Arroz mixto | $10.500 |
| Platos completos | Sudado de pollo | $9.000 |
| Platos completos | Cazuela de vacuno | $9.500 |
| Platos completos | Porotos con riendas | $7.500 |
| Platos completos | Cocimiento | $9.000 |
| Platos chilenos | Carne a la cacerola | $9.500 |
| Platos chilenos | Pollo al horno | $9.500 |
| Platos chilenos | Carne mongoliana | $8.500 |
| Platos chilenos | Pescado | $9.000 |
| Platos chilenos | Reineta | $11.000 |
| Platos chilenos | Chuletón | $10.500 |
| Platos chilenos | Salmón al ajillo | $13.000 |
| Platos chilenos | Pollo al jugo | $7.500 |
| Platos chilenos | Bistec de panita | $8.000 |
| Platos chilenos | Prietas | $8.000 |
| Platos chilenos | Chunchules | $9.000 |
| Platos chilenos | Costillar al horno | $11.500 |

Referencias locales utilizadas:

- [Asadero Super Pollo, Rancagua](https://www.ubereats.com/cl/store/asadero-super-pollo/IVri3gsoUUqB__3JFjaczw): bandeja paisa $12.000 y almuerzo colombiano $9.500.
- [El Coloso San Martín, Rancagua](https://www.ubereats.com/cl/store/el-coloso-san-martin/Rxy8wE7aS6uFpwsnT-SBDw): bistec a lo pobre $6.990 y chuleta vetada $7.000 en formato colación.
- [Restorant El Faro, Rancagua](https://www.ubereats.com/cl-en/store/restorant-el-faro/6VP1kcPnRAmuVnBZDxgkzg): reineta $13.000, costillar $13.700, bistec $12.000 y bistec a lo pobre $15.200, con acompañamientos adicionales.
- [Terraza Estado, Rancagua](https://www.ubereats.com/cl/store/terraza-estado-restaurant-rancagua/e9blhlTCTrOxXv-U3D5t9w): pollo al jugo $5.200, pescado $7.800, carne al jugo $7.800 y salmón $12.990.
- [La Negrita, Rancagua](https://www.rappi.cl/restaurantes/900118300-la-negrita-restaurante): pollo a la plancha $7.450, pescado $11.990, pollo al horno $11.990 y carne al jugo $10.990.
- [Rancagüinos Food, Rancagua](https://www.ubereats.com/cl/store/rancaguinos-food-rancagua/kLNHsdQXQ4uSTtYWn5LAkA): arroz mixto $10.400.
- [Sabor Urbano, Rancagua](https://www.rappi.cl/restaurantes/900104434-sabor-urbano-restobar): pollo al jugo $6.990, chuleta vetada $6.990 y salmón $14.990.
- [Shun Xin, Rancagua](https://www.rappi.cl/restaurantes/900119596-shun-xin): carne mongoliana con arroz $8.000.

### 2.2 Nombres incompletos y reglas especiales

- [x] Creadas `Papas fritas pequeña` a $2.000, `Papas fritas mediana` a $3.000 y `Papas fritas grande` a $4.000.
- [x] Creada `Porción de tajadas` como producto normal a $1.500.
- [x] Implementado `Cambiar por papas fritas +$1.000` como modificación de acompañamiento para `Platos completos`, no como producto independiente.
- [x] Creado `Empaque` a $500 en `Extras`, con receta unitaria y stock de prueba.
- [x] En pedidos para llevar se sugiere un empaque por cada plato o porción; las bebidas quedan excluidas y el mesero puede ajustar la cantidad, incluso a cero. `Empaque` permanece como producto agregable desde el menú.
- [x] Administración puede habilitar o deshabilitar únicamente la sugerencia de empaques; la preferencia persiste y `Empaque` permanece disponible en el menú.

### 2.3 Duplicados y categorías

- [x] `Platos colombianos` y `Platos chilenos` son grupos separados de platos completos; los nombres coincidentes se distinguen por estilo y mantienen receta y precio propios.
- [x] La categoría del Excel `Proteínas colombianas` se muestra como `Platos colombianos`.
- [x] Categorías visibles: `Bebidas`, `Extras`, `Porciones`, `Platos completos`, `Platos colombianos` y `Platos chilenos`.
- [x] Postres y bebidas de demostración anteriores desactivados.
- [x] Ortografía, tildes, espacios, mayúsculas y abreviaturas del menú normalizados.

### 2.4 Inventario y disponibilidad

- [x] Todos los platos tienen recetas estimadas por porción con cantidades e ingredientes editables posteriormente por Administración.
- [x] Platos y bebidas preparadas clasificados como receta; bebidas envasadas como unidades; empaque como receta sobre un insumo unitario.
- [x] Existencias estimadas de demostración incorporadas y restauradas por el reinicio de prueba.
- [x] Un producto dependiente de un ingrediente agotado aparece como `Agotado` y el envío vuelve a validar el stock.
- [x] Alta completa implementada en una migración idempotente, con respaldo automático previo para una base operativa existente.
- [x] Unidad guardada separadamente del nombre, con conversiones automáticas `kg ↔ g` y `L ↔ ml`; los materiales contables usan `unidad`. Factores verificados: 1 kg = 1000 g y 1 L = 1000 ml.

## 3. Implementación del catálogo después de aprobar las decisiones

- [x] Tabla normalizada mantenida en `scripts/generar-menu-real.mjs`, con categoría, nombre, precio, tipo, receta, foto y estación.
- [x] Migración idempotente generada sin duplicar productos ni movimientos de inventario.
- [x] Sustituidas las bebidas anteriores por las 28 bebidas normalizadas del Excel, con existencias iniciales de prueba.
- [x] Comida anterior desactivada sin borrar órdenes, cuentas ni movimientos históricos.
- [x] Menú real insertado con códigos estables, nombres normalizados y categorías aprobadas.
- [x] Recetas y existencias cargadas sin descuentos retroactivos.
- [x] Fotos locales asignadas a los 81 productos visibles, con manifiesto de fuente y licencia; preparaciones similares y tamaños pueden compartir imagen.
- [x] Añadido `npm run demo:restaurar`: respalda, recrea las órdenes demo y restaura las existencias iniciales de prueba.
- [x] Verificados catálogo, recetas, existencias, migración, reinicio demo y flujos existentes con 495 pruebas Vitest y toda la suite Go.
- [x] Añadidas pruebas Go y React para reinstalación, catálogo real, recetas, fotos, bebidas, respaldo y reinicio de existencias.
- [x] Respaldo automático de la base operativa antes de aplicar la migración del menú real.

## 4. Mejoras de interfaz para decidir e implementar

### 4.1 Logo e identidad — prioridad alta

- [x] Flujo robusto de logo con vista previa inmediata, formatos PNG/JPEG/WebP, recorte cuadrado, zoom, reducción automática, error junto al selector y persistencia tras reiniciar.
- **DESCARTADA — decisión del 2026-09-12:** admitir SVG en esta etapa. Se priorizan formatos raster para reducir problemas de seguridad y compatibilidad.
- [x] Texto visible con formatos admitidos, límite de 5 MB y explicación del recorte antes de seleccionar.
- [x] Si no hay logo o la imagen falla, se muestra siempre el nombre escrito del restaurante con una presentación cuidada, también en teléfono; no se usa monograma ni icono genérico.
- [x] Carga, guardado, recarga y eliminación del logo verificadas; disposición revisada en 390, 768 y 1280 px.

### 4.2 Organización de Opciones

- [x] `Opciones` reorganizada en una sola pantalla vertical: Identidad, Apariencia, Operación de órdenes, Entrega y para llevar, Seguridad y PIN, Usuarios y roles, Impresión y Red local.
- [x] Vista de comanda, precuenta, entrega automática, prioridad para llevar y devolución de inventario separadas de Seguridad y PIN.
- [x] Navegación interna fija entre secciones; en teléfono es horizontal, desplazable y conserva el formato vertical de la aplicación.

### 4.3 Consistencia técnica de la interfaz

- [x] Consolidar las definiciones repetidas del encabezado (`.pos-nav`, `.pos-odoo__marca` y `.pos-odoo__logo`) en una base y variantes responsive explícitas.
- [x] Incorporado un coordinador único de modales para impedir capas simultáneas y reemplazar de forma explícita cuenta, orden, edición, PIN, precuenta y confirmaciones.
- [x] Se mantuvo sin rediseño mayor la navegación Mesas → Órdenes → Inventario, el selector Mesero/Cocina, el tablero Cocina de dos carriles, la jerarquía de Inventario y el estado del día en Administración.
- [ ] Ejecutar la skill `revision-ui` después de cada fase visual y guardar capturas reales a 390, 768 y 1280 px.

### 4.4 Reportes — alcance nuevo

- [x] Reportes descargables en PDF de inventario y ventas por período implementados y verificados.
- [x] El reporte de ventas describe cuentas cerradas, productos, totales registrados, promedio, tipo de servicio, cancelaciones y turnos; no afirma cobros ni medios de pago.
- [x] El reporte de inventario incluye existencias, reservas, disponibilidad, entradas, consumo por recetas, devoluciones, pérdidas y estado. Las devoluciones de receta no se denominan `Merma`.
- [x] `Reportes` es un módulo propio dentro de Administración, con pantalla vertical y sin ocupar la navegación principal diaria.
- [x] Implementados los períodos, permisos, A4 vertical/horizontal, paginación y generación bajo demanda definidos en las preguntas 25 a 31 y 34 a 35.

## 5. Decisiones funcionales todavía abiertas

- [x] Si el cliente rechaza un reemplazo, se registra `Cliente no aceptó el reemplazo` y se elimina el producto original. Si era el único producto, la orden queda anulada. No se presenta una decisión de diferencia de precio.
- [x] La entrega automática está activada y marcada como recomendada, con 30 minutos por defecto; una incidencia pendiente pausa el temporizador.
- [x] Inventario se actualiza cada 15 segundos mientras la pestaña está visible.
- [x] `Poco stock` usa por ahora 20 % o menos de la existencia física, con un mínimo de 2 unidades.
- [x] Motivos rápidos de Mesero: `Registrado por error`, `Cliente pidió cambio` y `Otro`; motivos de Cocina: `Falta ingrediente`, `No se puede terminar`, `Preparación incorrecta` y `Otro`. El detalle de `Otro` siempre es opcional.
- [x] Al resolver una incidencia se reinician los 30 minutos de entrega automática; si hubo reemplazo, el plazo comienza cuando Cocina marque listo el producto nuevo.
- [x] Se mantiene un solo `Salón principal` por defecto y Administración puede agregar áreas opcionales desde la edición del mapa.
- **FUERA DEL ALCANCE ACTUAL — decisión del 2026-09-12:** Barra no existe en esta entrega; fue solo un ejemplo. Si un restaurante la solicita posteriormente, se evaluará crearla como estación opcional configurable por producto.
- [x] `Poco stock` mantiene la regla global y admite un umbral individual opcional, entero y expresado en la unidad configurada.
- [x] Implementadas una o varias jornadas/turnos en la misma fecha, con una sola abierta, plantilla predeterminada, configuración administrativa y desglose por turno en Reportes.
- [x] El cierre de turno ofrece cierre masivo de cuentas sin precuentas individuales, muestra resumen, exige autorización, libera mesas y registra responsable; bloquea preparación e incidencias y permite confirmar juntos los productos listos.

## 6. Pendientes heredados de TAREAS v2

- [ ] Completar y publicar el `Manual funcional y de operación del sistema` a partir de `docs/FLUJOS_CONDICIONALES_SISTEMA_2026-09-10.md`. La versión definitiva se hará después de implementar, auditar y verificar la entrega, con capturas reales y una distinción clara entre lo permitido, lo prohibido, lo configurable y lo que está fuera de alcance.
- [x] Crear la matriz formal de capturas a 390, 768 y 1280 px de las cinco pantallas principales, unificando las rondas existentes.
- [ ] **IMPLEMENTACIÓN PREPARADA — pendiente de verificación real en Windows:** Inno Setup gráfico, paquete Go/UI sin npm, respaldo SQLite y aplicación previa, retención de tres actualizaciones, validación y rollback automático. Falta compilar el `Setup.exe` en Windows y probar instalación, actualización y fallo controlado en Windows 10/11 x64 antes de marcarlo terminado.
- [ ] Cualquier módulo de pagos requiere una decisión explícita del negocio y permanece fuera del alcance actual.
- [ ] Revisar e integrar mediante PR el endurecimiento ligero para red local que está en la rama `codex/seguridad-local`; no mezclarlo con la migración del catálogo hasta verificar su diff y sus pruebas.

## 7. Orden propuesto de trabajo

1. Resolver las decisiones bloqueantes del menú y producir la tabla normalizada para aprobación.
2. Respaldar la base y sustituir el catálogo completo, incluidas las bebidas, conservando el historial.
3. Probar el flujo funcional completo con el menú real.
4. Corregir logo e identidad móvil.
5. Reorganizar Opciones si se aprueba la nueva arquitectura.
6. Consolidar encabezado y coordinación de modales.
7. Ejecutar pruebas completas y revisión visual responsive.
8. Integrar por PR, definir la rutina de release y preparar el manual final verificado.

## 8. Cuestionario de decisiones

Se revisará una pregunta por vez. Al responder, se registrará la opción como `APROBADA` o `DESCARTADA`, se actualizarán las tareas dependientes y solo entonces se hará la pregunta siguiente.

### Pregunta 1 — aprobación de los precios propuestos

**Decisión:** opción A aprobada por Luis el 2026-09-12. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

¿Cómo procedemos con la propuesta inicial de precios para Rancagua?

- **Opción A — aprobar la tabla completa (recomendada):** usar estos montos como precio inicial fijo y permitir que Administración los edite posteriormente. Mantiene el catálogo coherente con un restaurante económico-medio de la zona y permite avanzar sin inventar reglas de precio diario.
- **Opción B — aprobar con correcciones:** Luis indica únicamente los platos que deben subir o bajar y se conserva el resto.
- **Opción C — versión más económica:** reducir $500 en platos de hasta $9.500 y $1.000 en los de $10.000 o más. Puede favorecer volumen, pero reduce el margen sin conocer todavía el costo real de las recetas.
- **Opción D — versión superior:** aumentar $500 en platos de hasta $9.500 y $1.000 en los de $10.000 o más. Da más margen, pero puede alejarse del posicionamiento económico del archivo original.
- **Opción E — mantenerlos desactivados:** cargar los nombres pero impedir su venta hasta conocer costos o precios reales.

**Recomendación:** Opción A como punto de partida y revisar posteriormente los precios contra el costo real de cada receta. Es la opción más equilibrada con las referencias locales disponibles.

### Pregunta 2 — porciones de papas sin nombre

**Decisión:** opción A aprobada por Luis el 2026-09-12. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

¿Qué representan los precios de $2.000, $3.000 y $4.000 mostrados debajo de `Papas fritas`?

- **Opción A — tamaños (recomendada):** Pequeña $2.000, Mediana $3.000 y Grande $4.000.
- **Opción B — cantidades:** una, dos o tres porciones.
- **Opción C — productos distintos:** indicar el nombre exacto de cada línea.
- **Opción D — solo conservar $2.000:** tratar las otras dos líneas como errores del Excel.

**Recomendación:** Opción A. Las tres cantidades aparecen consecutivas bajo `Papas fritas` y siguen una progresión de precio propia de tamaños. Además, los restaurantes locales suelen presentar las papas como pequeña, mediana y grande. Si el restaurante usa otros nombres, se elige la Opción C y se registran literalmente.

### Pregunta 3 — recargo por papas fritas

**Decisión:** opción A aprobada por Luis el 2026-09-12. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

¿Qué significa `(+)$1.000 Papas fritas`?

- **Opción A — cambio de acompañamiento (recomendada):** sustituye el acompañamiento del plato y suma $1.000 una sola vez.
- **Opción B — agregado adicional:** conserva el acompañamiento original y añade papas por $1.000.
- **Opción C — nota informativa:** no se convierte en una acción del POS.
- **Opción D — producto independiente:** aparece en el catálogo como otra porción.

**Recomendación:** Opción A si corresponde a la operación real; modelarlo como modificación evita venderlo accidentalmente como producto suelto.

### Pregunta 4 — empaque de $500

**Decisión implementada y verificada el 2026-09-12:** opción A ampliada y aprobada por Luis. Además de la sugerencia editable para pedidos para llevar, `Empaque` está disponible como producto de `Extras` para comida sobrante de una mesa.

¿Cómo se aplica el empaque?

- **Opción A — sugerido por cantidad al crear un pedido para llevar (aprobada):** el sistema propone una cantidad editable antes de enviar. También queda disponible como producto de `Extras` para mesas.
- **Opción B — automático por pedido:** cobra un solo empaque sin importar cuántos platos haya.
- **Opción C — automático por producto:** agrega un empaque por cada plato empacable.
- **Opción D — manual:** el mesero añade `Empaque` como cualquier extra.

**Recomendación:** Opción A; mantiene rapidez y permite corregir pedidos que necesitan más o menos recipientes.

### Pregunta 5 — significado de las proteínas colombianas y nombres repetidos

**Decisión:** opción B aprobada por Luis el 2026-09-12. Ambas secciones representan platos completos y permanecerán separadas por estilo. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

¿Qué representa la sección `Proteínas colombianas` frente a `Platos chilenos`?

- **Opción A — proteína individual y plato completo (recomendada):** las proteínas colombianas se venden como porciones sin acompañamientos; los platos chilenos son preparaciones completas. Se conservan separados y las primeras se nombran `Porción de…` para evitar confusión.
- **Opción B — ambos son platos completos:** se conservan separados por estilo y se distinguen con nombres como `Pollo al horno colombiano` y `Pollo al horno chileno`.
- **Opción C — es el mismo producto:** cada nombre repetido se unifica con un solo precio y receta, aunque aparezca en dos secciones del Excel.
- **Opción D — decidir cada coincidencia:** Luis indicará cuáles se unifican y cuáles permanecen separadas.

**Recomendación:** Opción A. El Excel separa `Porciones`, `Proteínas colombianas` y `Platos chilenos`, y asigna precios propios a las proteínas. Interpretarlas como porciones individuales conserva esa estructura y evita confundirlas con los platos completos.

### Pregunta 6 — nombre de la categoría colombiana

**Decisión:** opción A aprobada por Luis el 2026-09-12. La categoría se llamará `Platos colombianos`. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

Ahora que se decidió que las dos secciones contienen platos completos, ¿cómo debe llamarse en el POS la sección `Proteínas colombianas`?

- **Opción A — Platos colombianos (recomendada):** es directa y mantiene simetría con `Platos chilenos`.
- **Opción B — Cocina colombiana:** suena más general y permite incorporar productos distintos en el futuro.
- **Opción C — Especialidades colombianas:** comunica una selección especial, pero es menos precisa.
- **Opción D — Proteínas colombianas:** conserva literalmente el encabezado del Excel, aunque ya confirmamos que son platos completos.

**Recomendación:** Opción A. Describe correctamente el contenido y permite distinguir con claridad los platos colombianos de los chilenos.

### Pregunta 7 — escritura visible del menú

**Decisión:** opción A aprobada por Luis el 2026-09-12. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

¿Se pueden corregir tildes, mayúsculas, espacios y errores evidentes sin cambiar el nombre comercial?

- **Opción A — normalizar todo (recomendada):** `Bedidas` pasa a `Bebidas`, se agregan tildes y se usa una capitalización uniforme.
- **Opción B — copiar literalmente:** conservar exactamente lo escrito en el Excel.
- **Opción C — aprobar correcciones una por una:** preparar una tabla comparativa antes de importar.

**Recomendación:** Opción A para una interfaz profesional; cualquier cambio que altere el significado se consultará aparte.

### Pregunta 8 — recetas e inventario

**Decisión implementada y verificada:** opción A aprobada y ampliada por Luis el 2026-09-12. Todas las recetas quedaron cargadas con proporciones estimadas, los insumos se inventariaron y la prueba puede restaurarse de forma repetible.

¿Cómo se incorporan las recetas que descuentan ingredientes?

- **Opción A — completar todas las recetas antes de activar el menú:** ofrece inventario completo desde el primer día, pero retrasa toda la sustitución.
- **Opción B — activar todos los platos sin recetas:** permite vender inmediatamente, pero el sistema no podrá descontar ingredientes ni bloquear esos platos por falta de insumos.
- **Opción C — activación gradual por categorías (recomendada):** se cargan todos los nombres y precios, pero solo se habilitan para venta las categorías cuyas recetas ya fueron validadas. Permite avanzar sin comprometer el inventario.
- **Opción D — usar recetas aproximadas:** habilita todo rápidamente, pero puede producir existencias falsas y se descarta como recomendación técnica.

**Resultado aplicado:** Luis eligió completar todo de una vez con recetas aproximadas. Se documentan como base editable y no sustituyen la validación posterior del rendimiento real de cocina.

### Pregunta 9 — stock inicial

**Decisión parcial implementada:** para demostración quedó aplicada la opción C; la puesta en producción conserva la recomendación A y requiere un conteo físico real.

¿Cómo se establece la existencia inicial del nuevo catálogo?

- **Opción A — conteo real al momento de la puesta en marcha (recomendada):** Administración registra las existencias físicas antes de operar.
- **Opción B — iniciar en cero:** obliga a cargar cada material antes de vender productos dependientes.
- **Opción C — valores estimados:** permite una demostración rápida, pero no debe usarse como inventario operativo.

**Recomendación:** Opción A para producción; la Opción C solo corresponde a una base de demostración separada.

### Pregunta 10 — carga y persistencia del logo

**Decisión:** opción A aprobada por Luis el 2026-09-12. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

El sistema hoy lee cualquier `image/*` como base64 y trata de guardarlo inmediatamente. El servidor rechaza archivos mayores de 400 KB, pero la pantalla no avisa el límite ni reduce la imagen; tampoco muestra el error junto al selector. ¿Qué solución aplicamos?

- **Opción A — flujo robusto PNG/JPEG/WebP, sin SVG (recomendada):** mostrar vista previa, validar el formato, reducir automáticamente la imagen a un máximo de 1024 × 1024 px y comprimirla por debajo de 400 KB antes de guardarla. Mostrar el estado de guardado y cualquier error junto al selector. Probar persistencia y eliminación tras reiniciar.
- **Opción B — igual que A, admitiendo SVG:** permite logotipos vectoriales muy nítidos, pero obliga a sanitizar contenido activo y añade complejidad innecesaria para un POS local.
- **Opción C — archivo administrado manualmente:** no permitir carga desde la interfaz; instalar el logo como archivo local durante la configuración del restaurante. Es simple técnicamente, pero cada cambio necesitaría intervención técnica.
- **Opción D — mantener el flujo actual:** conserva la carga inmediata sin compresión ni mensajes preventivos. Es la opción más rápida, pero mantiene el problema que ya observamos.

**Recomendación:** Opción A. Cubre los formatos habituales, evita que el límite de 400 KB vuelva a romper la carga y mantiene la configuración accesible para Administración sin incorporar los riesgos y el trabajo adicional de SVG.

### Pregunta 11 — organización de la pantalla Opciones

**Decisión:** opción A aprobada por Luis el 2026-09-12, condicionada a conservar el formato vertical actual de la aplicación. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

La pantalla actual mezcla identidad, apariencia, reglas operativas, seguridad, usuarios, impresión y red en un recorrido largo. ¿Cómo debe organizarse?

- **Opción A — secciones en una sola pantalla con navegación interna fija (recomendada):** `Identidad`, `Apariencia`, `Operación de órdenes`, `Entrega y para llevar`, `Seguridad y PIN`, `Usuarios y roles`, `Impresión` y `Red local`. En teléfono la navegación se desplaza horizontalmente y cada acceso lleva a su sección. Permite encontrar algo rápidamente y conservar una visión completa.
- **Opción B — pestañas que muestran una sección a la vez:** reduce mucho lo visible, pero obliga a cambiar de pestaña y puede ocultar configuraciones relacionadas.
- **Opción C — cuatro grupos amplios:** `General`, `Operación`, `Personal` y `Sistema`. Es más corta, pero vuelve a mezclar opciones distintas dentro de cada grupo.
- **Opción D — mantener la estructura actual:** evita un rediseño, pero conserva la mezcla entre reglas operativas y seguridad que ya detectamos.

**Recomendación:** Opción A. Mantiene la pantalla fácil de recorrer en monitor y teléfono, separa las decisiones del restaurante de los controles técnicos y no introduce una navegación compleja por pestañas.

### Pregunta 12 — motivos rápidos de Mesero y Cocina

**Decisión implementada y verificada:** lista simplificada aprobada por Luis el 2026-09-12.

El detalle escrito seguirá siendo opcional para no frenar la operación. ¿Qué listas de motivos dejamos disponibles con un toque?

- **Opción A — conservar las listas actuales (recomendada):** Mesero: `Agregado y no entregado`, `Cantidad registrada de más`, `Producto duplicado`, `Devuelto por el cliente` y `Otro`. Cocina: `Ingrediente no disponible`, `No se puede terminar`, `Preparación incorrecta`, `Solicitud del cliente` y `Otro`.
- **Opción B — listas mínimas:** Mesero: `Error al registrar`, `Solicitud del cliente` y `Otro`. Cocina: `Falta de ingrediente`, `Problema de preparación` y `Otro`. Es más rápida, pero pierde precisión para auditoría.
- **Opción C — listas ampliadas:** usar la opción A y añadir a Mesero `Mesa equivocada`; a Cocina `Falla de equipo` y `Producto dañado`. Registra mejor situaciones excepcionales, pero aumenta las opciones visibles.
- **Opción D — una sola lista compartida:** `Error de registro`, `Falta de stock`, `Problema de preparación`, `Solicitud del cliente` y `Otro`. Simplifica el desarrollo, pero muestra motivos que no corresponden al rol que actúa.

**Recomendación:** Opción A. Ya cubre los casos discutidos, diferencia correctamente Mesero y Cocina y mantiene cada selector corto. `Otro` con detalle opcional permite resolver excepciones sin añadir demasiadas alternativas.

**Resultado aprobado:**

- Mesero: `Registrado por error`, `Cliente pidió cambio` y `Otro`.
- Cocina: `Falta ingrediente`, `No se puede terminar`, `Preparación incorrecta` y `Otro`.
- Mesero solo puede modificar o cancelar mientras Cocina no haya iniciado la preparación. Si ya empezó, la acción corresponde a Cocina.
- El detalle escrito es opcional para todos los motivos, incluido `Otro`.

### Pregunta 13 — entrega automática después de una incidencia

**Decisión implementada y verificada:** opción A aprobada por Luis el 2026-09-12.

Una incidencia pendiente pausa el plazo automático de 30 minutos. Cuando se resuelva, ¿qué hacemos con ese plazo?

- **Opción A — reiniciar los 30 minutos completos (recomendada):** si el producto continúa listo, el mesero recibe nuevamente el plazo completo para retirarlo y entregarlo. Si hay reemplazo, el plazo comienza cuando Cocina marque listo el producto nuevo.
- **Opción B — continuar el tiempo restante:** conserva el tiempo acumulado antes de la incidencia, pero podría marcar el producto como entregado apenas se resuelva.
- **Opción C — exigir entrega manual:** después de cualquier incidencia se desactiva la entrega automática para ese producto y el mesero debe confirmarla.
- **Opción D — configurar el comportamiento:** Administración elige entre reiniciar, continuar o exigir confirmación. Es flexible, pero añade una configuración para un caso poco frecuente.

**Recomendación:** Opción A. Una incidencia interrumpe el flujo normal; reiniciar evita entregas automáticas prematuras y mantiene la regla sencilla para el equipo.

### Pregunta 14 — salones y áreas del restaurante

**Decisión:** opción A aprobada por Luis el 2026-09-12. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

¿Cómo presentamos la distribución del restaurante al instalarlo por primera vez?

- **Opción A — un salón por defecto y áreas adicionales opcionales (recomendada):** la aplicación comienza con un único `Salón principal`. Administración puede agregar después `Terraza`, `Segundo piso`, `Barra` u otra área desde la edición del mapa. Un restaurante pequeño no ve complejidad innecesaria.
- **Opción B — varias áreas activadas desde el inicio:** crea `Salón`, `Terraza` y `Barra` aunque el local no las utilice. Facilita una demostración grande, pero obliga a borrar o ignorar espacios.
- **Opción C — un único salón permanente:** simplifica al máximo, pero impide separar mesas por piso o zona si el restaurante crece.
- **Opción D — preguntar durante la instalación:** un asistente solicita las áreas iniciales. Es más personalizado, pero agrega un proceso de configuración que puede hacerse posteriormente desde Administración.

**Recomendación:** Opción A. Funciona inmediatamente para un local pequeño y conserva la posibilidad de crecer sin añadir pasos al inicio.

### Pregunta 15 — umbral de poco stock

**Decisión:** opción B aprobada por Luis el 2026-09-12. El umbral individual se expresa con valores enteros en la unidad configurada para el material; no admite decimales. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

Actualmente `Poco stock` se calcula como 20 % o menos de la existencia física, con un mínimo de 2 unidades. Ese mismo cálculo puede no representar bien materiales tan distintos como arroz en gramos, carne, bebidas envasadas o empaques. ¿Cómo lo manejamos?

- **Opción A — regla global única:** mantener 20 % con mínimo de 2 para todo. No exige configuración, pero puede generar avisos poco útiles en algunos materiales.
- **Opción B — regla global con valor individual opcional (recomendada):** todos usan la regla actual por defecto y Administración puede definir un punto de aviso específico solamente para los materiales que lo necesiten; por ejemplo, avisar al quedar 12 botellas o 5 kg de arroz.
- **Opción C — umbrales por categoría:** configurar un valor para bebidas, carnes, secos y empaques. Reduce trabajo frente al ajuste individual, pero exige clasificar cada insumo y sigue siendo impreciso dentro de una categoría.
- **Opción D — eliminar el aviso de poco stock:** mostrar únicamente `Disponible` y `Agotado`. Simplifica la pantalla, pero elimina la advertencia anticipada para reponer.

**Recomendación:** Opción B. Mantiene el funcionamiento automático actual y permite afinar solo los materiales críticos sin obligar a configurar todo el inventario.

### Pregunta 16 — alcance del módulo opcional de Barra

**Decisión:** no crear Barra en el alcance actual. Luis indicó el 2026-09-12 que era solo un ejemplo. Si surge una necesidad real futura, la opción A queda como orientación inicial, pero requerirá una nueva definición antes de implementarse.

El flujo base actual envía los platos preparados a Cocina y deja las bebidas envasadas como entrega directa del mesero, sin confirmaciones adicionales. Si en el futuro se activa Barra, ¿cómo debe funcionar?

- **Opción A — estación opcional y configurable por producto (recomendada):** el módulo permanece apagado por defecto. Al activarlo, Administración decide qué productos se preparan en `Barra`; solo esos aparecen en su tablero con estados `Por preparar`, `En preparación` y `Listo`. Las bebidas envasadas continúan como entrega directa salvo que se asignen expresamente a Barra.
- **Opción B — todas las bebidas pasan automáticamente por Barra:** al activar el módulo, cualquier producto de la categoría Bebidas aparece allí. Es fácil de entender, pero agrega trabajo incluso para una botella o lata que no requiere preparación.
- **Opción C — Barra solo controla inventario:** no tiene tablero de preparación; únicamente agrupa existencias de bebidas. Evita nuevos estados, pero no coordina jugos, cafés o preparaciones de barra.
- **Opción D — mantener Barra fuera del sistema:** no se implementa el módulo y todas las bebidas siguen como entrega directa. Es el flujo más simple, pero no ofrece expansión para restaurantes con una estación separada.

**Recomendación:** Opción A. Conserva el comportamiento simple del restaurante actual y permite activar una estación real en otros locales sin obligar a que cada botella pase por un proceso adicional.

### Pregunta 17 — identidad cuando no hay logo

**Decisión:** mostrar únicamente el nombre escrito del restaurante, con una presentación cuidada y siempre visible, como indicó Luis el 2026-09-12. No se usará monograma ni icono genérico. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

Si el restaurante todavía no cargó un logo, lo eliminó o la imagen no puede mostrarse, ¿qué debe aparecer en el encabezado?

- **Opción A — inicial y nombre del restaurante (recomendada):** mostrar un pequeño monograma con la primera letra y mantener visible el nombre, truncándolo solo si el ancho es insuficiente. Evita espacios vacíos y conserva la identidad en teléfono.
- **Opción B — solo el nombre:** es más limpio, pero pierde el punto visual que ocupa normalmente el logo.
- **Opción C — icono genérico y nombre:** usar un símbolo de restaurante junto al nombre. Mantiene la composición, aunque todos los locales sin logo se verían iguales.
- **Opción D — no mostrar sustituto:** dejar el espacio sin logo y ocultar el nombre cuando no quepa. Conserva el comportamiento actual, pero fue precisamente la causa de que la marca pareciera desaparecer.

**Recomendación:** Opción A. Es inmediata, personaliza el encabezado sin necesitar otra imagen y mantiene identificable el restaurante incluso en una pantalla pequeña.

### Pregunta 18 — cálculo de empaques para llevar

**Decisión implementada y verificada el 2026-09-12:** opción A aprobada por Luis. `Empaque` se puede agregar como producto del menú y su sugerencia depende de una configuración opcional de Administración.

Ya está aprobado que el sistema sugiera una cantidad editable de empaques al crear un pedido para llevar. Falta definir cómo calcula esa primera sugerencia.

- **Opción A — un empaque por unidad de comida (recomendada):** contar cada plato y porción de comida; excluir bebidas envasadas, café, té, limonada y el propio producto `Empaque`. Por ejemplo, dos platos y una porción sugieren tres empaques. El mesero puede subir, bajar o dejar la cantidad en cero antes de enviar.
- **Opción B — un empaque por pedido:** siempre sugerir uno, sin importar la cantidad de platos. Es simple, pero será incorrecto en pedidos medianos o grandes.
- **Opción C — preguntar la cantidad sin sugerencia:** el mesero introduce el número manualmente. Evita supuestos, pero agrega trabajo y facilita olvidos.
- **Opción D — permitir que Administración configure qué productos necesitan empaque:** ofrece máxima precisión, pero obliga a mantener otra propiedad en cada producto y receta.

**Recomendación:** Opción A. Resuelve correctamente la mayoría de los pedidos sin configuración adicional y mantiene la cantidad totalmente editable para excepciones.

### Pregunta 19 — alcance del check de Empaque

**Decisión implementada y verificada el 2026-09-12:** opción B aprobada por Luis. El check controla solo la sugerencia; el producto `Empaque` permanece disponible para agregarlo manualmente desde el menú.

¿Qué debe ocurrir cuando Administración desactive la opción `Habilitar empaques`?

- **Opción A — desactivar sugerencia y producto del menú (recomendada):** no se sugieren empaques en pedidos para llevar y `Empaque` deja de aparecer entre los productos agregables. El registro permanece en el catálogo y vuelve a mostrarse al activar el check.
- **Opción B — desactivar solo la sugerencia:** `Empaque` continúa visible para agregarlo manualmente, pero el sistema no calcula cantidades en pedidos para llevar.
- **Opción C — ocultar solo el producto manual:** la sugerencia automática continúa funcionando, pero el mesero no puede agregar empaques libremente desde el menú.
- **Opción D — usar dos checks separados:** uno para sugerencia automática y otro para mostrar `Empaque` en el menú. Da mayor flexibilidad, pero agrega configuración y combinaciones que explicar.

**Recomendación:** Opción A. Un solo check tiene un significado claro: el restaurante utiliza empaques dentro del sistema o no los utiliza. Evita que parezca desactivado mientras la función todavía aparece en otra parte.

### Pregunta 20 — unidades de medida del inventario

**Decisión:** opción B aprobada por Luis el 2026-09-12. Se admitirán `kg ↔ g` y `L ↔ ml` con conversión automática, además de `unidad`. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

Para aplicar umbrales enteros según la unidad configurada, la unidad debe guardarse separada del nombre del material. ¿Qué modelo usamos?

- **Opción A — unidades base sin conversiones (recomendada):** cada material usa `unidad`, `g` o `ml`. Existencias, recetas y umbral se expresan siempre en esa misma unidad. El umbral solo admite enteros; las recetas pueden conservar fracciones cuando sean necesarias, como medio limón.
- **Opción B — incluir kg y L con conversión automática:** Administración puede inventariar en `kg` o `L` mientras las recetas descuentan `g` o `ml`. Es más cómodo para compras, pero añade conversiones, redondeos y más casos que probar.
- **Opción C — unidad escrita libremente:** Administración escribe caja, botella, bolsa, porción u otra unidad. Es flexible, pero el sistema no puede validar equivalencias ni evitar errores ortográficos.
- **Opción D — mantener la unidad dentro del nombre:** continuar con nombres como `Arroz g` y `Aceite ml`. Evita una migración, pero dificulta mostrar y validar correctamente cantidades y umbrales.

**Recomendación:** Opción A. `unidad`, `g` y `ml` cubren el catálogo actual, evitan conversiones ambiguas y mantienen exacto el descuento de las recetas. Más adelante podría añadirse una unidad de compra separada sin cambiar la unidad base operativa.

### Pregunta 21 — presentación de saldos convertidos

**Decisión:** opción A aprobada por Luis el 2026-09-12. Los saldos se muestran con decimal y coma local en la unidad configurada, usando hasta tres decimales y ocultando ceros innecesarios. Los umbrales continúan admitiendo solo enteros. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

Con conversiones automáticas, una existencia inicial de 10 kg puede quedar en 9,85 kg después de usar 150 g. El umbral de poco stock seguirá aceptando solo números enteros en la unidad configurada. ¿Cómo mostramos el saldo restante?

- **Opción A — decimal en la unidad configurada:** mostrar `9,85 kg` o `2,25 L`. Es compacto y preciso, pero introduce decimales en la pantalla.
- **Opción B — siempre en la unidad menor:** mostrar `9850 g` o `2250 ml`. Evita decimales, aunque las cantidades grandes son menos cómodas de leer.
- **Opción C — redondear a unidades completas:** mostrar `10 kg`. Es visualmente simple, pero oculta consumo real y puede engañar al inventario.
- **Opción D — unidades combinadas sin decimales (recomendada):** mostrar `9 kg 850 g` y `2 L 250 ml`. Conserva precisión y respeta una presentación con valores enteros; los campos de entrada permiten escribir por separado la unidad mayor y la menor.

**Recomendación:** Opción D. Evita números decimales sin perder cantidades reales, tanto al consultar como al registrar entradas o conteos.

### Pregunta 22 — rutina para publicar nuevas versiones

**Decisión:** Luis solicitó el 2026-09-12 un instalador gráfico ejecutable, con barra de progreso, respaldo previo de la base y rollback si la instalación o validación falla. Se aprobó Windows 10/11 x64 con Inno Setup. Pendiente de diseñar, implementar y verificar en Windows; no se marca con `[x]` todavía.

La aplicación funciona en la red local y conserva una base SQLite operativa. ¿Cómo debe instalarse una nueva versión?

- **Opción A — publicación manual controlada (recomendada):** antes de instalar se crea un respaldo; la versión debe pasar pruebas Go, pruebas React, compilación, smoke funcional y revisión responsive. Después se integra mediante PR aprobado y se instala conscientemente en el equipo del restaurante, conservando una forma de volver a la versión anterior.
- **Opción B — actualizar automáticamente después de cada merge:** reduce pasos, pero un cambio integrado podría llegar al restaurante sin una validación operativa final.
- **Opción C — copiar manualmente carpetas o archivos:** parece sencillo, pero facilita versiones incompletas, dependencias mezcladas y pérdida de trazabilidad.
- **Opción D — actualizador automático dentro de la aplicación:** ofrece comodidad futura, pero requiere distribución de versiones, firmas, verificación y recuperación; es demasiado alcance para la entrega actual.

**Recomendación:** Opción A. Para un POS local importa más una actualización predecible, respaldada y reversible que instalar cambios automáticamente.

**Resultado ampliado:** la actualización no copiará la base SQLite como un archivo cualquiera mientras el servidor esté activo. Un comando de mantenimiento del backend Go deberá detener o coordinar la aplicación, producir y verificar un respaldo consistente, guardar la versión anterior, aplicar la actualización, ejecutar migraciones y una prueba de salud y, ante cualquier fallo, restaurar el binario y la base anteriores.

### Pregunta 23 — sistema operativo del instalador

**Decisión:** opción A aprobada por Luis el 2026-09-12. Se distribuirá para Windows 10/11 x64 mediante un único `Instalar Restaurante.exe` construido con Inno Setup. Pendiente de implementar y verificar en Windows; no se marca con `[x]` todavía.

Inno Setup crea instaladores para Windows; no genera una aplicación instalable para macOS. ¿Cuál será la plataforma del computador del restaurante?

- **Opción A — Windows 10/11 de 64 bits (recomendada):** generar un único `Instalar Restaurante.exe` con Inno Setup y un binario Go x64. Es la ruta más directa para computadores POS convencionales.
- **Opción B — Windows x64 y Windows ARM:** producir paquetes separados o un instalador que incluya ambos binarios. Amplía compatibilidad, pero probablemente agrega una variante que el restaurante actual no necesita.
- **Opción C — macOS:** usar un paquete `.pkg` o `.dmg`; Inno Setup no aplica. También requiere firma y notarización para una distribución profesional.
- **Opción D — Windows y macOS:** mantener dos procesos de empaquetado, firma, pruebas y rollback. Es posible, pero duplica el trabajo de entrega.

**Recomendación:** Opción A si el equipo operativo será Windows. Mantendremos el desarrollo en Mac y compilaremos el backend Go para Windows; la UI React queda incluida dentro del mismo paquete.

### Pregunta 24 — forma de ejecutar el servidor en Windows

**Decisión:** opción A aprobada por Luis el 2026-09-12. El backend se instalará como servicio de Windows para todo el equipo; aplicación en `Program Files` y datos/respaldos en `ProgramData`. Pendiente de implementar y verificar en Windows; no se marca con `[x]` todavía.

Después de instalar, ¿cómo debe iniciarse y mantenerse funcionando el servidor local?

- **Opción A — servicio de Windows para todo el equipo (recomendada):** el instalador solicita permisos de administrador, instala el binario en `Program Files`, conserva la base y los respaldos en `ProgramData` e inicia el servidor automáticamente con Windows, aunque ningún usuario haya abierto sesión. La interfaz se abre mediante un acceso directo.
- **Opción B — aplicación al iniciar sesión:** instala para un usuario y abre el servidor cuando esa persona entra a Windows. Evita configurar un servicio, pero el restaurante queda sin sistema si ese usuario cierra sesión o la aplicación se cierra.
- **Opción C — inicio manual:** crea un acceso directo y alguien debe abrir el servidor cada día. Es sencillo de desarrollar, pero facilita olvidos y cierres accidentales.
- **Opción D — versión portable:** se ejecuta desde una carpeta o memoria USB, sin instalación. Es fácil de mover, pero aumenta el riesgo de borrar o duplicar la base de datos.

**Recomendación:** Opción A. Un servidor POS local debe arrancar solo, permanecer disponible para teléfonos y tablets y guardar los datos fuera de la carpeta reemplazable de la aplicación.

### Pregunta 25 — ubicación de Reportes

**Decisión:** opción A aprobada por Luis el 2026-09-12. `Reportes` será un módulo propio dentro de Administración. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

Los reportes consultan información operativa y generan documentos; no modifican la configuración. ¿Dónde debe aparecer el acceso?

- **Opción A — módulo `Reportes` dentro de Administración (recomendada):** aparece junto a Productos, Recetas y Jornada, con su propia pantalla vertical. `Opciones` conserva solamente configuraciones del sistema.
- **Opción B — sección dentro de Opciones:** sigue literalmente la propuesta inicial, pero mezcla descarga de datos con interruptores y parámetros del restaurante.
- **Opción C — dentro de cada módulo:** ventas en Órdenes e inventario en Inventario. Es contextual, pero dispersa los reportes y dificulta encontrarlos.
- **Opción D — acceso principal en la barra inferior:** es muy visible, pero ocupa navegación diaria con una tarea principalmente administrativa.

**Recomendación:** Opción A. Mantiene `Opciones` enfocada en configuración, agrupa los documentos administrativos y permite restringir Reportes por permisos sin mostrarlos al mesero o a Cocina.

### Pregunta 26 — períodos disponibles en Reportes

**Decisión:** opción A aprobada por Luis el 2026-09-12. Los períodos serán `Hoy`, `Esta semana`, `Este mes` y `Personalizado`; la semana va de lunes a domingo y los rangos incluyen ambas fechas. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

¿Qué períodos debe poder seleccionar Administración antes de generar un reporte?

- **Opción A — accesos rápidos y rango personalizado (recomendada):** `Hoy`, `Esta semana`, `Este mes` y `Personalizado`. La semana se calcula de lunes a domingo, el mes corresponde al calendario y el rango personalizado incluye fecha inicial y final.
- **Opción B — solo semana y mes:** cumple el pedido básico y reduce controles, pero no permite revisar un día ni investigar un intervalo específico.
- **Opción C — reportes fijos automáticos:** el sistema genera únicamente un documento semanal y otro mensual al cerrar el período. Es cómodo para archivo, pero no permite consultar en cualquier momento.
- **Opción D — solo rango personalizado:** es flexible, pero obliga a elegir dos fechas incluso para consultas frecuentes.

**Recomendación:** Opción A. Los accesos rápidos resuelven el uso cotidiano con un toque y el rango personalizado permite auditorías sin añadir otro tipo de reporte.

### Pregunta 27 — contenido del reporte de ventas

**Decisión:** opción A aprobada por Luis el 2026-09-12. Incluirá total registrado, cuentas cerradas, promedio por cuenta, cantidades e importes por producto, mesa frente a para llevar y productos cancelados; no incluirá medios de pago ni ranking de empleados. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

El sistema no procesa pagos; por eso el documento informará ventas registradas a partir de cuentas cerradas. ¿Qué nivel de detalle debe incluir?

- **Opción A — resumen gerencial y detalle por producto (recomendada):** total registrado, cantidad de cuentas cerradas, ticket promedio, cantidades e importes por producto, separación entre mesa y para llevar y resumen de productos cancelados. No incluye ranking de empleados ni medios de pago.
- **Opción B — resumen mínimo:** total registrado, cantidad de cuentas y ticket promedio. Produce un PDF corto, pero no permite saber qué productos se vendieron.
- **Opción C — incluir desempeño por mesero:** añade cuentas, productos e importes atribuidos a cada mesero. Puede ser útil para supervisión, pero corre el riesgo de interpretarse como evaluación individual sin considerar turnos, mesas compartidas o correcciones.
- **Opción D — listado completo de cuentas:** detalla cada cuenta y cada línea del período. Es auditable, pero puede producir documentos muy extensos y dificulta ver tendencias.

**Recomendación:** Opción A. Permite entender cuánto se registró y qué se vendió sin convertir el reporte inicial en una auditoría extensa ni evaluar al personal con datos incompletos.

### Pregunta 28 — contenido del reporte de inventario

**Decisión:** opción A aprobada por Luis el 2026-09-12. Incluirá existencia actual, unidad, poco stock/agotados, entradas, consumo por recetas, devoluciones, ajustes y pérdidas resumidas por tipo. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

¿Qué debe incluir el PDF de inventario para el período seleccionado?

- **Opción A — estado actual y resumen de movimientos (recomendada):** existencia actual por material y unidad, materiales con poco stock o agotados, entradas del período, consumo por recetas, devoluciones por cancelación, ajustes y pérdidas registradas (`Producto dañado`, `Consumo interno` u otros motivos aprobados). Incluye totales resumidos por tipo de movimiento, no cada asiento individual.
- **Opción B — solo existencias actuales:** lista material, unidad, existencia y estado. Es compacto, pero no explica por qué cambió el inventario.
- **Opción C — solo movimientos del período:** muestra entradas y salidas, pero no ofrece una fotografía clara de lo disponible al generar el reporte.
- **Opción D — kardex completo:** imprime cada movimiento individual de cada material, con fecha y responsable. Es útil para auditoría profunda, pero puede producir cientos de páginas.

**Recomendación:** Opción A. Responde qué hay, qué está por agotarse y cómo cambió durante el período. Las cancelaciones que devolvieron receta aparecen como devoluciones; solo las pérdidas realmente registradas aparecen en la sección de pérdidas.

### Pregunta 29 — permisos para consultar Reportes

**Decisión:** opción A aprobada por Luis el 2026-09-12. Administración y encargado de turno acceden a ventas e inventario; Inventario solo al reporte de inventario; Mesero y Cocina no acceden. Los permisos se validan en el backend. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

¿Qué roles pueden abrir Reportes y descargar los PDF?

- **Opción A — permisos por responsabilidad (recomendada):** Administración y encargado de turno pueden generar ventas e inventario; el rol Inventario puede generar únicamente el reporte de inventario; Mesero y Cocina no ven el módulo.
- **Opción B — solo Administración:** ofrece el mayor control, pero impide que el encargado o responsable de inventario trabaje cuando Administración no está.
- **Opción C — cualquier usuario autenticado:** facilita el acceso, pero expone ventas y existencias a perfiles que no necesitan esa información.
- **Opción D — permiso individual configurable:** Administración decide usuario por usuario quién consulta ventas e inventario. Es flexible, pero agrega nuevos permisos y mantenimiento.

**Recomendación:** Opción A. Sigue las responsabilidades que ya existen, permite operar sin la administradora presente y evita exponer ventas a Mesero o Cocina. El backend validará el rol en cada descarga.

### Pregunta 30 — formato de los PDF

**Decisión:** opción A aprobada por Luis el 2026-09-12. Ventas será A4 vertical e Inventario A4 horizontal; ambos tendrán identidad del restaurante, período, generación, tablas paginadas, totales y numeración. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

¿Cómo se presentan los documentos descargados?

- **Opción A — plantillas A4 adaptadas a cada reporte (recomendada):** ventas en orientación vertical e inventario en horizontal para que las columnas respiren. Ambos incluyen nombre o logo del restaurante, tipo de reporte, período, fecha de generación, tablas paginadas, número de página y totales. Se generan localmente y se descargan desde el navegador.
- **Opción B — todos en A4 vertical:** mantiene un solo formato, pero las tablas de inventario pueden quedar estrechas o dividir columnas.
- **Opción C — formato de rollo de 80 mm:** permite imprimir en la impresora térmica, pero resulta incómodo para reportes semanales o mensuales extensos.
- **Opción D — PDF y hoja de cálculo desde el inicio:** añade también Excel/CSV. Es útil para análisis, pero duplica formatos y pruebas en la primera versión.

**Recomendación:** Opción A. Produce documentos profesionales para guardar o imprimir sin aumentar el alcance con hojas de cálculo; cada reporte usa la orientación que mejor acomoda sus datos.

### Pregunta 31 — generación y almacenamiento de reportes

**Decisión:** opción A aprobada por Luis el 2026-09-12. Los reportes se generan y descargan bajo demanda; el sistema no conserva copias permanentes de los PDF. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

¿El sistema debe conservar copias de cada PDF o generarlas solamente cuando alguien las solicita?

- **Opción A — generar y descargar bajo demanda (recomendada):** el usuario elige reporte y período, revisa un resumen y pulsa `Descargar PDF`. El archivo se crea en ese momento y no ocupa almacenamiento permanente dentro del sistema.
- **Opción B — archivar automáticamente cada semana y mes:** conserva un histórico inmutable de PDF, pero requiere administrar espacio, nombres, retención y reportes generados cuando quizá no se necesiten.
- **Opción C — descarga manual y archivo automático:** ofrece ambas posibilidades, pero duplica la lógica inicial y puede confundir entre un reporte histórico y uno regenerado.
- **Opción D — guardar cada descarga dentro del sistema:** mantiene una biblioteca de documentos, pero almacena duplicados cada vez que alguien repite una consulta.

**Recomendación:** Opción A. Los datos originales ya permanecen en SQLite y permiten regenerar cualquier período; almacenar copias de cada PDF no aporta información adicional y consume espacio en el equipo local.

### Pregunta 32 — retención de respaldos de actualización

**Decisión:** conservar las últimas tres actualizaciones, como indicó Luis el 2026-09-12. Al crear el cuarto punto se elimina solamente el respaldo automático de actualización más antiguo; los respaldos manuales y de jornada permanecen separados. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

Cada actualización creará un respaldo de la base y conservará la versión anterior de la aplicación. ¿Cuántos puntos de recuperación debe mantener automáticamente?

- **Opción A — las últimas cinco actualizaciones (recomendada):** permite regresar a varias versiones recientes y elimina solamente el punto automático más antiguo cuando se crea el sexto. Los respaldos manuales y de cierre de jornada se administran por separado y no se eliminan con esta regla.
- **Opción B — solo la actualización anterior:** ocupa menos espacio, pero una base o versión problemática podría reemplazar rápidamente el único punto útil.
- **Opción C — las últimas diez actualizaciones:** ofrece más historia, aunque consume más almacenamiento y probablemente excede la necesidad de un restaurante local.
- **Opción D — conservar todas:** maximiza el historial, pero el almacenamiento crecerá sin límite.

**Recomendación:** Opción A. Cinco versiones ofrecen margen suficiente para detectar un problema tardío sin convertir la carpeta de actualizaciones en un archivo indefinido.

### Pregunta 33 — datos al desinstalar

**Decisión:** opción A aprobada por Luis el 2026-09-12. El desinstalador elimina aplicación y servicio, pero conserva base, configuración y respaldos. Borrar datos será una acción separada y protegida. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

Si alguien desinstala Restaurante desde Windows, ¿qué debe ocurrir con la base SQLite y los respaldos de `ProgramData`?

- **Opción A — conservar siempre los datos (recomendada):** el desinstalador elimina el servicio y la aplicación, pero mantiene base, configuración y respaldos. Una reinstalación puede recuperar la operación. Para borrar datos habría una herramienta separada, con advertencia y confirmación reforzada.
- **Opción B — preguntar durante la desinstalación:** ofrecer `Conservar` o `Eliminar`. Es flexible, pero alguien puede marcar la opción destructiva sin comprender su alcance.
- **Opción C — eliminar aplicación y datos:** deja el equipo limpio, pero una desinstalación accidental destruye el historial del restaurante.
- **Opción D — exigir exportar un respaldo y luego eliminar:** protege una copia, pero complica una reinstalación rápida y depende de que el destino del respaldo esté disponible.

**Recomendación:** Opción A. Desinstalar software no debe equivaler a borrar información operativa; la eliminación de datos debe ser una acción distinta y deliberada.

### Pregunta 34 — cuentas abiertas en el reporte de ventas

**Decisión:** opción A aprobada por Luis el 2026-09-12. El total incluirá solo cuentas cerradas; las cuentas abiertas y su monto provisional aparecerán en una nota separada y no se sumarán. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

Si se genera el reporte mientras existen mesas o pedidos todavía abiertos, ¿deben formar parte del total de ventas registradas?

- **Opción A — excluirlas del total y mostrar una advertencia (recomendada):** el reporte suma únicamente cuentas cerradas. En una nota separada informa cuántas cuentas permanecen abiertas y su monto provisional, claramente fuera del total.
- **Opción B — incluirlas como ventas:** ofrece una cifra más inmediata, pero el total puede cambiar por correcciones, cancelaciones o productos nuevos.
- **Opción C — bloquear el reporte hasta cerrar todo:** garantiza un corte definitivo, pero impide revisar ventas durante la jornada.
- **Opción D — permitir elegir incluirlas:** es flexible, pero dos reportes del mismo período podrían mostrar totales distintos sin una explicación evidente.

**Recomendación:** Opción A. Mantiene estable el total del PDF y permite conocer la operación pendiente sin confundirla con cuentas ya cerradas.

### Pregunta 35 — fecha de una venta que cruza medianoche

**Decisión ampliada por Luis el 2026-09-12:** habrá una jornada predeterminada, pero el restaurante podrá configurar uno o varios turnos operativos en la misma fecha y abrir/cerrar cada uno según su operación real. Solo una jornada puede estar abierta a la vez. Una jornada nocturna pertenece a la fecha operativa en que se abrió aunque cierre después de medianoche. El reporte diario suma sus turnos y mantiene el desglose. La configuración y los casos de turno olvidado quedaron definidos en las preguntas 36 a 41. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

Si una jornada comenzó el viernes y una cuenta se cerró después de medianoche, ¿a qué día pertenece en los reportes?

- **Opción A — jornada operativa (recomendada):** todas las cuentas pertenecen a la fecha de la jornada en que se crearon, aunque cierren de madrugada. El turno del viernes permanece completo en el viernes.
- **Opción B — fecha y hora de cierre:** la cuenta pertenece al sábado porque se cerró después de medianoche. Es literal, pero divide un mismo turno entre dos días.
- **Opción C — fecha de cada orden:** una misma cuenta puede repartir sus productos entre viernes y sábado. Es detallado, pero dificulta cuadrar el total de la cuenta.
- **Opción D — hora de corte configurable:** Administración define, por ejemplo, que el día cambia a las 04:00. Es flexible, pero duplica una función que ya cumple la jornada operativa.

**Recomendación:** Opción A. El sistema ya agrupa cuentas, órdenes e incidencias por jornada; usarla también en Reportes evita partir un servicio nocturno y facilita comparar los cierres diarios.

### Pregunta 36 — configuración de turnos operativos

**Decisión:** opción A aprobada por Luis el 2026-09-12. Habrá `Jornada general` por defecto y plantillas configurables con nombre; apertura y cierre serán manuales, y los horarios opcionales solo informativos. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

¿Cómo debe definir Administración los turnos que aparecen al abrir una jornada?

- **Opción A — plantillas de turnos con nombre, apertura y cierre manuales (recomendada):** inicialmente existe `Jornada general`. Administración puede crear nombres como `Almuerzo` y `Noche`. Al abrir, elige el turno; al cerrar, confirma el cierre real. Los horarios configurados son informativos y no abren ni cierran automáticamente.
- **Opción B — horarios automáticos:** Administración configura horas y el sistema abre/cierra turnos solo. Reduce acciones, pero puede cerrar en medio de una cuenta o fallar cuando el restaurante cambia su horario.
- **Opción C — escribir el nombre cada vez:** no mantiene plantillas; al abrir se escribe `Almuerzo`, `Noche` u otro. Es flexible, pero produce nombres inconsistentes y requiere teclear diariamente.
- **Opción D — numeración automática sin nombres:** usa `Turno 1`, `Turno 2`, etc. Es simple, pero los reportes son menos claros y no distingue naturalmente Almuerzo de Noche.

**Recomendación:** Opción A. Permite uno o varios turnos con nombres claros, respeta los horarios reales del restaurante y evita automatizar un cierre que podría interrumpir la operación.

### Pregunta 37 — permiso para abrir y cerrar turnos

**Decisión:** opción A aprobada por Luis el 2026-09-12. Administración y encargado de turno pueden abrir y cerrar; se registra responsable y hora, y el cierre se bloquea con cuentas, Cocina o incidencias pendientes. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

¿Qué roles pueden abrir y cerrar una jornada operativa?

- **Opción A — Administración y encargado de turno (recomendada):** cualquiera de los dos puede abrir o cerrar, queda registrado como responsable y el cierre se bloquea si existen cuentas, tareas de Cocina o incidencias pendientes.
- **Opción B — solo Administración:** ofrece mayor control, pero impide comenzar o terminar el servicio si la administradora no está.
- **Opción C — cualquier empleado autenticado:** evita bloqueos de operación, pero un mesero o Cocina podría cerrar el turno por error.
- **Opción D — permiso individual configurable:** Administración asigna la capacidad usuario por usuario. Es flexible, pero agrega otro permiso que mantener además del rol de encargado.

**Recomendación:** Opción A. El encargado existe precisamente para asumir operaciones críticas cuando Administración no está, sin extender el permiso a todo el personal.

### Pregunta 38 — turno anterior olvidado abierto

**Decisión ampliada por Luis el 2026-09-12:** opción A, pero el cierre del turno debe permitir cerrar todas las cuentas abiertas en una sola operación después de mostrar un resumen y solicitar confirmación, sin cerrar cada cuenta por separado ni imprimir precuentas. Pendiente de definir el tratamiento de Cocina/incidencias, implementar y verificar; no se marca con `[x]` todavía.

Si al día siguiente la aplicación detecta que el turno anterior sigue abierto, ¿qué debe hacer?

- **Opción A — bloquear nuevas operaciones y pedir revisión (recomendada):** muestra `El turno anterior sigue abierto`. Administración o encargado revisa pendientes y lo cierra antes de abrir el nuevo. Si no quedan pendientes, puede cerrarlo con la hora real o indicar una hora de cierre corregida, dejando auditoría.
- **Opción B — cerrarlo automáticamente al detectar el nuevo día:** evita intervención, pero puede cerrar con mesas, incidencias o registros todavía activos y asignar una hora falsa.
- **Opción C — continuar usando el turno anterior:** no interrumpe el trabajo, pero mezcla ventas de fechas y turnos distintos.
- **Opción D — permitir abrir otro turno:** mantiene la operación, pero rompe la regla de una sola jornada abierta y dificulta atribuir órdenes e inventario.

**Recomendación:** Opción A. Nunca inventa un cierre ni mezcla días; permite corregir el olvido con trazabilidad y sin perder información.

### Pregunta 39 — cierre masivo con trabajo pendiente

**Decisión:** opción A aprobada por Luis el 2026-09-12. El cierre masivo se bloquea con preparación o incidencias pendientes; los productos listos pueden confirmarse como entregados desde el resumen. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

Al cerrar todas las cuentas junto con el turno, ¿qué ocurre si todavía hay productos `Por preparar`, `En preparación`, `Listos` sin entrega o incidencias pendientes?

- **Opción A — bloquear solo por Cocina e incidencias (recomendada):** el cierre masivo resuelve las cuentas administrativas que quedaron abiertas, pero no puede ejecutarse hasta completar o cancelar el trabajo de Cocina y resolver incidencias. Los productos `Listos` pueden marcarse entregados desde el resumen antes de confirmar.
- **Opción B — cancelar automáticamente todo lo pendiente:** cancela productos, devuelve stock y cierra cuentas. Es rápido, pero puede descartar operativamente pedidos que sí fueron preparados o entregados.
- **Opción C — cerrar cuentas y dejar Cocina pendiente:** permite finalizar el turno, pero deja comandas sin una cuenta activa y mezcla trabajo entre jornadas.
- **Opción D — preguntar cuenta por cuenta:** permite decidir cada caso, pero contradice el objetivo de un cierre masivo rápido.

**Recomendación:** Opción A. Automatiza el trabajo administrativo repetitivo sin tomar decisiones irreversibles sobre comida o incidencias que necesitan resolución humana.

### Pregunta 40 — autorización del cierre masivo

**Decisión personalizada por Luis el 2026-09-12:** mostrar una ventana emergente que exige usuario y contraseña de Administración o encargado de turno. No se utilizará PIN para esta operación. Una autenticación autoriza el cierre masivo completo y queda registrada. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

Cerrar varias cuentas y el turno en una sola operación tiene un impacto alto. ¿Qué confirmación debe exigir?

- **Opción A — un PIN autorizado para toda la operación:** después de revisar el resumen, Administración o encargado introduce su PIN una sola vez. No se pide por cada cuenta; el sistema registra actor, cuentas, total y hora.
- **Opción B — solo el botón de confirmación:** si la sesión ya corresponde a Administración o encargado, no solicita PIN. Es más rápido, pero una sesión desatendida permitiría cerrar todo el turno.
- **Opción C — usuario y contraseña (seleccionada):** muestra una ventana emergente después del resumen. Solo acepta las credenciales de Administración o encargado de turno, autoriza una vez toda la operación y registra quién realizó el cierre.
- **Opción D — configurable:** Administración decide si exige PIN. Es flexible, pero permite desactivar la protección de una acción masiva difícil de revertir.

**Decisión final:** Opción C, elegida por Luis. Para esta operación masiva se prioriza una reautenticación explícita sobre la rapidez del PIN. La contraseña no se muestra ni se conserva en el registro; la auditoría guarda el usuario autorizado, la fecha, la hora, el turno y las cuentas cerradas.

### Pregunta 41 — hora de cierre de un turno olvidado

**Decisión:** opción A aprobada por Luis el 2026-09-12. El sistema propone la hora actual y permite indicar opcionalmente la fecha y hora reales del cierre olvidado; conserva en auditoría tanto el momento de registro como la hora corregida. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

Si Administración o el encargado encuentra al día siguiente un turno que quedó abierto, ¿qué hora debe registrar el sistema al cerrarlo?

- **Opción A — hora actual con corrección opcional (recomendada):** propone la hora actual, pero permite activar `Indicar hora real de cierre`, elegir una fecha y hora anterior válidas y deja auditado tanto el momento de registro como la hora corregida.
- **Opción B — siempre la hora actual:** es la opción más rápida, pero el reporte mostrará que el turno terminó al día siguiente aunque el restaurante haya cerrado mucho antes.
- **Opción C — exigir la hora real:** obliga a elegir fecha y hora cada vez que se corrige un turno olvidado. Mejora el dato, pero puede bloquear al encargado si no conoce la hora exacta.
- **Opción D — usar el último movimiento:** toma automáticamente la hora de la última orden o ajuste. Es una aproximación y puede ser anterior al cierre real del restaurante.

**Recomendación:** Opción A. No obliga a inventar una hora que el usuario desconoce, mantiene rápido el cierre y permite corregir el reporte cuando sí se conoce el horario real, conservando trazabilidad de ambos momentos.

### Pregunta 42 — recuperación manual después de una actualización

**Decisión:** opción A aprobada por Luis el 2026-09-12. Habrá una herramienta gráfica `Restaurar versión anterior` accesible desde el menú Inicio, con las últimas tres versiones, respaldo preventivo del estado actual, restauración conjunta de aplicación y base compatible, verificación de arranque y registro del resultado. Requerirá permisos de administrador de Windows. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

El instalador hará respaldo y reversión automática si la actualización falla. Si el problema se descubre horas después, ¿cómo debe recuperar Administración una versión anterior?

- **Opción A — herramienta gráfica de recuperación (recomendada):** agrega `Restaurar versión anterior` al menú Inicio. Muestra las últimas tres versiones con fecha, crea un respaldo de seguridad del estado actual, restaura la versión seleccionada junto con su base compatible, verifica el arranque y registra el resultado. Requiere permisos de administrador de Windows.
- **Opción B — ejecutar nuevamente un instalador anterior:** requiere conservar y localizar manualmente el instalador correcto; puede no restaurar la base compatible.
- **Opción C — solo reversión automática durante la instalación:** es más simple, pero no permite recuperarse de errores detectados durante la operación posterior.
- **Opción D — restaurar solamente la base de datos:** recupera información anterior, pero puede dejarla incompatible con la versión instalada de la aplicación.

**Recomendación:** Opción A. Completa el objetivo de recuperación sin depender de comandos ni archivos manuales y mantiene alineadas la aplicación y la base de datos.

### Pregunta 43 — conservación de respaldos por cierre de turno

**Decisión:** opción A aprobada por Luis el 2026-09-12. Se conservarán automáticamente todos los respaldos de cierres de los últimos 30 días; al vencer el período se eliminan solo los respaldos operativos antiguos. Los respaldos manuales y los tres puntos de recuperación de actualizaciones permanecen separados. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

El sistema ya crea un respaldo al cerrar cada jornada o turno. ¿Durante cuánto tiempo debe conservar automáticamente esos respaldos operativos?

- **Opción A — últimos 30 días (recomendada):** conserva todos los cierres de los últimos 30 días y elimina automáticamente solo los más antiguos. Los respaldos manuales y de actualización siguen separados y no se eliminan con esta regla.
- **Opción B — últimos 7 días:** utiliza menos espacio, pero reduce mucho el margen para descubrir y recuperar un problema antiguo.
- **Opción C — últimos 90 días:** ofrece más historia, aunque hace crecer innecesariamente el almacenamiento local.
- **Opción D — conservarlos todos:** evita eliminaciones automáticas, pero el espacio usado aumenta indefinidamente.

**Recomendación:** Opción A. Un mes da margen suficiente para detectar errores tardíos sin crecimiento ilimitado; además, SQLite permite que estos respaldos sean relativamente compactos y la rotación no afecta los tres puntos de recuperación de actualizaciones.

### Pregunta 44 — copia fuera del computador principal

**Decisión:** opción C aprobada por Luis el 2026-09-12. Esta entrega mantendrá únicamente respaldos locales, sin recordatorio ni exportación externa integrada. Se acepta expresamente que una falla o pérdida completa del disco puede afectar la base y sus copias. Pendiente de implementar y verificar la política local; no se marca con `[x]` todavía.

Los respaldos locales no protegen frente a daño, robo o pérdida completa del computador. ¿Cómo debe facilitar el sistema una copia externa sin depender de servicios en la nube?

- **Opción A — exportación guiada con recordatorio (recomendada):** Administración dispone de `Exportar respaldo`, elige una memoria USB o carpeta de red y el sistema copia y verifica el archivo. Si pasan siete días sin una exportación externa exitosa, muestra un aviso discreto en Administración; nunca interrumpe la operación.
- **Opción B — copia automática a un destino configurado:** al cerrar el turno intenta copiar a una memoria o carpeta de red. Es más automático, pero genera errores frecuentes si el dispositivo no está conectado o cambia de ruta.
- **Opción C — solamente respaldos locales:** no añade pasos ni avisos, pero una falla del disco puede eliminar simultáneamente la base y todas sus copias.
- **Opción D — respaldo en nube:** protege fuera del local, pero requiere conexión, cuenta externa, cifrado y una política de privacidad; queda fuera del alcance local actual.

**Recomendación:** Opción A. Mantiene el sistema local y simple, no exige que una memoria esté siempre conectada y ofrece protección real contra la pérdida del equipo sin bloquear el servicio.

### Pregunta 45 — cuentas vacías durante el cierre masivo

**Decisión:** opción A aprobada por Luis el 2026-09-12. Las cuentas abiertas sin órdenes ni productos se mostrarán en el resumen y se anularán dentro del cierre masivo con el motivo automático `Cuenta vacía al cerrar turno`. Liberan la mesa, quedan auditadas y no cuentan como venta ni como cuenta cerrada con consumo. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

Si durante el cierre masivo existe una cuenta abierta por error, sin órdenes ni productos, ¿qué debe hacer el sistema?

- **Opción A — anularla dentro del cierre masivo (recomendada):** la identifica claramente en el resumen y la anula con el motivo automático `Cuenta vacía al cerrar turno`. Libera la mesa, conserva el evento de auditoría y no la incluye como venta ni como cuenta cerrada con consumo.
- **Opción B — cerrarla con total cero:** evita usar el estado de anulación, pero aumenta artificialmente la cantidad de cuentas cerradas y reduce el promedio por cuenta en Reportes.
- **Opción C — bloquear el cierre hasta resolverla manualmente:** es estricto, aunque obliga a entrar a una cuenta que no tiene información que revisar.
- **Opción D — ignorarla y dejarla abierta:** permite cerrar el turno con una cuenta activa, contradice las reglas de jornada y puede mantener la mesa ocupada.

**Recomendación:** Opción A. Resuelve de forma segura un registro vacío, no distorsiona Reportes y mantiene trazabilidad sin añadir trabajo repetitivo.

### Pregunta 46 — productos listos sin confirmación de entrega al cerrar

**Decisión:** opción A aprobada por Luis el 2026-09-12 y aclarada posteriormente. La autoconfirmación de entrega permanece activada por defecto a los 30 minutos. El resumen de cierre mostrará únicamente los productos que todavía sigan `Listos` —porque aún no venció el plazo, Administración desactivó la función o el temporizador estuvo pausado— y ofrecerá una sola acción `Marcar todos como entregados`. No duplica ni reemplaza la autoconfirmación. La auditoría registrará que Administración o el encargado regularizó la entrega durante el cierre. Los pedidos para llevar conservan su confirmación manual `Retirado` y no entran en esta regla. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

El cierre del turno se encuentra con productos que Cocina marcó `Listo`, pero que el mesero no confirmó como `Entregado`. ¿Cómo debe resolverlos Administración o el encargado desde el resumen?

- **Opción A — una acción para marcarlos todos como entregados (recomendada):** el resumen muestra cantidad, cuentas y productos afectados. El usuario pulsa `Marcar todos como entregados`; el sistema registra que la confirmación fue realizada durante el cierre y permite continuar sin abrir cada cuenta.
- **Opción B — confirmar cuenta por cuenta:** ofrece más revisión, pero contradice el cierre masivo y obliga a repetir la misma acción.
- **Opción C — marcarlos automáticamente al confirmar el cierre:** es más rápido, aunque cambia estados sin que la acción sea visible antes de ejecutarse.
- **Opción D — bloquear hasta que cada mesero los confirme:** conserva el flujo normal, pero puede impedir cerrar cuando los meseros ya terminaron su turno.

**Recomendación:** Opción A. Mantiene una decisión explícita y visible, pero permite resolver de una vez todos los productos listos y deja claro en auditoría que fue una regularización del cierre.

### Pregunta 47 — apertura de la aplicación instalada en Windows

**Decisión:** opción A aprobada por Luis el 2026-09-12. El acceso directo intentará abrir la interfaz en una ventana dedicada de Microsoft Edge en modo aplicación, sin pestañas ni barra de direcciones; si no está disponible, utilizará el navegador predeterminado. No se incorporará Electron. Pendiente de implementar y verificar en Windows; no se marca con `[x]` todavía.

Cuando el usuario haga doble clic en el acceso directo `Restaurante`, ¿cómo debe abrirse la interfaz React que sirve el backend Go local?

- **Opción A — ventana dedicada del navegador con respaldo (recomendada):** el acceso intenta abrir Microsoft Edge en modo aplicación, sin pestañas ni barra de direcciones; si ese modo no está disponible, abre la dirección local en el navegador predeterminado. No instala Electron ni duplica el frontend.
- **Opción B — pestaña del navegador predeterminado:** es la solución más simple y compatible, pero se mezcla con las demás pestañas y se puede cerrar o cambiar de página por error.
- **Opción C — aplicación de escritorio empaquetada:** envolver React en Electron o una tecnología similar. Ofrece una ventana propia, pero aumenta mucho el tamaño, las dependencias, las actualizaciones y las pruebas.
- **Opción D — no crear acceso directo:** el usuario escribe o guarda manualmente la dirección local. Reduce trabajo del instalador, pero empeora la experiencia cotidiana.

**Recomendación:** Opción A. Se siente como una aplicación de escritorio, conserva un solo frontend web para computador, tablet y teléfono y evita añadir un segundo runtime pesado al instalador.

### Pregunta 48 — espera durante el arranque del servicio local

**Decisión:** opción A aprobada por Luis el 2026-09-12. El iniciador mostrará `Iniciando Restaurante…`, consultará la salud real del servicio Go y abrirá la interfaz solamente cuando responda. Si vence el plazo, ofrecerá `Reintentar` y `Ver diagnóstico`, sin exponer `Failed to fetch`. Pendiente de implementar y verificar en Windows; no se marca con `[x]` todavía.

Al abrir el acceso directo, Windows puede tardar unos segundos en iniciar el servicio Go. ¿Qué debe ver el usuario mientras la API todavía no responde?

- **Opción A — iniciador con espera y recuperación (recomendada):** muestra una ventana pequeña `Iniciando Restaurante…` con progreso, consulta la salud del servicio y abre la interfaz solamente cuando esté lista. Si no responde dentro del plazo, ofrece `Reintentar` y `Ver diagnóstico`, sin mostrar el error técnico `Failed to fetch`.
- **Opción B — abrir la interfaz inmediatamente:** reduce el trabajo del iniciador, pero puede mostrar errores de conexión mientras el servicio todavía arranca.
- **Opción C — esperar un tiempo fijo:** muestra el inicio después de, por ejemplo, cinco segundos. Es simple, aunque puede esperar de más o abrir demasiado pronto según el computador.
- **Opción D — reintento silencioso dentro de React:** la pantalla abre vacía y React sigue intentando conectarse. Evita una ventana adicional, pero el usuario no sabe si el sistema está arrancando o falló.

**Recomendación:** Opción A. El estado de salud real determina cuándo abrir, elimina el error técnico visible y ofrece una recuperación comprensible si el servicio no inicia.

### Pregunta 49 — contenido de `Ver diagnóstico`

**Decisión:** opción A aprobada y ampliada por Luis el 2026-09-12. La vista principal mostrará un resumen comprensible del estado del servicio, la base y el puerto, con `Reiniciar servicio` y `Copiar diagnóstico`. `Ver detalles` calculará en el momento información técnica útil: estado del servicio y de la API, versión instalada, puerto local, comprobación de acceso a la base, dirección de red local y espacio disponible. La información para copiar se genera bajo demanda, no se guarda y excluye contraseñas, sesiones y datos operativos del restaurante. Windows solicitará permisos de administrador solamente cuando sean necesarios para reiniciar el servicio. Pendiente de implementar y verificar en Windows; no se marca con `[x]` todavía.

Si el servicio Go no logra iniciar y el usuario pulsa `Ver diagnóstico`, ¿qué debe mostrar la herramienta?

- **Opción A — resumen comprensible y acciones seguras (recomendada):** informa por separado el estado del servicio, la base de datos y el puerto local; ofrece `Reiniciar servicio` y `Copiar diagnóstico`. Los detalles técnicos quedan dentro de `Ver detalles`, y Windows solicita permiso de administrador solo si hace falta reiniciar el servicio.
- **Opción B — mostrar directamente el registro técnico:** entrega toda la información al soporte, pero presenta mensajes difíciles de entender y puede exponer rutas o datos innecesarios al usuario.
- **Opción C — mostrar únicamente `Contacte a soporte`:** es simple, pero no permite resolver un servicio detenido ni compartir información útil.
- **Opción D — reiniciar automáticamente sin mostrar nada:** puede resolver fallas transitorias, pero oculta errores persistentes y podría entrar en un ciclo de reinicios.

**Recomendación:** Opción A. Ayuda al restaurante a recuperar una falla sencilla sin conocimientos técnicos y permite enviar un diagnóstico limpio si necesita soporte.

### Pregunta 50 — conservación de registros técnicos

**Decisión:** opción C aprobada por Luis el 2026-09-12. Los logs se conservarán durante 30 días con un límite total de 100 MB; la rotación eliminará primero los más antiguos al alcanzar cualquiera de los dos límites. Serán independientes del diagnóstico instantáneo y no incluirán contraseñas, tokens, sesiones ni contenido sensible de las órdenes. Pendiente de implementar y verificar en Windows; no se marca con `[x]` todavía.

¿Cuánto historial de registros del servicio debe conservar el computador para poder diagnosticar una falla que no se reportó inmediatamente?

- **Opción A — 14 días con límite de 50 MB (recomendada):** conserva registros recientes y rota automáticamente los más antiguos al alcanzar cualquiera de los dos límites. No registra contraseñas, tokens ni contenido sensible de las órdenes.
- **Opción B — solamente el arranque actual:** ocupa muy poco, pero pierde la evidencia al reiniciar el servicio o el computador.
- **Opción C — 30 días con límite de 100 MB:** ofrece más historia, aunque normalmente es innecesaria para diagnosticar una aplicación local.
- **Opción D — conservar todo:** facilita investigar problemas antiguos, pero el espacio crece sin límite.

**Recomendación:** Opción A. Dos semanas suelen cubrir fallas intermitentes y el límite impide que los registros consuman almacenamiento indefinidamente. El diagnóstico actual seguirá calculándose en el momento y no se almacenará como otro archivo.

### Pregunta 51 — recuperación de contraseña administrativa

**Decisión:** opción C aprobada por Luis el 2026-09-12. Otro administrador podrá restablecer la contraseña desde `Usuarios`; si no existe otro disponible, la cuenta se recuperará localmente mediante preguntas de seguridad. No dependerá de correo ni nube, y las respuestas protegidas nunca se mostrarán. La cantidad, el catálogo y los intentos quedaron definidos en las preguntas 52 a 54. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

Si la única cuenta de Administración olvida su contraseña, ¿cómo debe recuperar el acceso en un sistema que funciona localmente?

- **Opción A — restablecimiento local controlado (recomendada):** otro administrador puede cambiarla desde Usuarios. Si no existe otro, una herramienta de recuperación disponible solo en el computador servidor solicita permisos de administrador de Windows y permite crear una contraseña nueva; nunca muestra la anterior y registra el restablecimiento en la auditoría.
- **Opción B — contraseña maestra fija:** permite entrar rápidamente, pero una clave compartida o filtrada compromete todas las instalaciones.
- **Opción C — preguntas de seguridad:** no requiere otra cuenta, aunque las respuestas suelen ser fáciles de descubrir y agregan datos que mantener.
- **Opción D — reinstalar o restaurar la aplicación:** evita una herramienta especial, pero una contraseña olvidada se convierte innecesariamente en una operación técnica con riesgo para los datos.

**Decisión final:** Opción C, elegida por Luis. Se acepta que las preguntas de seguridad ofrecen menos protección que una recuperación ligada al administrador de Windows, a cambio de una recuperación más sencilla y completamente dentro de la aplicación local.

### Pregunta 52 — cantidad de preguntas de seguridad

**Decisión:** opción A aprobada y ampliada por Luis el 2026-09-12. La cuenta configurará tres preguntas y deberá responder correctamente dos seleccionadas por el sistema. No se admitirán preguntas basadas en datos públicos o fáciles de adivinar, como fecha de nacimiento, ciudad, nombres de familiares o color favorito. Las respuestas nunca se mostrarán y se almacenarán protegidas. Pendiente de completar la selección de preguntas, implementar y verificar; no se marca con `[x]` todavía.

¿Cuántas respuestas correctas debe exigir la recuperación de la única cuenta administrativa?

- **Opción A — configurar tres y responder dos (recomendada):** durante la configuración inicial se registran tres preguntas; al recuperar, el sistema elige dos. Tolera que se olvide una respuesta y evita depender de una sola pregunta.
- **Opción B — una sola pregunta:** es muy rápida, pero una respuesta conocida por empleados o familiares permitiría cambiar la contraseña.
- **Opción C — responder las tres:** ofrece más control, aunque olvidar una sola respuesta obliga a una recuperación técnica.
- **Opción D — configurar dos y responder una:** es más flexible que una pregunta única, pero la recuperación sigue dependiendo de una sola respuesta correcta.

**Recomendación:** Opción A. Mantiene el flujo local y sencillo, pero reduce el riesgo de que una sola respuesta fácil permita apropiarse de la cuenta.

### Pregunta 53 — origen de las preguntas de seguridad

**Decisión:** opción A aprobada por Luis el 2026-09-12. El sistema tendrá un catálogo controlado de preguntas no triviales; cada administrador elegirá tres preguntas distintas y no podrá escribir preguntas propias. Pendiente de redactar y revisar el catálogo, implementar y verificar; no se marca con `[x]` todavía.

¿Cómo seleccionará Administración las tres preguntas para evitar que se usen preguntas débiles?

- **Opción A — catálogo controlado de preguntas (recomendada):** el sistema ofrece una lista revisada y el administrador elige tres distintas. Se excluyen preguntas cuya respuesta suele ser pública o de pocas opciones; no se permite escribir una pregunta propia.
- **Opción B — catálogo más pregunta personalizada:** permite escoger preguntas del sistema o escribir una propia. Es flexible, pero el usuario podría crear una pregunta evidente o incluir parte de la respuesta en el texto.
- **Opción C — todas personalizadas:** se adapta a cada persona, aunque es difícil validar automáticamente que no sean fáciles de adivinar.
- **Opción D — tres preguntas fijas para todos:** simplifica la pantalla, pero quien conozca el sistema sabrá exactamente qué información investigar.

**Recomendación:** Opción A. Mantiene variedad entre cuentas y permite controlar la calidad de las preguntas sin pedirle al usuario que evalúe su propia seguridad.

### Pregunta 54 — intentos fallidos de recuperación

**Decisión:** opción A aprobada por Luis el 2026-09-12. Después de cinco intentos fallidos, la recuperación se pausa durante 15 minutos. La pausa afecta solamente nuevas recuperaciones, no cierra sesiones activas ni bloquea la operación normal; el evento se audita sin guardar las respuestas introducidas. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

Si alguien responde incorrectamente las preguntas de seguridad varias veces, ¿qué debe hacer el sistema?

- **Opción A — cinco intentos y pausa de 15 minutos (recomendada):** después de cinco recuperaciones fallidas bloquea temporalmente nuevos intentos durante 15 minutos. No bloquea permanentemente la cuenta y registra el evento sin guardar las respuestas escritas.
- **Opción B — tres intentos y pausa de 30 minutos:** protege más, pero un error de escritura puede detener demasiado tiempo al restaurante.
- **Opción C — intentos ilimitados:** evita bloqueos operativos, pero permite probar respuestas repetidamente sin ninguna barrera.
- **Opción D — bloqueo permanente:** exige intervención técnica después del límite; ofrece control fuerte, pero puede dejar al restaurante sin Administración.

**Recomendación:** Opción A. Es una protección ligera adecuada para un sistema local: frena intentos repetidos sin convertir un olvido legítimo en un bloqueo largo o definitivo.

### Pregunta 55 — regla de contraseña administrativa

**Decisión personalizada por Luis el 2026-09-12:** opción D, con la opción A habilitada por defecto y marcada como recomendada. Inicialmente se exigirán ocho caracteres, se permitirán frases, se rechazarán claves demasiado comunes y no habrá vencimiento periódico; Administración podrá cambiar la política del restaurante. Pendiente de definir los controles configurables, implementar y verificar; no se marca con `[x]` todavía.

¿Qué requisitos debe tener la contraseña usada por Administración y encargado de turno, incluida la confirmación del cierre masivo?

- **Opción A — mínimo ocho caracteres sin reglas artificiales (recomendada):** permite frases fáciles de recordar, exige al menos ocho caracteres, rechaza contraseñas vacías o demasiado comunes y no obliga a cambiarla periódicamente. Puede mostrar un indicador sencillo de calidad.
- **Opción B — mínimo seis caracteres:** facilita escribirla en una pantalla táctil, pero ofrece poca protección para acciones administrativas.
- **Opción C — mínimo doce caracteres con mayúscula, minúscula, número y símbolo:** es más estricta, aunque dificulta el uso rápido y fomenta contraseñas anotadas o patrones predecibles.
- **Opción D — reglas configurables por restaurante:** da flexibilidad, pero agrega configuración técnica innecesaria y permite debilitar el acceso.

**Recomendación:** Opción A. Para un sistema local ofrece una protección razonable sin imponer cambios periódicos ni combinaciones difíciles de usar en una pantalla táctil.

### Pregunta 56 — presentación de la política configurable

**Decisión personalizada por Luis el 2026-09-12:** Administración elegirá solamente entre `Simple` y `Recomendada`, con una explicación clara. Se elimina el nivel `Reforzada`. `Recomendada` quedará seleccionado al instalar. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

¿Cómo debe cambiar Administración los requisitos de contraseña?

- **Opción A — niveles predefinidos (seleccionada y ajustada):** `Simple` y `Recomendada`, mostrando claramente los requisitos de cada una. `Recomendada` queda seleccionada al instalar. Se eliminó `Reforzada` por decisión posterior.
- **Opción B — controles independientes:** permite elegir longitud mínima y activar mayúscula, número, símbolo, bloqueo de claves comunes y vencimiento. Es flexible, pero crea una pantalla técnica y puede producir reglas difíciles de usar.
- **Opción C — configurar únicamente la longitud:** mantiene una interfaz sencilla, aunque no permite decidir sobre claves comunes ni composición.
- **Opción D — escribir una regla personalizada:** máxima flexibilidad técnica, pero no es apropiada para una configuración operativa de restaurante.

**Recomendación:** Opción A. Conserva la configuración solicitada sin obligar a comprender opciones técnicas; cada nivel puede explicarse en lenguaje sencillo y probarse de forma consistente.

### Pregunta 57 — requisitos de los niveles

**Decisión personalizada por Luis el 2026-09-12:** `Simple` exige un mínimo de 6 caracteres y `Recomendada` un mínimo de 8; ambos rechazan contraseñas demasiado comunes. Mayúsculas, números y símbolos están permitidos, pero son opcionales. No existe vencimiento periódico y se elimina el nivel `Reforzada`. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

¿Qué debe exigir cada nivel de contraseña?

- **Opción A — longitud y bloqueo de claves comunes (seleccionada y ajustada):** `Simple`: mínimo 6 caracteres; `Recomendada`: mínimo 8. Ambos rechazan claves comunes; mayúsculas, números y símbolos son opcionales y no hay cambios periódicos. Se eliminó `Reforzada`.
- **Opción B — complejidad progresiva:** `Simple`: 6 caracteres; `Recomendada`: 8 y un número; `Reforzada`: 12 con mayúscula, minúscula, número y símbolo. Es reconocible, pero puede fomentar patrones previsibles como terminar en `1!`.
- **Opción C — frases para los niveles superiores:** `Simple`: 6 caracteres; `Recomendada`: 10; `Reforzada`: 16. No exige tipos de caracteres y favorece frases más largas, aunque aumenta la escritura en pantallas táctiles.
- **Opción D — reducir todos los mínimos:** `Simple`: 4; `Recomendada`: 6; `Reforzada`: 8. Es rápida, pero demasiado débil para acciones como cerrar turnos o administrar usuarios.

**Decisión final:** se adopta la opción A sin el nivel `Reforzada`. Los dos niveles restantes permiten frases fáciles de recordar y evitan reglas artificiales, manteniendo rápido el uso local.

### Pregunta 58 — cambio de política y contraseñas existentes

**Decisión:** opción A aprobada por Luis el 2026-09-12. Al cambiar de `Simple` a `Recomendada`, las sesiones activas continúan. En su siguiente inicio, cada usuario cuya contraseña no cumpla entra con su clave vigente y debe crear una nueva antes de continuar. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

Si Administración cambia la política de `Simple` a `Recomendada` y algún usuario tiene una contraseña de menos de ocho caracteres, ¿qué debe ocurrir?

- **Opción A — solicitar cambio en el próximo inicio de sesión (recomendada):** la sesión actual continúa; la próxima vez, el usuario entra con su contraseña vigente y debe crear una que cumpla la nueva política antes de seguir. No queda bloqueado sin aviso.
- **Opción B — aplicar solo a contraseñas nuevas:** nadie debe cambiar su clave existente, pero la política puede quedar activada mientras varias cuentas todavía no la cumplen.
- **Opción C — cerrar y bloquear inmediatamente:** obliga a corregir todas las cuentas, pero puede interrumpir el servicio y requerir que Administración atienda a cada usuario.
- **Opción D — preguntar al cambiar la política:** ofrece `Aplicar a todos` o `Solo nuevas`. Es flexible, aunque añade otra decisión administrativa y produce comportamientos distintos entre instalaciones.

**Recomendación:** Opción A. Hace efectiva la nueva política sin cerrar sesiones durante la operación ni exigir que Administración cambie todas las contraseñas manualmente.

### Pregunta 59 — selección de usuario en la autorización del cierre

**Decisión:** opción A aprobada por Luis el 2026-09-12. Si la sesión actual pertenece a Administración o encargado, su usuario aparece seleccionado; desde otro rol, la ventana permite seleccionar únicamente Administración o encargados activos y solicita la contraseña de la persona elegida. No obliga a cerrar la sesión operativa completa. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

La ventana de cierre masivo exigirá usuario y contraseña. ¿Cómo se completa el campo de usuario?

- **Opción A — usuario actual o selector de autorizados (recomendada):** si la sesión ya es de Administración o encargado, su usuario aparece seleccionado; si la sesión pertenece a otro rol, se muestra un selector únicamente con Administración y encargados activos. La persona autorizada elige su usuario e introduce su contraseña.
- **Opción B — escribir siempre el nombre de usuario:** no muestra cuentas existentes, pero obliga a recordar y escribir exactamente el identificador en una pantalla táctil.
- **Opción C — selector de todos los usuarios:** facilita elegir, pero muestra perfiles que no pueden autorizar y genera intentos innecesarios.
- **Opción D — solo el usuario de la sesión actual:** simplifica la ventana, pero obliga a cerrar la sesión del mesero antes de que un encargado pueda autorizar.

**Recomendación:** Opción A. Mantiene usuario y contraseña como pidió Luis, reduce escritura y permite que una persona autorizada confirme desde la sesión operativa sin cambiar de usuario completamente.

### Pregunta 60 — contraseña incorrecta en una autorización sensible

**Decisión:** opción A aprobada por Luis el 2026-09-12. Después de cinco contraseñas incorrectas para el mismo usuario, únicamente esa autorización sensible se pausa durante cinco minutos. La sesión y el trabajo normal del POS continúan; se registra el evento sin guardar la contraseña introducida. Pendiente de implementar y verificar; no se marca con `[x]` todavía.

Si se introduce repetidamente una contraseña incorrecta en la ventana de cierre masivo u otra autorización sensible, ¿qué debe hacer el sistema?

- **Opción A — cinco intentos y pausa de cinco minutos (recomendada):** después de cinco errores para el mismo usuario, se pausa únicamente esa autorización durante cinco minutos. La sesión y la operación normal continúan; se registra el intento fallido sin guardar la contraseña.
- **Opción B — tres intentos y pausa de 15 minutos:** ofrece más control, pero puede retrasar el cierre por errores de escritura en una pantalla táctil.
- **Opción C — intentos ilimitados:** evita interrupciones, aunque permite probar contraseñas repetidamente.
- **Opción D — cerrar la sesión completa:** obliga a volver a iniciar sesión después del límite, pero interrumpe trabajo que no depende de la autorización administrativa.

**Recomendación:** Opción A. Es un endurecimiento ligero para un sistema local: limita intentos repetidos sin bloquear el resto del POS ni detener el servicio por demasiado tiempo.

### Pregunta 61 — tamaño y optimización del logo

**Decisión implementada y verificada el 2026-09-12:** opción A aprobada y ampliada por Luis. Se aceptan PNG, JPEG y WebP de hasta 5 MB. Antes de guardar, un editor permite mover la imagen, seleccionar la zona visible y aplicar zoom. El sistema recorta a 1:1, reduce a un máximo de 1024 × 1024 y guarda una versión WebP optimizada con vista previa.

Para evitar que el logo vuelva a fallar por superar el límite actual de 400 KB, ¿qué archivos debe aceptar y cómo debe guardarlos el sistema?

- **Opción A — aceptar hasta 5 MB y optimizar automáticamente (recomendada):** recibe PNG, JPEG o WebP, corrige orientación, reduce a un máximo de 1024 × 1024, conserva transparencia cuando exista y guarda una versión WebP optimizada. Muestra la vista previa antes de confirmar.
- **Opción B — aceptar hasta 2 MB y reducir a 512 × 512:** ocupa menos espacio, pero puede perder definición en monitores grandes o impresiones futuras.
- **Opción C — mantener el límite de 400 KB:** evita procesar imágenes grandes, pero obliga al usuario a comprimirlas por fuera y mantiene la causa del problema actual.
- **Opción D — aceptar hasta 10 MB sin optimización:** facilita subir cualquier archivo, pero aumenta innecesariamente configuración, memoria y tiempo de carga.

**Recomendación:** Opción A. El usuario puede elegir una imagen normal del teléfono o computador y el sistema se encarga de producir una versión liviana y consistente sin exigir edición externa.

### Pregunta 62 — proporción del recorte del logo

**Decisión implementada y verificada el 2026-09-12:** opción A aprobada por Luis. El editor usa un área cuadrada 1:1, permite mover y ampliar/reducir la imagen y muestra la vista previa. La interfaz aplica esquinas redondeadas sin volver a recortar el archivo.

¿Qué forma tendrá el área que el usuario selecciona en el editor del logo?

- **Opción A — recorte cuadrado 1:1 (recomendada):** mantiene un tamaño uniforme en encabezados, inicio de sesión y pantallas pequeñas. El editor muestra también una vista previa a tamaño real; la interfaz puede redondear sus esquinas sin recortar nuevamente el archivo.
- **Opción B — recorte horizontal 3:1:** favorece logotipos con nombre completo, pero ocupa demasiado ancho en teléfono y puede reducirse hasta quedar ilegible.
- **Opción C — elegir entre cuadrado y horizontal:** admite más marcas, aunque obliga a mantener dos composiciones y reglas responsive distintas.
- **Opción D — recorte libre:** respeta cualquier proporción, pero produce logos con tamaños impredecibles y puede desordenar el encabezado.

**Recomendación:** Opción A. Es la proporción más estable para una interfaz táctil vertical y permite que el nombre escrito permanezca al lado del logo sin competir por espacio.

### Pregunta 63 — logo y nombre en el encabezado

**Decisión implementada y verificada el 2026-09-12:** opción A aprobada por Luis. El encabezado muestra siempre el logo y el nombre del restaurante; en teléfono usa una composición compacta sin desaparecer. Si el logo falta o no puede cargarse, se mantiene únicamente el nombre. Verificado en 390, 768 y 1280 px.

Cuando exista un logo válido, ¿el encabezado debe mostrar también el nombre escrito del restaurante?

- **Opción A — logo y nombre siempre (recomendada):** mantiene la identificación clara aunque el símbolo no contenga texto; en teléfono el nombre puede usar una versión compacta sin desaparecer.
- **Opción B — solo logo cuando esté cargado:** ocupa menos espacio, pero un símbolo pequeño puede no identificar claramente el restaurante.
- **Opción C — configurable:** Administración elige entre logo, nombre o ambos. Es flexible, aunque añade una opción visual y permite crear encabezados inconsistentes.
- **Opción D — logo en monitor y solo nombre en teléfono:** adapta el espacio, pero cambia la identidad según el dispositivo.

**Recomendación:** Opción A. Cumple la decisión previa de mantener el nombre visible, evita depender de que el archivo incluya letras legibles y conserva una identidad consistente en todos los tamaños.
