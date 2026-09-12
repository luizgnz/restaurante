package orders_test

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	"github.com/luizgnz/restaurante/go/internal/orders"
	appRuntime "github.com/luizgnz/restaurante/go/internal/runtime"
)

func TestSendCreatesAccountCommandInventoryAndIsIdempotent(t *testing.T) {
	db := migratedDatabase(t)
	seedOrderScenario(t, db)

	input := orders.NewInput{
		TableID:     907,
		ServiceType: "mesa",
		Key:         "envio-prueba-1",
		Lines:       []orders.Line{{ProductID: 920, Quantity: 2}},
	}
	result, err := orders.Send(context.Background(), db, input, 903, orders.SendOptions{
		InventoryPolicy: "reserva_al_enviar_firme_al_enviar_caja",
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Repeated || result.AccountID == 0 || result.OrderID == 0 || result.CommandID == 0 {
		t.Fatalf("resultado inesperado: %#v", result)
	}

	var reserved, onHand float64
	if err := db.QueryRow("SELECT reserved_real, on_hand_real FROM stock WHERE producto_id = 910").Scan(&reserved, &onHand); err != nil {
		t.Fatal(err)
	}
	if reserved != 1 || onHand != 10 {
		t.Fatalf("stock inesperado: reservado=%v en_mano=%v", reserved, onHand)
	}
	assertCount(t, db, "ordenes", 1)
	assertCount(t, db, "comandas", 1)
	assertCount(t, db, "comanda_lineas", 1)
	assertCount(t, db, "orden_linea_inventario", 1)
	assertCount(t, db, "print_jobs", 1)

	repeated, err := orders.Send(context.Background(), db, input, 903, orders.SendOptions{
		InventoryPolicy: "reserva_al_enviar_firme_al_enviar_caja",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !repeated.Repeated || repeated.OrderID != result.OrderID || repeated.CommandID != result.CommandID {
		t.Fatalf("reintento inesperado: %#v", repeated)
	}
	assertCount(t, db, "ordenes", 1)
	assertCount(t, db, "print_jobs", 1)
}

func TestSendRollsBackWhenStockIsInsufficient(t *testing.T) {
	db := migratedDatabase(t)
	seedOrderScenario(t, db)

	_, err := orders.Send(context.Background(), db, orders.NewInput{
		TableID:     907,
		ServiceType: "mesa",
		Key:         "sin-stock",
		Lines:       []orders.Line{{ProductID: 920, Quantity: 30}},
	}, 903, orders.SendOptions{InventoryPolicy: "descuento_al_enviar"})
	var domainError *orders.Error
	if !errors.As(err, &domainError) || domainError.Code != "stock_insuficiente" {
		t.Fatalf("se esperaba stock_insuficiente, llegó %v", err)
	}
	assertCount(t, db, "cuentas", 0)
	assertCount(t, db, "ordenes", 0)
	assertCount(t, db, "print_jobs", 0)
}

func TestSendTakeawayUsesTechnicalTableAndSequentialNumber(t *testing.T) {
	db := migratedDatabase(t)
	seedOrderScenario(t, db)
	name := "Camila"

	result, err := orders.Send(context.Background(), db, orders.NewInput{
		ServiceType:  "para_llevar",
		CustomerName: &name,
		Key:          "para-llevar-1",
		Lines:        []orders.Line{{ProductID: 920, Quantity: 1}},
	}, 903, orders.SendOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if result.ServiceNumber == nil || *result.ServiceNumber != 1 || result.CustomerName == nil || *result.CustomerName != name {
		t.Fatalf("identificación inesperada: %#v", result)
	}
	var service string
	var tableActive, floorActive int
	if err := db.QueryRow(`
		SELECT c.tipo_servicio, m.activa, p.activo
		FROM cuentas c
		JOIN mesas m ON m.id = c.mesa_id
		JOIN pisos p ON p.id = m.piso_id
		WHERE c.id = ?`, result.AccountID).Scan(&service, &tableActive, &floorActive); err != nil {
		t.Fatal(err)
	}
	if service != "para_llevar" || tableActive != 0 || floorActive != 0 {
		t.Fatalf("mesa técnica inesperada: servicio=%s mesa=%d piso=%d", service, tableActive, floorActive)
	}
}

func migratedDatabase(t *testing.T) *sql.DB {
	t.Helper()
	migrations, err := filepath.Abs(filepath.Join("..", "..", "..", "src", "db", "migrations"))
	if err != nil {
		t.Fatal(err)
	}
	db, err := appRuntime.OpenAndMigrate(
		context.Background(),
		filepath.Join(t.TempDir(), "restaurante.sqlite"),
		migrations,
	)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func seedOrderScenario(t *testing.T, db *sql.DB) {
	t.Helper()
	_, err := db.Exec(`
		INSERT INTO empleados (id, nombre, pin_hash, derecho, activo)
		VALUES (903, 'Ana', 'no-se-usa-en-prueba-directa', 'basico', 1);
		INSERT INTO pisos (id, nombre, activo) VALUES (905, 'Salón de prueba', 1);
		INSERT INTO mesas (id, piso_id, numero, asientos, activa)
		VALUES (907, 905, 907, 4, 1);
		INSERT INTO categorias_pos (id, nombre, estacion)
		VALUES (901, 'Platos de prueba', 'cocina');
		INSERT INTO productos
			(id, nombre, precio_centavos, categoria_id, tipo_consumo, disponible_en_pos, activo, rastrear_inventario)
		VALUES
			(910, 'Pollo de prueba', 0, 901, 'almacenable_unitario', 0, 1, 1),
			(920, 'Pollo con papas de prueba', 8900, 901, 'receta_kit', 1, 1, 0);
		INSERT INTO receta_lineas (producto_id, ingrediente_id, cantidad_real)
		VALUES (920, 910, 0.5);
		INSERT INTO stock (producto_id, on_hand_real, reserved_real)
		VALUES (910, 10, 0);
	`)
	if err != nil {
		t.Fatal(err)
	}
}

func assertCount(t *testing.T, db *sql.DB, table string, expected int) {
	t.Helper()
	var count int
	if err := db.QueryRow("SELECT count(*) FROM " + table).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != expected {
		t.Fatalf("%s: hay %d registros, se esperaban %d", table, count, expected)
	}
}
