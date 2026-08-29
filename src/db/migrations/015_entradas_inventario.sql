CREATE TABLE inventario_movimientos (
  id INTEGER PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada')),
  cantidad_real REAL NOT NULL CHECK (cantidad_real > 0),
  stock_anterior_real REAL NOT NULL,
  stock_nuevo_real REAL NOT NULL,
  empleado_id INTEGER NOT NULL REFERENCES empleados(id),
  creado_en TEXT NOT NULL
);

CREATE INDEX inventario_movimientos_producto
  ON inventario_movimientos(producto_id, creado_en DESC);
