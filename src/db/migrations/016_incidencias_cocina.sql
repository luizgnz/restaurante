CREATE TABLE cocina_incidencias (
  id INTEGER PRIMARY KEY,
  comanda_id INTEGER NOT NULL REFERENCES comandas(id),
  orden_id INTEGER NOT NULL REFERENCES ordenes(id),
  comanda_linea_id INTEGER REFERENCES comanda_lineas(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('rechazo', 'sugerencia')),
  alcance TEXT NOT NULL CHECK (alcance IN ('linea', 'orden')),
  motivo TEXT NOT NULL CHECK (length(trim(motivo)) > 0),
  propuesta TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptada', 'eliminada')),
  creada_en TEXT NOT NULL,
  respondida_en TEXT,
  CHECK (
    (alcance = 'orden' AND comanda_linea_id IS NULL)
    OR (alcance = 'linea' AND comanda_linea_id IS NOT NULL)
  ),
  CHECK (
    (tipo = 'rechazo' AND propuesta IS NULL)
    OR (tipo = 'sugerencia' AND propuesta IS NOT NULL AND length(trim(propuesta)) > 0)
  )
);

CREATE INDEX cocina_incidencias_orden
  ON cocina_incidencias(orden_id, creada_en DESC);

CREATE UNIQUE INDEX cocina_incidencia_pendiente_orden
  ON cocina_incidencias(orden_id)
  WHERE estado = 'pendiente' AND alcance = 'orden';

CREATE UNIQUE INDEX cocina_incidencia_pendiente_linea
  ON cocina_incidencias(comanda_linea_id)
  WHERE estado = 'pendiente' AND alcance = 'linea';
