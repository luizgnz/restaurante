CREATE TABLE roles (
  clave TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT NOT NULL
);

INSERT INTO roles (clave, nombre, descripcion) VALUES
  ('administrador', 'Administrador', 'Configura el sistema, usuarios e inventario'),
  ('mesero', 'Mesero', 'Crea órdenes y atiende mesas'),
  ('cocina', 'Cocina', 'Recibe y prepara comandas'),
  ('caja', 'Caja', 'Emite comprobantes y cierra cuentas'),
  ('inventario', 'Inventario', 'Consulta y registra existencias');

CREATE TABLE empleado_roles (
  empleado_id INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  rol_clave TEXT NOT NULL REFERENCES roles(clave),
  PRIMARY KEY (empleado_id, rol_clave)
);

INSERT INTO empleado_roles (empleado_id, rol_clave)
SELECT id,
  CASE derecho
    WHEN 'avanzado' THEN 'administrador'
    WHEN 'basico' THEN 'mesero'
    ELSE 'cocina'
  END
FROM empleados;

CREATE INDEX empleado_roles_por_rol ON empleado_roles(rol_clave, empleado_id);
