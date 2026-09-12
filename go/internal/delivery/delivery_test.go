package delivery

import (
	"context"
	"database/sql"
	_ "modernc.org/sqlite"
	"testing"
)

func TestMarkRequiresACompleteOrderAndIsIdempotent(t *testing.T) {
	db, err := sql.Open("sqlite", "file:delivery-mark?mode=memory&cache=shared")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`
		CREATE TABLE cuentas (id INTEGER PRIMARY KEY, tipo_servicio TEXT, estado TEXT); INSERT INTO cuentas VALUES (1, 'mesa', 'abierta');
		CREATE TABLE ordenes (id INTEGER PRIMARY KEY, cuenta_id INTEGER); INSERT INTO ordenes VALUES (2, 1);
		CREATE TABLE comandas (id INTEGER PRIMARY KEY, orden_id INTEGER); INSERT INTO comandas VALUES (3, 2);
		CREATE TABLE comanda_lineas (id INTEGER PRIMARY KEY, comanda_id INTEGER, etapa TEXT, etapa_actualizada_en TEXT); INSERT INTO comanda_lineas VALUES (4, 3, 'listo', NULL);
		CREATE TABLE entregas_ordenes (id INTEGER PRIMARY KEY, orden_id INTEGER UNIQUE, origen TEXT, empleado_id INTEGER, creada_en TEXT);`)
	if err != nil {
		t.Fatal(err)
	}
	first, err := Mark(context.Background(), db, 2, 9, "manual")
	if err != nil || first.Repeated {
		t.Fatalf("primera entrega: %#v, %v", first, err)
	}
	second, err := Mark(context.Background(), db, 2, 9, "manual")
	if err != nil || !second.Repeated {
		t.Fatalf("reintento: %#v, %v", second, err)
	}
	var stage string
	if err := db.QueryRow("SELECT etapa FROM comanda_lineas WHERE id = 4").Scan(&stage); err != nil || stage != "servido" {
		t.Fatalf("etapa: %q, %v", stage, err)
	}
}
