package orders_test

import (
	"context"
	"errors"
	"testing"

	"github.com/luizgnz/restaurante/go/internal/accounts"
	"github.com/luizgnz/restaurante/go/internal/orders"
)

func TestCorrectionKeepsOriginalAndAdjustsInventoryBook(t *testing.T) {
	db := migratedDatabase(t)
	seedOrderScenario(t, db)
	sent, err := orders.Send(context.Background(), db, orders.NewInput{
		TableID: 907, Key: "base-correction", Lines: []orders.Line{{ProductID: 920, Quantity: 2}},
	}, 903, orders.SendOptions{})
	if err != nil {
		t.Fatal(err)
	}
	var lineID int64
	var lineKey string
	if err := db.QueryRow("SELECT id, linea_clave FROM orden_lineas WHERE orden_id = ?", sent.OrderID).Scan(&lineID, &lineKey); err != nil {
		t.Fatal(err)
	}
	corrected, err := orders.Correct(context.Background(), db, orders.CorrectionInput{
		OrderID: sent.OrderID,
		Key:     "correction-1",
		Lines: []orders.CorrectionLine{{
			LineKey: lineKey, ProductID: 920, OrderLineID: &lineID, Quantity: 1,
		}},
	}, 903, orders.CorrectionOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if corrected.Repeated || corrected.CorrectionID == 0 || corrected.CommandID == 0 {
		t.Fatalf("corrección inesperada: %#v", corrected)
	}
	var original float64
	if err := db.QueryRow("SELECT cantidad FROM orden_lineas WHERE id = ?", lineID).Scan(&original); err != nil {
		t.Fatal(err)
	}
	if original != 2 {
		t.Fatalf("se modificó la línea original: %v", original)
	}
	detail, err := accounts.Get(context.Background(), db, sent.AccountID)
	if err != nil {
		t.Fatal(err)
	}
	if detail.Orders[0].Lines[0].Quantity != 1 {
		t.Fatalf("versión vigente inesperada: %#v", detail.Orders[0].Lines)
	}
	var reserved float64
	if err := db.QueryRow("SELECT reserved_real FROM stock WHERE producto_id = 910").Scan(&reserved); err != nil {
		t.Fatal(err)
	}
	if reserved != .5 {
		t.Fatalf("reserva inesperada: %v", reserved)
	}

	repeated, err := orders.Correct(context.Background(), db, orders.CorrectionInput{
		OrderID: sent.OrderID,
		Key:     "correction-1",
		Lines:   []orders.CorrectionLine{{LineKey: lineKey, ProductID: 920, OrderLineID: &lineID, Quantity: 1}},
	}, 903, orders.CorrectionOptions{})
	if err != nil || !repeated.Repeated || repeated.CorrectionID != corrected.CorrectionID {
		t.Fatalf("reintento inesperado: %#v, %v", repeated, err)
	}
}

func TestWaiterCannotCancelStartedProductButKitchenCan(t *testing.T) {
	db := migratedDatabase(t)
	seedOrderScenario(t, db)
	sent, err := orders.Send(context.Background(), db, orders.NewInput{
		TableID: 907, Key: "started-base", Lines: []orders.Line{{ProductID: 920, Quantity: 1}},
	}, 903, orders.SendOptions{})
	if err != nil {
		t.Fatal(err)
	}
	var lineID int64
	var lineKey string
	if err := db.QueryRow("SELECT id, linea_clave FROM orden_lineas WHERE orden_id = ?", sent.OrderID).Scan(&lineID, &lineKey); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("UPDATE comanda_lineas SET etapa = 'en_proceso' WHERE orden_linea_id = ?", lineID); err != nil {
		t.Fatal(err)
	}
	reason := "No se puede terminar"
	input := orders.CorrectionInput{
		OrderID: sent.OrderID,
		Key:     "waiter-cancel",
		Reason:  &reason,
		Lines:   []orders.CorrectionLine{{LineKey: lineKey, ProductID: 920, OrderLineID: &lineID, Quantity: 0}},
	}
	_, err = orders.Correct(context.Background(), db, input, 903, orders.CorrectionOptions{Origin: "mesero"})
	var domain *orders.Error
	if !errors.As(err, &domain) || domain.Code != "orden_en_preparacion" {
		t.Fatalf("se esperaba orden_en_preparacion, llegó %v", err)
	}
	input.Key = "kitchen-cancel"
	result, err := orders.Correct(context.Background(), db, input, 903, orders.CorrectionOptions{Origin: "cocina"})
	if err != nil {
		t.Fatal(err)
	}
	if result.CorrectionID == 0 {
		t.Fatalf("cancelación inesperada: %#v", result)
	}
	var stage string
	if err := db.QueryRow("SELECT etapa FROM comanda_lineas WHERE orden_linea_id = ?", lineID).Scan(&stage); err != nil {
		t.Fatal(err)
	}
	if stage != "cancelado" {
		t.Fatalf("etapa = %s", stage)
	}
	var reserved float64
	if err := db.QueryRow("SELECT reserved_real FROM stock WHERE producto_id = 910").Scan(&reserved); err != nil {
		t.Fatal(err)
	}
	if reserved != 0 {
		t.Fatalf("la reserva no volvió: %v", reserved)
	}
}
