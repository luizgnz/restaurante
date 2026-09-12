package catalog

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

func TestListMarksRecipeUnavailableWhenIngredientsAreReserved(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`
		CREATE TABLE categorias_pos (id INTEGER PRIMARY KEY, nombre TEXT);
		CREATE TABLE productos (id INTEGER PRIMARY KEY, nombre TEXT, precio_centavos INTEGER, categoria_id INTEGER, tipo_consumo TEXT, codigo TEXT, color TEXT, foto_data TEXT, rastrear_inventario INTEGER, activo INTEGER, disponible_en_pos INTEGER);
		CREATE TABLE receta_lineas (id INTEGER PRIMARY KEY, producto_id INTEGER, ingrediente_id INTEGER, cantidad_real REAL);
		CREATE TABLE stock (producto_id INTEGER PRIMARY KEY, on_hand_real REAL, reserved_real REAL);
		CREATE TABLE plato_slots (id INTEGER PRIMARY KEY, producto_id INTEGER);
		INSERT INTO categorias_pos VALUES (1, 'Platos');
		INSERT INTO productos VALUES (1, 'Pollo con arroz', 8900, 1, 'receta_kit', NULL, NULL, NULL, 1, 1, 1);
		INSERT INTO productos VALUES (2, 'Pollo', 0, NULL, 'almacenable_unitario', NULL, NULL, NULL, 1, 1, 0);
		INSERT INTO receta_lineas VALUES (1, 1, 2, 2);
		INSERT INTO stock VALUES (2, 3, 2);`)
	if err != nil {
		t.Fatal(err)
	}
	products, err := List(context.Background(), db)
	if err != nil {
		t.Fatal(err)
	}
	if len(products) != 1 || products[0].Disponible || products[0].Armable == nil || *products[0].Armable != 0 {
		t.Fatalf("carta inesperada: %#v", products)
	}
}
