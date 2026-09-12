package bootstrap_test

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/luizgnz/restaurante/go/internal/auth"
	"github.com/luizgnz/restaurante/go/internal/bootstrap"
	appRuntime "github.com/luizgnz/restaurante/go/internal/runtime"
)

func TestEnsureMakesFreshDatabaseOperableAndIsIdempotent(t *testing.T) {
	ctx := context.Background()
	migrations, _ := filepath.Abs(filepath.Join("..", "..", "..", "src", "db", "migrations"))
	db, err := appRuntime.OpenAndMigrate(ctx, filepath.Join(t.TempDir(), "fresh.sqlite"), migrations)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := bootstrap.Ensure(ctx, db); err != nil {
		t.Fatal(err)
	}
	if _, _, err := auth.Open(ctx, db, "admin", "admin"); err != nil {
		t.Fatalf("login inicial: %v", err)
	}
	if err := bootstrap.Ensure(ctx, db); err != nil {
		t.Fatal(err)
	}
	for table, minimum := range map[string]int{"empleados": 2, "mesas": 10, "productos": 20, "contorno_grupos": 4, "contorno_variantes": 11, "plato_slots": 4} {
		var count int
		if err := db.QueryRow("SELECT count(*) FROM " + table).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count < minimum {
			t.Fatalf("%s=%d", table, count)
		}
	}
}
