-- 008 queda congelado en el estado que revisaron Task 2 y Task 4.
-- Todo lo que Task 5 necesita del esquema vive aquí.
--
-- Se usa ADD COLUMN y no un rebuild porque `orden_correcciones` y
-- `orden_correccion_lineas` ya tienen hijos con FK (comandas, comanda_lineas,
-- auditoria_anulaciones) y `migrate` corre cada archivo dentro de una
-- transacción, donde `PRAGMA foreign_keys` es un no-op: un DROP/RENAME dejaría
-- referencias colgando o fallaría con datos presentes.

ALTER TABLE orden_correcciones ADD COLUMN indicaciones TEXT;

ALTER TABLE orden_correcciones ADD COLUMN clave_idempotencia TEXT NOT NULL DEFAULT '';

UPDATE orden_correcciones
SET clave_idempotencia = 'migracion-009-correccion-' || id
WHERE clave_idempotencia = '';

-- La clave es del cliente y se acota a la orden: reusarla en otra orden es una
-- corrección distinta, no un reintento. Global dejaría que una clave repetida
-- devolviera la corrección de otra orden como si fuera éxito.
CREATE UNIQUE INDEX correccion_idempotencia_unica ON orden_correcciones(orden_id, clave_idempotencia);

ALTER TABLE orden_correccion_lineas ADD COLUMN precio_centavos INTEGER NOT NULL DEFAULT 0;

UPDATE orden_correccion_lineas
SET precio_centavos = COALESCE(
  (SELECT p.precio_centavos FROM productos p WHERE p.id = orden_correccion_lineas.producto_id),
  0
)
WHERE precio_centavos = 0;

CREATE INDEX auditoria_anulaciones_cuenta ON auditoria_anulaciones(cuenta_id);
CREATE INDEX auditoria_anulaciones_orden ON auditoria_anulaciones(orden_id);
