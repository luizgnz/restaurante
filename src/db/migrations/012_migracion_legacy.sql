-- Marcadores para convertir el modelo legacy de forma idempotente.
-- Las tablas anteriores quedan disponibles como respaldo durante el corte.

ALTER TABLE cuentas ADD COLUMN legacy_pedido_id INTEGER REFERENCES pedidos(id);
CREATE UNIQUE INDEX cuenta_legacy_pedido_unica
  ON cuentas(legacy_pedido_id)
  WHERE legacy_pedido_id IS NOT NULL;

ALTER TABLE ordenes ADD COLUMN legacy_envio_n INTEGER;
CREATE UNIQUE INDEX orden_legacy_envio_unico
  ON ordenes(cuenta_id, legacy_envio_n)
  WHERE legacy_envio_n IS NOT NULL;
