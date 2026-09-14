package journey_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/luizgnz/restaurante/go/internal/bootstrap"
	"github.com/luizgnz/restaurante/go/internal/journey"
	appRuntime "github.com/luizgnz/restaurante/go/internal/runtime"
)

func TestResetDemoRestoresCatalogStockAndRealMenuOrders(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	migrations, _ := filepath.Abs(filepath.Join("..", "..", "..", "src", "db", "migrations"))
	db, err := appRuntime.OpenAndMigrate(ctx, filepath.Join(root, "data", "salon.sqlite"), migrations)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := bootstrap.Ensure(ctx, db); err != nil {
		t.Fatal(err)
	}
	var ingredientID int64
	var expected float64
	if err := db.QueryRow(`SELECT p.id, d.on_hand_real FROM productos p JOIN demo_stock_base d ON d.producto_id=p.id WHERE p.codigo='insumo:arroz-g'`).Scan(&ingredientID, &expected); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("UPDATE stock SET on_hand_real=1,reserved_real=7 WHERE producto_id=?", ingredientID); err != nil {
		t.Fatal(err)
	}
	result, err := journey.ResetDemo(ctx, db, nil, root)
	if err != nil {
		t.Fatal(err)
	}
	if result.Cuentas != 8 {
		t.Fatalf("cuentas demo=%d", result.Cuentas)
	}
	var onHand, reserved float64
	if err := db.QueryRow("SELECT on_hand_real,reserved_real FROM stock WHERE producto_id=?", ingredientID).Scan(&onHand, &reserved); err != nil {
		t.Fatal(err)
	}
	if onHand != expected || reserved != 0 {
		t.Fatalf("stock restaurado=(%v,%v); esperado=(%v,0)", onHand, reserved, expected)
	}
	var realLines int
	if err := db.QueryRow("SELECT count(*) FROM orden_lineas ol JOIN productos p ON p.id=ol.producto_id WHERE p.codigo LIKE 'menu-real:%'").Scan(&realLines); err != nil {
		t.Fatal(err)
	}
	if realLines == 0 {
		t.Fatal("el día demo no creó órdenes con el menú real")
	}
}

func TestCloseCreatesBackupAndOpenStartsNextJourney(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	migrations, _ := filepath.Abs(filepath.Join("..", "..", "..", "src", "db", "migrations"))
	db, err := appRuntime.OpenAndMigrate(ctx, filepath.Join(root, "data", "salon.sqlite"), migrations)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	closed, err := journey.Close(ctx, db, nil, root)
	if err != nil {
		t.Fatal(err)
	}
	if closed.Jornada.Estado != "cerrada" {
		t.Fatalf("jornada=%#v", closed.Jornada)
	}
	if stat, err := os.Stat(closed.RespaldoRuta); err != nil || stat.Size() == 0 {
		t.Fatalf("respaldo inválido: %v", err)
	}
	opened, err := journey.Open(ctx, db, nil)
	if err != nil {
		t.Fatal(err)
	}
	if opened.ID == closed.Jornada.ID || opened.Estado != "abierta" {
		t.Fatalf("nueva jornada=%#v", opened)
	}
}
