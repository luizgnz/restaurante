package inventory

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

const nodeHash = "$argon2id$v=19$m=65536,p=4,t=3$/7FsKEDwvV6V6vjLO+yHmQ$e0h9jyFrmVBQpkMmDXu/FMsbAc5MwV0hUXMzYX3byWk"

func inventoryDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })
	_, err = db.Exec(`
		CREATE TABLE empleados (id INTEGER PRIMARY KEY, nombre TEXT, pin_hash TEXT, derecho TEXT, activo INTEGER);
		CREATE TABLE empleado_roles (empleado_id INTEGER, rol_clave TEXT);
		CREATE TABLE productos (id INTEGER PRIMARY KEY, nombre TEXT, codigo TEXT, activo INTEGER);
		CREATE TABLE stock (producto_id INTEGER PRIMARY KEY, on_hand_real REAL, reserved_real REAL);
		CREATE TABLE inventario_movimientos (id INTEGER PRIMARY KEY, producto_id INTEGER, tipo TEXT, cantidad_real REAL, stock_anterior_real REAL, stock_nuevo_real REAL, empleado_id INTEGER, motivo TEXT, creado_en TEXT);
		INSERT INTO empleados VALUES (1, 'Jefa', '` + nodeHash + `', 'avanzado', 1);
		INSERT INTO empleado_roles VALUES (1, 'administrador');
		INSERT INTO productos VALUES (4, 'Agua con gas', 'AG-01', 1);
		INSERT INTO stock VALUES (4, 8, 2);`)
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func TestEntryAndLossKeepInventoryLedger(t *testing.T) {
	db := inventoryDB(t)
	entry, err := RegisterEntry(context.Background(), db, 4, 3, "secreto")
	if err != nil {
		t.Fatal(err)
	}
	if entry.Material.EnMano != 11 || entry.Material.Disponible != 9 {
		t.Fatalf("entrada inesperada: %#v", entry.Material)
	}
	loss, err := RegisterLoss(context.Background(), db, 4, 2, "consumo_interno", "secreto")
	if err != nil {
		t.Fatal(err)
	}
	if loss.Material.EnMano != 9 || loss.Material.Disponible != 7 {
		t.Fatalf("pérdida inesperada: %#v", loss.Material)
	}
	if _, err := RegisterLoss(context.Background(), db, 4, 10, "consumo_interno", "secreto"); err != ErrInsufficient {
		t.Fatalf("error = %v, se esperaba stock insuficiente", err)
	}
}
