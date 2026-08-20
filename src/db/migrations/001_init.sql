CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY
);

CREATE TABLE empleados (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  derecho TEXT NOT NULL CHECK (derecho IN ('minimo', 'basico', 'avanzado')),
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE pisos (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL
);

CREATE TABLE mesas (
  id INTEGER PRIMARY KEY,
  piso_id INTEGER NOT NULL REFERENCES pisos(id),
  numero INTEGER NOT NULL,
  asientos INTEGER NOT NULL DEFAULT 4,
  activa INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE categorias_pos (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  estacion TEXT NOT NULL DEFAULT 'cocina'
);

CREATE TABLE productos (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  precio_centavos INTEGER NOT NULL,
  categoria_id INTEGER REFERENCES categorias_pos(id),
  tipo_consumo TEXT NOT NULL CHECK (tipo_consumo IN ('no_almacenable', 'almacenable_unitario', 'receta_kit')),
  disponible_en_pos INTEGER NOT NULL DEFAULT 1,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE receta_lineas (
  id INTEGER PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  ingrediente_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad_real REAL NOT NULL
);

CREATE TABLE stock (
  producto_id INTEGER PRIMARY KEY REFERENCES productos(id),
  on_hand_real REAL NOT NULL DEFAULT 0,
  reserved_real REAL NOT NULL DEFAULT 0
);

CREATE TABLE pedidos (
  id INTEGER PRIMARY KEY,
  mesa_id INTEGER REFERENCES mesas(id),
  preset TEXT NOT NULL DEFAULT 'salon',
  cubiertos INTEGER NOT NULL DEFAULT 1,
  estado TEXT NOT NULL,
  mesero_id INTEGER REFERENCES empleados(id),
  abierto_en TEXT NOT NULL
);

CREATE TABLE pedido_lineas (
  id INTEGER PRIMARY KEY,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad REAL NOT NULL,
  nota TEXT,
  estado TEXT NOT NULL,
  precio_centavos INTEGER NOT NULL
);

CREATE TABLE comandas (
  id INTEGER PRIMARY KEY,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
  envio_n INTEGER NOT NULL,
  mesero_id INTEGER NOT NULL REFERENCES empleados(id),
  creada_en TEXT NOT NULL
);

CREATE TABLE comanda_lineas (
  id INTEGER PRIMARY KEY,
  comanda_id INTEGER NOT NULL REFERENCES comandas(id),
  pedido_linea_id INTEGER NOT NULL REFERENCES pedido_lineas(id),
  etapa TEXT NOT NULL
);

CREATE TABLE print_jobs (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_en TEXT NOT NULL
);

CREATE TABLE precuentas (
  id INTEGER PRIMARY KEY,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
  numero INTEGER NOT NULL,
  vigente INTEGER NOT NULL DEFAULT 1,
  mesero_id INTEGER NOT NULL REFERENCES empleados(id),
  snapshot_json TEXT NOT NULL,
  emitida_en TEXT NOT NULL
);

CREATE TABLE caja_handoffs (
  id INTEGER PRIMARY KEY,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
  precuenta_id INTEGER NOT NULL REFERENCES precuentas(id),
  mesero_id INTEGER NOT NULL REFERENCES empleados(id),
  snapshot_json TEXT NOT NULL,
  creado_en TEXT NOT NULL
);
