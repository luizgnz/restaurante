-- Confirmación del mesero para cancelaciones ya resueltas por Cocina.

ALTER TABLE cancelaciones_productos_cocina ADD COLUMN reconocida_en TEXT;
ALTER TABLE cancelaciones_productos_cocina ADD COLUMN reconocida_por_empleado_id INTEGER REFERENCES empleados(id);

CREATE INDEX cancelaciones_productos_cocina_pendientes
  ON cancelaciones_productos_cocina(reconocida_en, creada_en DESC);
