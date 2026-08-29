-- Contornos: grupos, variantes, slots por plato y selecciones en la orden.

CREATE TABLE contorno_grupos (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE contorno_variantes (
  id INTEGER PRIMARY KEY,
  grupo_id INTEGER NOT NULL REFERENCES contorno_grupos(id),
  nombre TEXT NOT NULL,
  suplemento_centavos INTEGER NOT NULL DEFAULT 0,
  extra_centavos INTEGER NOT NULL DEFAULT 0,
  producto_id INTEGER REFERENCES productos(id),
  activo INTEGER NOT NULL DEFAULT 1,
  UNIQUE(grupo_id, nombre)
);

CREATE TABLE plato_slots (
  id INTEGER PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  posicion INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  permite_extra INTEGER NOT NULL DEFAULT 0,
  UNIQUE(producto_id, posicion)
);

CREATE TABLE plato_slot_grupos (
  slot_id INTEGER NOT NULL REFERENCES plato_slots(id) ON DELETE CASCADE,
  grupo_id INTEGER NOT NULL REFERENCES contorno_grupos(id),
  PRIMARY KEY (slot_id, grupo_id)
);

CREATE TABLE orden_linea_contornos (
  id INTEGER PRIMARY KEY,
  orden_linea_id INTEGER NOT NULL REFERENCES orden_lineas(id),
  slot_posicion INTEGER NOT NULL,
  slot_nombre TEXT NOT NULL,
  variante_nombre TEXT NOT NULL,
  precio_centavos INTEGER NOT NULL,
  es_extra INTEGER NOT NULL DEFAULT 0,
  orden_extra INTEGER NOT NULL DEFAULT 0,
  UNIQUE(orden_linea_id, slot_posicion, orden_extra)
);
