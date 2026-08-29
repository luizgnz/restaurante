ALTER TABLE cocina_incidencias
  ADD COLUMN producto_reemplazo_id INTEGER REFERENCES productos(id);
