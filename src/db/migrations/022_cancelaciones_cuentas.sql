-- Cancelar una cuenta es una decisión de encargado con motivo obligatorio, y
-- como no pasa por una corrección de orden, no cabe en auditoria_anulaciones:
-- tiene su propia pista de auditoría, con el monto que tenía al cancelarse.
CREATE TABLE cancelaciones_cuentas (
  id INTEGER PRIMARY KEY,
  cuenta_id INTEGER NOT NULL REFERENCES cuentas(id),
  mesa_id INTEGER NOT NULL REFERENCES mesas(id),
  mesa_numero INTEGER NOT NULL,
  empleado_id INTEGER NOT NULL REFERENCES empleados(id),
  motivo TEXT NOT NULL,
  total_centavos INTEGER NOT NULL,
  ordenes INTEGER NOT NULL,
  lineas_preparadas INTEGER NOT NULL,
  lineas_liberadas INTEGER NOT NULL,
  creada_en TEXT NOT NULL
);

CREATE INDEX cancelaciones_cuentas_creada
  ON cancelaciones_cuentas(creada_en DESC);
