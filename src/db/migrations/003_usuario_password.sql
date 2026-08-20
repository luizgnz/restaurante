ALTER TABLE empleados ADD COLUMN usuario TEXT;
ALTER TABLE empleados ADD COLUMN password_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS empleados_usuario_unico ON empleados (usuario) WHERE usuario IS NOT NULL;
