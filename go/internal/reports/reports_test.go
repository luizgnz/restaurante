package reports_test

import (
	"bytes"
	"context"
	"path/filepath"
	"testing"

	"github.com/luizgnz/restaurante/go/internal/bootstrap"
	"github.com/luizgnz/restaurante/go/internal/reports"
	appRuntime "github.com/luizgnz/restaurante/go/internal/runtime"
)

func TestReportsQueryFreshDatabaseAndGeneratePDF(t *testing.T) {
	migrations, err := filepath.Abs(filepath.Join("..", "..", "..", "src", "db", "migrations"))
	if err != nil {
		t.Fatal(err)
	}
	db, err := appRuntime.OpenAndMigrate(context.Background(), filepath.Join(t.TempDir(), "reports.sqlite"), migrations)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := bootstrap.Ensure(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	period, err := reports.ParsePeriod("2026-09-01", "2026-09-30")
	if err != nil {
		t.Fatal(err)
	}
	sales, err := reports.Sales(context.Background(), db, period)
	if err != nil {
		t.Fatal(err)
	}
	salesPDF, err := reports.SalesPDF("La Olla de Casa", period, sales)
	assertPDF(t, salesPDF, err)
	inventory, err := reports.Inventory(context.Background(), db, period)
	if err != nil {
		t.Fatal(err)
	}
	if len(inventory.Rows) == 0 {
		t.Fatal("el inventario inicial no puede estar vacío")
	}
	inventoryPDF, err := reports.InventoryPDF("La Olla de Casa", period, inventory)
	assertPDF(t, inventoryPDF, err)
}

func TestParsePeriodRejectsInvalidRanges(t *testing.T) {
	if _, err := reports.ParsePeriod("2026-09-12", "2026-09-11"); err == nil {
		t.Fatal("debía rechazar un período invertido")
	}
	if _, err := reports.ParsePeriod("", "2026-09-11"); err == nil {
		t.Fatal("debía rechazar una fecha vacía")
	}
}

func assertPDF(t *testing.T, content []byte, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
	if len(content) < 500 || !bytes.HasPrefix(content, []byte("%PDF-")) {
		t.Fatalf("documento PDF inválido: %d bytes", len(content))
	}
}
