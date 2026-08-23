-- Libro de inventario por línea de orden.
--
-- Hasta ahora la "firmeza" del consumo se deducía de `cuentas.estado`, y ese
-- estado no es durable: `enviarOrden` y `corregirOrden` devuelven la cuenta a
-- `abierta` a propósito. Deducirla dejaba reserva negativa, merma fantasma y
-- doble descuento en la segunda precuenta.
--
-- Acá se registra el hecho, no se deriva: por cada componente que consume una
-- línea de orden se guarda cuánto sigue reservado y cuánto ya se firmó.
-- `cantidad_por_unidad` es la cantidad de ese componente por unidad de
-- producto, así que un delta de corrección se traduce sin volver a expandir la
-- receta (y sin depender de que la receta no haya cambiado desde el envío).

CREATE TABLE orden_linea_inventario (
  orden_id INTEGER NOT NULL REFERENCES ordenes(id),
  linea_clave TEXT NOT NULL,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad_por_unidad REAL NOT NULL CHECK(cantidad_por_unidad > 0),
  reservada_real REAL NOT NULL DEFAULT 0 CHECK(reservada_real >= 0),
  firmada_real REAL NOT NULL DEFAULT 0 CHECK(firmada_real >= 0),
  PRIMARY KEY (orden_id, linea_clave, producto_id)
);

CREATE INDEX orden_linea_inventario_producto ON orden_linea_inventario(producto_id);

-- Lo que Task 6 tiene que firmar: solo lo que sigue reservado.
CREATE INDEX orden_linea_inventario_pendiente
  ON orden_linea_inventario(orden_id)
  WHERE reservada_real > 0;
