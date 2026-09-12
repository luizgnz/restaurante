package runtime

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"

	_ "modernc.org/sqlite"
)

func OpenAndMigrate(ctx context.Context, databasePath, migrationsDir string) (*sql.DB, error) {
	if err := os.MkdirAll(filepath.Dir(databasePath), 0o750); err != nil {
		return nil, fmt.Errorf("crear directorio de datos: %w", err)
	}

	dsn := (&url.URL{Scheme: "file", Path: databasePath}).String() + "?_foreign_keys=on&_busy_timeout=5000&_pragma=journal_mode(WAL)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("abrir SQLite: %w", err)
	}
	if _, err := db.ExecContext(ctx, "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;"); err != nil {
		db.Close()
		return nil, fmt.Errorf("configurar SQLite: %w", err)
	}
	if err := Migrate(ctx, db, migrationsDir); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// Migrate aplica los mismos archivos SQL versionados que usa el backend
// TypeScript. El historial en schema_migrations evita reejecutarlos.
func Migrate(ctx context.Context, db *sql.DB, migrationsDir string) error {
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("leer migraciones en %s: %w", migrationsDir, err)
	}

	files := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql") {
			files = append(files, entry.Name())
		}
	}
	sort.Strings(files)

	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY);`); err != nil {
		return fmt.Errorf("crear historial de migraciones: %w", err)
	}

	for _, file := range files {
		id := strings.TrimSuffix(file, ".sql")
		var found string
		err := db.QueryRowContext(ctx, "SELECT id FROM schema_migrations WHERE id = ?", id).Scan(&found)
		if err == nil {
			continue
		}
		if err != sql.ErrNoRows {
			return fmt.Errorf("consultar migración %s: %w", id, err)
		}

		sqlBytes, err := os.ReadFile(filepath.Join(migrationsDir, file))
		if err != nil {
			return fmt.Errorf("leer migración %s: %w", file, err)
		}
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("iniciar migración %s: %w", id, err)
		}
		if _, err = tx.ExecContext(ctx, string(sqlBytes)); err == nil {
			_, err = tx.ExecContext(ctx, "INSERT INTO schema_migrations (id) VALUES (?)", id)
		}
		if err != nil {
			tx.Rollback()
			return fmt.Errorf("aplicar migración %s: %w", id, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("confirmar migración %s: %w", id, err)
		}
	}
	return nil
}
