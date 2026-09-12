-- Flujos operativos aprobados el 2026-09-10.

INSERT OR IGNORE INTO roles (clave, nombre, descripcion) VALUES
  ('encargado_turno', 'Encargado de turno', 'Autoriza excepciones operativas durante el turno');

ALTER TABLE cuentas ADD COLUMN tipo_servicio TEXT NOT NULL DEFAULT 'mesa'
  CHECK (tipo_servicio IN ('mesa', 'para_llevar'));
ALTER TABLE cuentas ADD COLUMN numero_servicio INTEGER;
ALTER TABLE cuentas ADD COLUMN cliente_nombre TEXT;

ALTER TABLE comanda_lineas ADD COLUMN etapa_actualizada_en TEXT;

CREATE UNIQUE INDEX cuenta_para_llevar_numero_jornada
  ON cuentas(jornada_id, numero_servicio)
  WHERE tipo_servicio = 'para_llevar';

CREATE TABLE entregas_ordenes (
  id INTEGER PRIMARY KEY,
  orden_id INTEGER NOT NULL UNIQUE REFERENCES ordenes(id),
  origen TEXT NOT NULL CHECK (origen IN ('manual', 'automatica', 'retiro')),
  empleado_id INTEGER REFERENCES empleados(id),
  creada_en TEXT NOT NULL
);

CREATE INDEX entregas_ordenes_creada ON entregas_ordenes(creada_en DESC);

CREATE TABLE cancelaciones_productos_cocina (
  id INTEGER PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES ordenes(id),
  correccion_id INTEGER NOT NULL REFERENCES orden_correcciones(id),
  linea_clave TEXT NOT NULL,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad REAL NOT NULL CHECK (cantidad > 0),
  empleado_id INTEGER NOT NULL REFERENCES empleados(id),
  motivo TEXT NOT NULL CHECK (length(trim(motivo)) > 0),
  creada_en TEXT NOT NULL,
  UNIQUE(orden_id, linea_clave, correccion_id)
);

CREATE INDEX cancelaciones_productos_cocina_orden
  ON cancelaciones_productos_cocina(orden_id, creada_en DESC);
