DROP INDEX IF EXISTS inventario_movimientos_producto;

ALTER TABLE inventario_movimientos RENAME TO inventario_movimientos_anterior;

CREATE TABLE inventario_movimientos (
  id INTEGER PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'perdida')),
  cantidad_real REAL NOT NULL CHECK (cantidad_real > 0),
  stock_anterior_real REAL NOT NULL,
  stock_nuevo_real REAL NOT NULL,
  empleado_id INTEGER NOT NULL REFERENCES empleados(id),
  motivo TEXT CHECK (motivo IS NULL OR motivo IN ('producto_danado', 'consumo_interno')),
  creado_en TEXT NOT NULL,
  CHECK (
    (tipo = 'entrada' AND motivo IS NULL)
    OR
    (tipo = 'perdida' AND motivo IS NOT NULL)
  )
);

INSERT INTO inventario_movimientos
  (id, producto_id, tipo, cantidad_real, stock_anterior_real, stock_nuevo_real, empleado_id, motivo, creado_en)
SELECT
  id, producto_id, tipo, cantidad_real, stock_anterior_real, stock_nuevo_real, empleado_id, NULL, creado_en
FROM inventario_movimientos_anterior;

DROP TABLE inventario_movimientos_anterior;

CREATE INDEX inventario_movimientos_producto
  ON inventario_movimientos(producto_id, creado_en DESC);
