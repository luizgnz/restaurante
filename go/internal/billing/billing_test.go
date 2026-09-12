package billing_test

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	"github.com/luizgnz/restaurante/go/internal/billing"
	"github.com/luizgnz/restaurante/go/internal/orders"
	appRuntime "github.com/luizgnz/restaurante/go/internal/runtime"
)

func TestPrecountFirmsOnceAndRejectsStaleDocumentAtClose(t *testing.T) {
	db := billingDB(t)
	seedBilling(t, db)
	first := send(t, db, "billing-first", 2)

	precount, err := billing.EmitPrecount(context.Background(), db, first.AccountID, 903, billing.Options{
		InventoryPolicy: "reserva_al_enviar_firme_al_precuenta",
	})
	if err != nil || precount.Number != 1 || precount.TotalCents != 3000 {
		t.Fatalf("precuenta inesperada: %#v, %v", precount, err)
	}
	assertStock(t, db, 8, 0)
	secondPrecount, err := billing.EmitPrecount(context.Background(), db, first.AccountID, 903, billing.Options{
		InventoryPolicy: "reserva_al_enviar_firme_al_precuenta",
	})
	if err != nil || secondPrecount.Number != 2 {
		t.Fatalf("segunda precuenta inesperada: %#v, %v", secondPrecount, err)
	}
	assertStock(t, db, 8, 0)

	send(t, db, "billing-second", 1)
	_, err = billing.SendToCash(context.Background(), db, first.AccountID, 903, billing.Options{RequirePrecount: true})
	var domain *billing.Error
	if !errors.As(err, &domain) || domain.Code != "precuenta_desactualizada" {
		t.Fatalf("se esperaba precuenta_desactualizada, llegó %v", err)
	}
	latest, err := billing.EmitPrecount(context.Background(), db, first.AccountID, 903, billing.Options{
		InventoryPolicy: "reserva_al_enviar_firme_al_precuenta",
	})
	if err != nil || latest.Number != 3 || latest.TotalCents != 4500 {
		t.Fatalf("precuenta actual inesperada: %#v, %v", latest, err)
	}
	handoff, err := billing.SendToCash(context.Background(), db, first.AccountID, 903, billing.Options{RequirePrecount: true})
	if err != nil || handoff.HandoffID == 0 {
		t.Fatalf("cierre inesperado: %#v, %v", handoff, err)
	}
	assertStock(t, db, 7, 0)
	var state string
	if err := db.QueryRow("SELECT estado FROM cuentas WHERE id = ?", first.AccountID).Scan(&state); err != nil || state != "en_caja" {
		t.Fatalf("estado=%s err=%v", state, err)
	}
}

func TestCancelAccountReturnsReservedAndPreparedInventory(t *testing.T) {
	db := billingDB(t)
	seedBilling(t, db)
	sent := send(t, db, "billing-cancel", 2)
	if _, err := db.Exec(`UPDATE comanda_lineas SET etapa = 'en_proceso'
		WHERE comanda_id = ?`, sent.CommandID); err != nil {
		t.Fatal(err)
	}
	result, err := billing.CancelAccount(context.Background(), db, sent.AccountID, 903, "Cliente se retiró")
	if err != nil {
		t.Fatal(err)
	}
	if result.PreparedLines != 2 || result.ReleasedLines != 2 || result.TotalCents != 3000 {
		t.Fatalf("cancelación inesperada: %#v", result)
	}
	assertStock(t, db, 10, 0)
	var state string
	if err := db.QueryRow("SELECT estado FROM cuentas WHERE id = ?", sent.AccountID).Scan(&state); err != nil || state != "cancelada" {
		t.Fatalf("estado=%s err=%v", state, err)
	}
	var audit int
	if err := db.QueryRow("SELECT count(*) FROM cancelaciones_cuentas WHERE cuenta_id = ?", sent.AccountID).Scan(&audit); err != nil || audit != 1 {
		t.Fatalf("auditoría=%d err=%v", audit, err)
	}
}

func billingDB(t *testing.T) *sql.DB {
	t.Helper()
	migrations, err := filepath.Abs(filepath.Join("..", "..", "..", "src", "db", "migrations"))
	if err != nil {
		t.Fatal(err)
	}
	db, err := appRuntime.OpenAndMigrate(context.Background(), filepath.Join(t.TempDir(), "billing.sqlite"), migrations)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func seedBilling(t *testing.T, db *sql.DB) {
	t.Helper()
	_, err := db.Exec(`
		INSERT INTO empleados (id, nombre, pin_hash, derecho, activo) VALUES (903, 'Ana', 'x', 'basico', 1);
		INSERT INTO pisos (id, nombre, activo) VALUES (905, 'Facturación', 1);
		INSERT INTO mesas (id, piso_id, numero, asientos, activa) VALUES (907, 905, 7, 4, 1);
		INSERT INTO categorias_pos (id, nombre, estacion) VALUES (901, 'Bebidas facturación', 'cocina');
		INSERT INTO productos
			(id, nombre, precio_centavos, categoria_id, tipo_consumo, disponible_en_pos, activo, rastrear_inventario)
		VALUES (920, 'Agua', 1500, 901, 'almacenable_unitario', 1, 1, 1);
		INSERT INTO stock (producto_id, on_hand_real, reserved_real) VALUES (920, 10, 0);
	`)
	if err != nil {
		t.Fatal(err)
	}
}

func send(t *testing.T, db *sql.DB, key string, quantity float64) orders.Result {
	t.Helper()
	result, err := orders.Send(context.Background(), db, orders.NewInput{
		TableID: 907, Key: key, Lines: []orders.Line{{ProductID: 920, Quantity: quantity}},
	}, 903, orders.SendOptions{})
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func assertStock(t *testing.T, db *sql.DB, onHand, reserved float64) {
	t.Helper()
	var gotOnHand, gotReserved float64
	if err := db.QueryRow("SELECT on_hand_real, reserved_real FROM stock WHERE producto_id = 920").Scan(&gotOnHand, &gotReserved); err != nil {
		t.Fatal(err)
	}
	if gotOnHand != onHand || gotReserved != reserved {
		t.Fatalf("stock=(%v,%v), se esperaba (%v,%v)", gotOnHand, gotReserved, onHand, reserved)
	}
}
