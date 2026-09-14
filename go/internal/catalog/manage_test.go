package catalog_test

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/luizgnz/restaurante/go/internal/catalog"
	appRuntime "github.com/luizgnz/restaurante/go/internal/runtime"
)

func TestManageCatalogCreatesRecipeAndSlots(t *testing.T) {
	ctx := context.Background()
	migrations, _ := filepath.Abs(filepath.Join("..", "..", "..", "src", "db", "migrations"))
	db, err := appRuntime.OpenAndMigrate(ctx, filepath.Join(t.TempDir(), "catalog.sqlite"), migrations)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	category, err := catalog.CreateCategory(ctx, db, "Almuerzos")
	if err != nil {
		t.Fatal(err)
	}
	track, available := true, false
	materialID, err := catalog.CreateProduct(ctx, db, catalog.ProductInput{Nombre: "Papas", CategoriaID: nil, TipoConsumo: "almacenable_unitario", RastrearInventario: &track, DisponibleEnPOS: &available, UnidadBase: "g"})
	if err != nil {
		t.Fatal(err)
	}
	var baseUnit, inventoryUnit string
	if err := db.QueryRow("SELECT unidad_base, unidad_inventario FROM productos WHERE id = ?", materialID).Scan(&baseUnit, &inventoryUnit); err != nil || baseUnit != "g" || inventoryUnit != "g" {
		t.Fatalf("unidades=%s/%s err=%v", baseUnit, inventoryUnit, err)
	}
	recipeID, err := catalog.CreateProduct(ctx, db, catalog.ProductInput{Nombre: "Papas con pollo", PrecioCentavos: 8900, CategoriaID: &category.ID, TipoConsumo: "receta_kit", Receta: []catalog.RecipeLine{{IngredienteID: materialID, Cantidad: 200}}})
	if err != nil {
		t.Fatal(err)
	}
	recipe, err := catalog.GetRecipe(ctx, db, recipeID)
	if err != nil || len(recipe) != 1 || recipe[0].Cantidad != 200 {
		t.Fatalf("receta=%#v err=%v", recipe, err)
	}
	group, err := catalog.CreateContourGroup(ctx, db, "Carbohidrato")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := catalog.CreateContourVariant(ctx, db, group.ID, "Arroz", 0, 500); err != nil {
		t.Fatal(err)
	}
	if err := catalog.SaveSlots(ctx, db, recipeID, []catalog.SlotInput{{Posicion: 1, Nombre: "Acompañante", GrupoIDs: []int64{group.ID}}}); err != nil {
		t.Fatal(err)
	}
	slots, err := catalog.GetSlots(ctx, db, recipeID)
	if err != nil || len(slots) != 1 || len(slots[0].Grupos) != 1 {
		t.Fatalf("slots=%#v err=%v", slots, err)
	}
}
