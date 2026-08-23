-- Precuenta y handoff a caja por cuenta.
--
-- 008 agregó `cuenta_id` a `precuentas` y `caja_handoffs`, pero `pedido_id`
-- siguió siendo NOT NULL: una precuenta del modelo nuevo no tiene pedido que
-- apuntar. Acá `pedido_id` pasa a ser nullable y un CHECK obliga a que la fila
-- pertenezca a un pedido legacy **o** a una cuenta, nunca a ambos ni a ninguno.
-- Sin ese CHECK una fila podría contar dos veces o quedar huérfana.
--
-- `precuenta_id` del handoff también pasa a nullable: con
-- `precuenta_obligatoria_antes_de_caja = false` no hay precuenta que referenciar,
-- y el `0` que se insertaba nunca fue un id válido.
--
-- El orden importa. `migrate` corre cada archivo en una transacción, donde
-- `PRAGMA foreign_keys` es un no-op, así que las FK siguen activas: rehacer
-- `precuentas` mientras `caja_handoffs` la referencia haría fallar el DROP con
-- datos presentes. Se copia el handoff a una tabla puente sin FK, se rehace
-- `precuentas` sin hijos que la apunten y recién después se reconstruye
-- `caja_handoffs` con sus FK definitivas. Es el mismo patrón que usó 008 para
-- `comandas`.

CREATE TABLE caja_handoffs_puente (
  id INTEGER PRIMARY KEY,
  pedido_id INTEGER,
  cuenta_id INTEGER,
  precuenta_id INTEGER,
  mesero_id INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  creado_en TEXT NOT NULL
);
INSERT INTO caja_handoffs_puente (id, pedido_id, cuenta_id, precuenta_id, mesero_id, snapshot_json, creado_en)
SELECT id, pedido_id, cuenta_id, precuenta_id, mesero_id, snapshot_json, creado_en FROM caja_handoffs;
DROP TABLE caja_handoffs;

CREATE TABLE precuentas_nueva (
  id INTEGER PRIMARY KEY,
  pedido_id INTEGER REFERENCES pedidos(id),
  cuenta_id INTEGER REFERENCES cuentas(id),
  numero INTEGER NOT NULL,
  vigente INTEGER NOT NULL DEFAULT 1 CHECK (vigente IN (0, 1)),
  mesero_id INTEGER NOT NULL REFERENCES empleados(id),
  snapshot_json TEXT NOT NULL,
  emitida_en TEXT NOT NULL,
  CHECK ((pedido_id IS NOT NULL) + (cuenta_id IS NOT NULL) = 1)
);
INSERT INTO precuentas_nueva (id, pedido_id, cuenta_id, numero, vigente, mesero_id, snapshot_json, emitida_en)
SELECT id, pedido_id, cuenta_id, numero, vigente, mesero_id, snapshot_json, emitida_en FROM precuentas;
DROP TABLE precuentas;
ALTER TABLE precuentas_nueva RENAME TO precuentas;

CREATE TABLE caja_handoffs (
  id INTEGER PRIMARY KEY,
  pedido_id INTEGER REFERENCES pedidos(id),
  cuenta_id INTEGER REFERENCES cuentas(id),
  precuenta_id INTEGER REFERENCES precuentas(id),
  mesero_id INTEGER NOT NULL REFERENCES empleados(id),
  snapshot_json TEXT NOT NULL,
  creado_en TEXT NOT NULL,
  CHECK ((pedido_id IS NOT NULL) + (cuenta_id IS NOT NULL) = 1)
);
-- `NULLIF(precuenta_id, 0)`: el flujo legacy insertaba 0 cuando no había
-- precuenta vigente y la configuración no la exigía. Nunca fue un id, así que
-- copiarlo tal cual dejaría la FK apuntando a una fila que no existe y
-- `PRAGMA foreign_key_check` acusaría la base entera. Acá se traduce al NULL que
-- siempre quiso decir.
INSERT INTO caja_handoffs (id, pedido_id, cuenta_id, precuenta_id, mesero_id, snapshot_json, creado_en)
SELECT id, pedido_id, cuenta_id, NULLIF(precuenta_id, 0), mesero_id, snapshot_json, creado_en
FROM caja_handoffs_puente;
DROP TABLE caja_handoffs_puente;

-- Caja toma "la" precuenta vigente de la cuenta: si hubiera dos, tomaría
-- cualquiera y cobraría un total que nadie revisó.
CREATE UNIQUE INDEX precuenta_vigente_cuenta_unica
  ON precuentas(cuenta_id)
  WHERE cuenta_id IS NOT NULL AND vigente = 1;

CREATE UNIQUE INDEX precuenta_numero_cuenta_unico
  ON precuentas(cuenta_id, numero)
  WHERE cuenta_id IS NOT NULL;

CREATE INDEX precuenta_cuenta ON precuentas(cuenta_id);

-- Una cuenta se entrega a caja una sola vez.
CREATE UNIQUE INDEX handoff_cuenta_unico
  ON caja_handoffs(cuenta_id)
  WHERE cuenta_id IS NOT NULL;

CREATE INDEX handoff_pedido ON caja_handoffs(pedido_id);
