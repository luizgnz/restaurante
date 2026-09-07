-- Jornada operativa: separa el servicio del calendario y evita que una
-- comanda antigua reaparezca en cocina al volver a abrir la aplicación.

CREATE TABLE jornadas_operativas (
  id INTEGER PRIMARY KEY,
  fecha_operativa TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('abierta', 'cerrada')),
  abierta_en TEXT NOT NULL,
  abierta_por_empleado_id INTEGER REFERENCES empleados(id),
  cerrada_en TEXT,
  cerrada_por_empleado_id INTEGER REFERENCES empleados(id),
  respaldo_ruta TEXT,
  resumen_json TEXT
);

CREATE UNIQUE INDEX jornada_operativa_abierta_unica
  ON jornadas_operativas(estado)
  WHERE estado = 'abierta';

CREATE INDEX jornadas_operativas_fecha
  ON jornadas_operativas(fecha_operativa, id DESC);

CREATE TABLE jornada_eventos (
  id INTEGER PRIMARY KEY,
  jornada_id INTEGER REFERENCES jornadas_operativas(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('apertura', 'cierre', 'reinicio_demo')),
  empleado_id INTEGER REFERENCES empleados(id),
  detalle_json TEXT NOT NULL,
  creado_en TEXT NOT NULL
);

CREATE INDEX jornada_eventos_jornada
  ON jornada_eventos(jornada_id, id);

ALTER TABLE cuentas ADD COLUMN jornada_id INTEGER REFERENCES jornadas_operativas(id);
ALTER TABLE comandas ADD COLUMN jornada_id INTEGER REFERENCES jornadas_operativas(id);

CREATE INDEX cuentas_jornada ON cuentas(jornada_id, estado);
CREATE INDEX comandas_jornada ON comandas(jornada_id, id DESC);

-- La primera migración conserva el servicio que ya estaba visible. A partir de
-- aquí toda fila nueva queda asociada en el momento de crearla.
INSERT INTO jornadas_operativas (fecha_operativa, estado, abierta_en)
VALUES (date('now', 'localtime'), 'abierta', datetime('now'));

UPDATE cuentas
SET jornada_id = (SELECT id FROM jornadas_operativas WHERE estado = 'abierta')
WHERE estado IN ('abierta', 'precuenta_emitida')
   OR date(abierta_en, 'localtime') = date('now', 'localtime');

UPDATE comandas
SET jornada_id = (SELECT id FROM jornadas_operativas WHERE estado = 'abierta')
WHERE date(creada_en, 'localtime') = date('now', 'localtime')
   OR orden_id IN (SELECT id FROM ordenes WHERE cuenta_id IN (SELECT id FROM cuentas WHERE jornada_id IS NOT NULL))
   OR pedido_id IN (SELECT id FROM pedidos WHERE estado NOT IN ('en_caja', 'cancelado'));

INSERT INTO jornada_eventos (jornada_id, tipo, detalle_json, creado_en)
SELECT id, 'apertura', '{"origen":"migracion"}', abierta_en
FROM jornadas_operativas
WHERE estado = 'abierta';
