package runtime

import (
	"context"
	"net/url"
	"os"
	"path/filepath"
	"testing"
)

func TestSQLiteFileDSNWindows(t *testing.T) {
	dsn := sqliteFileDSN(`C:\ProgramData\Restaurante\data\salon.sqlite`, true)
	parsed, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Scheme != "file" || parsed.Path != "/C:/ProgramData/Restaurante/data/salon.sqlite" {
		t.Fatalf("URI SQLite de Windows incorrecta: %s", dsn)
	}
	if parsed.Query().Get("_pragma") != "journal_mode(WAL)" {
		t.Fatalf("faltan opciones SQLite: %s", dsn)
	}
}

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

func TestCatalogMigrationBacksUpAnExistingDatabase(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	migrations := filepath.Join(dir, "migrations")
	data := filepath.Join(dir, "data")
	if err := os.MkdirAll(migrations, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(migrations, "001_base.sql"), []byte("CREATE TABLE productos (id INTEGER PRIMARY KEY); CREATE TABLE ordenes (id INTEGER PRIMARY KEY); CREATE TABLE cuentas (id INTEGER PRIMARY KEY);"), 0o600); err != nil {
		t.Fatal(err)
	}
	databasePath := filepath.Join(data, "salon.sqlite")
	db, err := OpenAndMigrate(ctx, databasePath, migrations)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("INSERT INTO productos (id) VALUES (77)"); err != nil {
		t.Fatal(err)
	}
	db.Close()
	if err := os.WriteFile(filepath.Join(migrations, "026_menu_real_restaurante.sql"), []byte("ALTER TABLE productos ADD COLUMN nombre TEXT;"), 0o600); err != nil {
		t.Fatal(err)
	}
	db, err = OpenAndMigrate(ctx, databasePath, migrations)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()
	matches, err := filepath.Glob(filepath.Join(data, "backups", "antes-menu-real-*.sqlite"))
	if err != nil || len(matches) != 1 {
		t.Fatalf("respaldos=%v error=%v", matches, err)
	}
}
