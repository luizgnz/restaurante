package runtime

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

func OpenAndMigrate(ctx context.Context, databasePath, migrationsDir string) (*sql.DB, error) {
	if err := os.MkdirAll(filepath.Dir(databasePath), 0o750); err != nil {
		return nil, fmt.Errorf("crear directorio de datos: %w", err)
	}

	dsn := sqliteFileDSN(databasePath, runtime.GOOS == "windows")
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("abrir SQLite: %w", err)
	}
	if _, err := db.ExecContext(ctx, "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;"); err != nil {
		db.Close()
		return nil, fmt.Errorf("configurar SQLite: %w", err)
	}
	if err := backupBeforeCatalogMigration(ctx, db, databasePath, migrationsDir); err != nil {
		db.Close()
		return nil, err
	}
	if err := Migrate(ctx, db, migrationsDir); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

func sqliteFileDSN(databasePath string, windows bool) string {
	path := databasePath
	if windows {
		// SQLite espera file:///C:/...; las barras invertidas de Windows no
		// forman una URI de archivo válida y terminan escapadas como %5C.
		path = strings.ReplaceAll(path, `\`, "/")
		if len(path) >= 2 && path[1] == ':' {
			path = "/" + path
		}
	}
	return (&url.URL{Scheme: "file", Path: path}).String() + "?_foreign_keys=on&_busy_timeout=5000&_pragma=journal_mode(WAL)"
}

// backupBeforeCatalogMigration protege una base operativa antes de sustituir
// el catálogo. Una instalación nueva no genera una copia vacía y la marca de
// schema_migrations impide repetir respaldos en cada arranque.
func backupBeforeCatalogMigration(ctx context.Context, db *sql.DB, databasePath, migrationsDir string) error {
	const migrationID = "026_menu_real_restaurante"
	if _, err := os.Stat(filepath.Join(migrationsDir, migrationID+".sql")); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("revisar migración de catálogo: %w", err)
	}
	var migrationTable int
	if err := db.QueryRowContext(ctx, "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='schema_migrations'").Scan(&migrationTable); err != nil {
		return fmt.Errorf("revisar historial de migraciones: %w", err)
	}
	if migrationTable == 0 {
		return nil
	}
	var applied int
	if err := db.QueryRowContext(ctx, "SELECT count(*) FROM schema_migrations WHERE id=?", migrationID).Scan(&applied); err != nil {
		return fmt.Errorf("revisar migración de catálogo: %w", err)
	}
	if applied > 0 {
		return nil
	}
	var operationalTables int
	if err := db.QueryRowContext(ctx, "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('productos','ordenes','cuentas')").Scan(&operationalTables); err != nil {
		return fmt.Errorf("revisar base operativa: %w", err)
	}
	if operationalTables == 0 {
		return nil
	}
	backupDir := filepath.Join(filepath.Dir(databasePath), "backups")
	if err := os.MkdirAll(backupDir, 0o750); err != nil {
		return fmt.Errorf("crear carpeta de respaldo de catálogo: %w", err)
	}
	stamp := time.Now().UTC().Format("20060102T150405.000000000Z")
	destination := filepath.Join(backupDir, "antes-menu-real-"+stamp+".sqlite")
	if _, err := db.ExecContext(ctx, "PRAGMA wal_checkpoint(FULL)"); err != nil {
		return fmt.Errorf("preparar respaldo de catálogo: %w", err)
	}
	escaped := strings.ReplaceAll(destination, "'", "''")
	if _, err := db.ExecContext(ctx, "VACUUM INTO '"+escaped+"'"); err != nil {
		return fmt.Errorf("respaldar base antes del catálogo real: %w", err)
	}
	return nil
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
