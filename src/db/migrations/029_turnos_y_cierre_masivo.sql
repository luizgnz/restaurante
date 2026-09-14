CREATE TABLE turno_plantillas (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL COLLATE NOCASE UNIQUE,
  hora_inicio TEXT,
  hora_fin TEXT,
  es_predeterminada INTEGER NOT NULL DEFAULT 0 CHECK (es_predeterminada IN (0, 1)),
  activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1)),
  creada_en TEXT NOT NULL
);

CREATE UNIQUE INDEX turno_plantilla_predeterminada_unica
  ON turno_plantillas(es_predeterminada)
  WHERE es_predeterminada = 1 AND activa = 1;

INSERT INTO turno_plantillas (nombre, es_predeterminada, activa, creada_en)
VALUES ('Jornada general', 1, 1, datetime('now'));

ALTER TABLE jornadas_operativas ADD COLUMN turno_plantilla_id INTEGER REFERENCES turno_plantillas(id);
ALTER TABLE jornadas_operativas ADD COLUMN turno_nombre TEXT;
ALTER TABLE jornadas_operativas ADD COLUMN cierre_registrado_en TEXT;

UPDATE jornadas_operativas
SET turno_plantilla_id = (SELECT id FROM turno_plantillas WHERE es_predeterminada = 1),
    turno_nombre = 'Jornada general',
    cierre_registrado_en = cerrada_en;
