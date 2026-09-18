ALTER TABLE productos ADD COLUMN umbral_poco_stock INTEGER
  CHECK (umbral_poco_stock IS NULL OR (umbral_poco_stock >= 0 AND umbral_poco_stock <= 1000000));
