ALTER TABLE productos ADD COLUMN codigo TEXT;
ALTER TABLE productos ADD COLUMN color TEXT;
ALTER TABLE productos ADD COLUMN foto_data TEXT;
ALTER TABLE productos ADD COLUMN rastrear_inventario INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS productos_codigo_unico ON productos (codigo) WHERE codigo IS NOT NULL AND trim(codigo) != '';
