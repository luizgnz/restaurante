package salon

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

func TestListDerivesTableStatusFromActiveAccount(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	defer db.Close()
	_, err = db.Exec(`
		CREATE TABLE pisos (id INTEGER PRIMARY KEY, nombre TEXT, fondo_color TEXT, fondo_blob BLOB, activo INTEGER);
		CREATE TABLE mesas (id INTEGER PRIMARY KEY, piso_id INTEGER, numero INTEGER, asientos INTEGER, activa INTEGER, pos_x REAL, pos_y REAL, forma TEXT, ancho REAL, alto REAL, fondo_color TEXT, fondo_data TEXT);
		CREATE TABLE cuentas (id INTEGER PRIMARY KEY, mesa_id INTEGER, estado TEXT);
		INSERT INTO pisos VALUES (1, 'Salón', NULL, NULL, 1);
		INSERT INTO mesas VALUES (3, 1, 3, 4, 1, 10, 20, 'square', 100, 80, NULL, NULL);
		INSERT INTO mesas VALUES (4, 1, 4, 2, 1, 30, 20, 'round', 80, 80, NULL, NULL);
		INSERT INTO cuentas VALUES (9, 3, 'precuenta_emitida');`)
	if err != nil {
		t.Fatal(err)
	}
	view, err := List(context.Background(), db)
	if err != nil {
		t.Fatal(err)
	}
	if len(view.Mesas) != 2 || view.Mesas[0].Estado != "precuenta" || view.Mesas[0].CuentaID == nil || *view.Mesas[0].CuentaID != 9 {
		t.Fatalf("mesa ocupada inesperada: %#v", view.Mesas)
	}
	if view.Mesas[1].Estado != "libre" || view.Mesas[1].CuentaID != nil {
		t.Fatalf("mesa libre inesperada: %#v", view.Mesas[1])
	}
}
