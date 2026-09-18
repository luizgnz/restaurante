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
	var floorName string
	if err := db.QueryRow("SELECT nombre FROM pisos WHERE activo = 1 ORDER BY id LIMIT 1").Scan(&floorName); err != nil || floorName != "Salón principal" {
		t.Fatalf("salón inicial=%q err=%v", floorName, err)
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
	var activeMenu, recipes, photos, drinks int
	if err := db.QueryRow("SELECT count(*) FROM productos WHERE activo=1 AND disponible_en_pos=1 AND codigo LIKE 'menu-real:%'").Scan(&activeMenu); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow("SELECT count(DISTINCT producto_id) FROM receta_lineas WHERE producto_id IN (SELECT id FROM productos WHERE codigo LIKE 'menu-real:%')").Scan(&recipes); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow("SELECT count(*) FROM productos WHERE activo=1 AND disponible_en_pos=1 AND codigo LIKE 'menu-real:%' AND foto_data LIKE '/productos/menu-real/%'").Scan(&photos); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow("SELECT count(*) FROM productos p JOIN categorias_pos c ON c.id=p.categoria_id WHERE p.activo=1 AND p.disponible_en_pos=1 AND c.nombre='Bebidas'").Scan(&drinks); err != nil {
		t.Fatal(err)
	}
	if activeMenu != 81 || photos != activeMenu || recipes != 57 || drinks != 28 {
		t.Fatalf("catálogo real inesperado: menu=%d fotos=%d recetas=%d bebidas=%d", activeMenu, photos, recipes, drinks)
	}
}
