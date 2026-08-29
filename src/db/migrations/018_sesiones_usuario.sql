CREATE TABLE sesiones_usuario (
  id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  empleado_id INTEGER NOT NULL REFERENCES empleados(id),
  abierta_en TEXT NOT NULL,
  cerrada_en TEXT
);

CREATE INDEX sesiones_usuario_empleado
  ON sesiones_usuario(empleado_id, abierta_en DESC);
