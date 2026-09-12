package runtime

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestOpenAndMigrateAppliesFilesOnce(t *testing.T) {
	dir := t.TempDir()
	migrations := filepath.Join(dir, "migrations")
	if err := os.MkdirAll(migrations, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(migrations, "001_test.sql"), []byte("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL);"), 0o600); err != nil {
		t.Fatal(err)
	}

	db, err := OpenAndMigrate(context.Background(), filepath.Join(dir, "data", "salon.sqlite"), migrations)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec("INSERT INTO items (name) VALUES ('café')"); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(context.Background(), db, migrations); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := db.QueryRow("SELECT count(*) FROM schema_migrations WHERE id = '001_test'").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("migración aplicada %d veces, se esperaba una", count)
	}
}
