package journey_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/luizgnz/restaurante/go/internal/journey"
	appRuntime "github.com/luizgnz/restaurante/go/internal/runtime"
)

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
