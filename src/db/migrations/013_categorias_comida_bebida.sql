-- Las dos categorías principales pasan a llamarse Comida y Bebida.
-- Se renombran las legacy conservando el id (los productos las referencian) y
-- se crean si no existen. Los productos sin categoría quedan en Comida.

UPDATE categorias_pos SET nombre = 'Comida'
WHERE nombre = 'Principales'
  AND NOT EXISTS (SELECT 1 FROM categorias_pos WHERE nombre = 'Comida');

UPDATE categorias_pos SET nombre = 'Bebida'
WHERE nombre = 'Bebidas'
  AND NOT EXISTS (SELECT 1 FROM categorias_pos WHERE nombre = 'Bebida');

INSERT INTO categorias_pos (nombre, estacion)
SELECT 'Comida', 'cocina'
WHERE NOT EXISTS (SELECT 1 FROM categorias_pos WHERE nombre = 'Comida');

INSERT INTO categorias_pos (nombre, estacion)
SELECT 'Bebida', 'cocina'
WHERE NOT EXISTS (SELECT 1 FROM categorias_pos WHERE nombre = 'Bebida');

UPDATE productos
SET categoria_id = (SELECT id FROM categorias_pos WHERE nombre = 'Comida')
WHERE categoria_id IS NULL;
