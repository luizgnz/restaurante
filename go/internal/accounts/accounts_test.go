package accounts

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

func TestGetUsesTheCurrentVersionOfEachOrder(t *testing.T) {
	db, err := sql.Open("sqlite", "file:cuentas-get?mode=memory&cache=shared")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`
		CREATE TABLE mesas (id INTEGER PRIMARY KEY, numero INTEGER); INSERT INTO mesas VALUES (7, 7);
		CREATE TABLE cuentas (id INTEGER PRIMARY KEY, estado TEXT, nota_privada TEXT, tipo_servicio TEXT, numero_servicio INTEGER, cliente_nombre TEXT, mesa_id INTEGER, abierta_por_empleado_id INTEGER, abierta_en TEXT, jornada_id INTEGER);
		INSERT INTO cuentas VALUES (1, 'abierta', NULL, 'mesa', NULL, NULL, 7, 1, '2026-09-11T12:00:00Z', 1);
		CREATE TABLE empleados (id INTEGER PRIMARY KEY, nombre TEXT); INSERT INTO empleados VALUES (1, 'Ana');
		CREATE TABLE ordenes (id INTEGER PRIMARY KEY, cuenta_id INTEGER, numero INTEGER, estado TEXT, indicaciones TEXT, creada_en TEXT, creada_por_empleado_id INTEGER); INSERT INTO ordenes VALUES (3, 1, 1, 'corregida', 'Sin cebolla', '2026-09-11T12:01:00Z', 1);
		CREATE TABLE productos (id INTEGER PRIMARY KEY, nombre TEXT); INSERT INTO productos VALUES (4, 'Hamburguesa');
		CREATE TABLE orden_lineas (id INTEGER PRIMARY KEY, orden_id INTEGER, producto_id INTEGER, cantidad REAL, precio_centavos INTEGER, nota TEXT, linea_clave TEXT); INSERT INTO orden_lineas VALUES (5, 3, 4, 2, 2500, NULL, 'hamburguesa');
		CREATE TABLE orden_linea_contornos (id INTEGER PRIMARY KEY, orden_linea_id INTEGER, slot_nombre TEXT, variante_nombre TEXT, es_extra INTEGER); INSERT INTO orden_linea_contornos VALUES (1, 5, 'Acompañamiento', 'Papas', 0);
		CREATE TABLE orden_correcciones (id INTEGER PRIMARY KEY, orden_id INTEGER, numero_version INTEGER, indicaciones TEXT); INSERT INTO orden_correcciones VALUES (6, 3, 1, 'Sin tomate');
		CREATE TABLE orden_correccion_lineas (id INTEGER PRIMARY KEY, correccion_id INTEGER, producto_id INTEGER, cantidad_nueva REAL, nota_nueva TEXT, linea_clave TEXT, precio_centavos INTEGER); INSERT INTO orden_correccion_lineas VALUES (7, 6, 4, 1, 'Bien cocida', 'hamburguesa', 2500);
		CREATE TABLE comandas (id INTEGER PRIMARY KEY, orden_id INTEGER); INSERT INTO comandas VALUES (8, 3);
		CREATE TABLE comanda_lineas (id INTEGER PRIMARY KEY, comanda_id INTEGER, etapa TEXT); INSERT INTO comanda_lineas VALUES (9, 8, 'en_proceso');`)
	if err != nil {
		t.Fatal(err)
	}

	detail, err := Get(context.Background(), db, 1)
	if err != nil {
		t.Fatal(err)
	}
	if detail.TotalCents != 2500 || len(detail.Orders) != 1 || detail.Orders[0].Stage != "en_preparacion" {
		t.Fatalf("detalle inesperado: %#v", detail)
	}
	line := detail.Orders[0].Lines[0]
	if line.Quantity != 1 || line.Note == nil || *line.Note != "Bien cocida" || len(line.Contours) != 1 {
		t.Fatalf("línea vigente inesperada: %#v", line)
	}
	if detail.Orders[0].Instructions == nil || *detail.Orders[0].Instructions != "Sin tomate" {
		t.Fatalf("indicaciones vigentes inesperadas: %#v", detail.Orders[0].Instructions)
	}
}
