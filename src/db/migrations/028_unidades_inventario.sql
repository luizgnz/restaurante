ALTER TABLE productos ADD COLUMN unidad_base TEXT NOT NULL DEFAULT 'unidad'
  CHECK (unidad_base IN ('unidad', 'g', 'ml'));

ALTER TABLE productos ADD COLUMN unidad_inventario TEXT NOT NULL DEFAULT 'unidad'
  CHECK (unidad_inventario IN ('unidad', 'g', 'kg', 'ml', 'l'));

-- Los insumos importados desde el menú real ya codifican su unidad base en el
-- código estable. Solo se normalizan esos materiales internos: los nombres
-- comerciales de bebidas, como "Coca-Cola 1 L", conservan su presentación.
UPDATE productos
SET unidad_base = 'g', unidad_inventario = 'g'
WHERE codigo LIKE 'insumo:%-g';

UPDATE productos
SET unidad_base = 'ml', unidad_inventario = 'ml'
WHERE codigo LIKE 'insumo:%-ml';

UPDATE productos
SET unidad_base = 'unidad', unidad_inventario = 'unidad'
WHERE codigo LIKE 'insumo:%-unid';

UPDATE productos
SET nombre = trim(substr(nombre, 1, length(nombre) - 2))
WHERE codigo LIKE 'insumo:%-g' AND lower(nombre) LIKE '% g';

UPDATE productos
SET nombre = trim(substr(nombre, 1, length(nombre) - 3))
WHERE codigo LIKE 'insumo:%-ml' AND lower(nombre) LIKE '% ml';

UPDATE productos
SET nombre = trim(substr(nombre, 1, length(nombre) - 5))
WHERE codigo LIKE 'insumo:%-unid' AND lower(nombre) LIKE '% unid';
