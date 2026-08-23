CREATE TABLE cuentas (
  id INTEGER PRIMARY KEY,
  mesa_id INTEGER NOT NULL REFERENCES mesas(id),
  estado TEXT NOT NULL CHECK (estado IN ('abierta','precuenta_emitida','en_caja','cancelada')),
  abierta_por_empleado_id INTEGER REFERENCES empleados(id),
  abierta_en TEXT NOT NULL,
  cerrada_en TEXT,
  nota_privada TEXT
);

CREATE UNIQUE INDEX cuenta_activa_mesa_unica
ON cuentas(mesa_id)
WHERE estado IN ('abierta','precuenta_emitida');

CREATE TABLE ordenes (
  id INTEGER PRIMARY KEY,
  cuenta_id INTEGER NOT NULL REFERENCES cuentas(id),
  numero INTEGER NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('enviada','corregida','anulada')),
  indicaciones TEXT,
  creada_por_empleado_id INTEGER NOT NULL REFERENCES empleados(id),
  creada_en TEXT NOT NULL,
  clave_idempotencia TEXT NOT NULL
);

CREATE UNIQUE INDEX orden_numero_cuenta_unico ON ordenes(cuenta_id, numero);
CREATE UNIQUE INDEX orden_idempotencia_unica ON ordenes(clave_idempotencia);

CREATE TABLE orden_lineas (
  id INTEGER PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES ordenes(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad REAL NOT NULL CHECK(cantidad > 0),
  precio_centavos INTEGER NOT NULL,
  nota TEXT,
  linea_clave TEXT NOT NULL
);

CREATE UNIQUE INDEX orden_linea_clave_unica ON orden_lineas(orden_id, linea_clave);

CREATE TABLE orden_correcciones (
  id INTEGER PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES ordenes(id),
  numero_version INTEGER NOT NULL,
  motivo TEXT,
  es_anulacion INTEGER NOT NULL DEFAULT 0,
  creada_por_empleado_id INTEGER NOT NULL REFERENCES empleados(id),
  creada_en TEXT NOT NULL,
  UNIQUE(orden_id, numero_version)
);

CREATE TABLE orden_correccion_lineas (
  id INTEGER PRIMARY KEY,
  correccion_id INTEGER NOT NULL REFERENCES orden_correcciones(id),
  orden_linea_id INTEGER REFERENCES orden_lineas(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad_anterior REAL NOT NULL,
  cantidad_nueva REAL NOT NULL CHECK(cantidad_nueva >= 0),
  nota_anterior TEXT,
  nota_nueva TEXT,
  linea_clave TEXT NOT NULL
);

CREATE UNIQUE INDEX correccion_linea_clave_unica ON orden_correccion_lineas(correccion_id, linea_clave);

CREATE TABLE auditoria_anulaciones (
  id INTEGER PRIMARY KEY,
  cuenta_id INTEGER NOT NULL REFERENCES cuentas(id),
  orden_id INTEGER NOT NULL REFERENCES ordenes(id),
  correccion_id INTEGER NOT NULL REFERENCES orden_correcciones(id),
  mesa_numero INTEGER NOT NULL,
  orden_numero INTEGER NOT NULL,
  empleado_id INTEGER NOT NULL REFERENCES empleados(id),
  resumen TEXT NOT NULL,
  justificacion TEXT,
  creada_en TEXT NOT NULL
);

ALTER TABLE comandas ADD COLUMN orden_id INTEGER;
ALTER TABLE comandas ADD COLUMN correccion_id INTEGER;
ALTER TABLE comandas ADD COLUMN tipo TEXT;

ALTER TABLE precuentas ADD COLUMN cuenta_id INTEGER;

ALTER TABLE caja_handoffs ADD COLUMN cuenta_id INTEGER;

CREATE TABLE comanda_lineas_nueva (
  id INTEGER PRIMARY KEY,
  comanda_id INTEGER NOT NULL,
  pedido_linea_id INTEGER,
  orden_linea_id INTEGER,
  orden_correccion_linea_id INTEGER,
  etapa TEXT NOT NULL
);
INSERT INTO comanda_lineas_nueva (id, comanda_id, pedido_linea_id, etapa)
SELECT id, comanda_id, pedido_linea_id, etapa FROM comanda_lineas;
DROP TABLE comanda_lineas;

CREATE TABLE comandas_nueva (
  id INTEGER PRIMARY KEY,
  pedido_id INTEGER REFERENCES pedidos(id),
  envio_n INTEGER NOT NULL,
  mesero_id INTEGER NOT NULL REFERENCES empleados(id),
  creada_en TEXT NOT NULL,
  orden_id INTEGER REFERENCES ordenes(id),
  correccion_id INTEGER REFERENCES orden_correcciones(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('legacy', 'orden', 'correccion', 'anulacion')),
  CHECK (
    (tipo = 'legacy' AND pedido_id IS NOT NULL AND orden_id IS NULL AND correccion_id IS NULL)
    OR (tipo = 'orden' AND pedido_id IS NULL AND orden_id IS NOT NULL AND correccion_id IS NULL)
    OR (tipo IN ('correccion', 'anulacion') AND pedido_id IS NULL AND orden_id IS NOT NULL AND correccion_id IS NOT NULL)
  )
);
INSERT INTO comandas_nueva (id, pedido_id, envio_n, mesero_id, creada_en, orden_id, correccion_id, tipo)
SELECT id, pedido_id, envio_n, mesero_id, creada_en, NULL, NULL, 'legacy' FROM comandas;
DROP TABLE comandas;
ALTER TABLE comandas_nueva RENAME TO comandas;

CREATE TABLE comanda_lineas (
  id INTEGER PRIMARY KEY,
  comanda_id INTEGER NOT NULL REFERENCES comandas(id),
  pedido_linea_id INTEGER REFERENCES pedido_lineas(id),
  orden_linea_id INTEGER REFERENCES orden_lineas(id),
  orden_correccion_linea_id INTEGER REFERENCES orden_correccion_lineas(id),
  etapa TEXT NOT NULL,
  CHECK (
    (pedido_linea_id IS NOT NULL) + (orden_linea_id IS NOT NULL) + (orden_correccion_linea_id IS NOT NULL) = 1
  )
);
INSERT INTO comanda_lineas (id, comanda_id, pedido_linea_id, orden_linea_id, orden_correccion_linea_id, etapa)
SELECT id, comanda_id, pedido_linea_id, orden_linea_id, orden_correccion_linea_id, etapa FROM comanda_lineas_nueva;
DROP TABLE comanda_lineas_nueva;
