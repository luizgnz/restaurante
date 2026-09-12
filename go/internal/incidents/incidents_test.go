package incidents_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/luizgnz/restaurante/go/internal/accounts"
	"github.com/luizgnz/restaurante/go/internal/incidents"
	"github.com/luizgnz/restaurante/go/internal/orders"
	appRuntime "github.com/luizgnz/restaurante/go/internal/runtime"
)

func TestReplacementAcceptedCreatesCorrectionWithoutPriceDecision(t *testing.T) {
	db := incidentDB(t)
	seedIncident(t, db)
	sent, lineID := sentIncidentOrder(t, db, "incident-accept")
	replacementID := int64(921)
	proposal := "Cambiar por agua sin gas"
	incident, err := incidents.Create(context.Background(), db, incidents.CreateInput{
		CommandID: sent.CommandID, CommandLineID: &lineID, Type: "sugerencia", Scope: "linea",
		Reason: "No queda agua con gas", Proposal: &proposal, ReplacementProductID: &replacementID,
	})
	if err != nil {
		t.Fatal(err)
	}
	updated, correction, err := incidents.AcceptReplacement(context.Background(), db, incident.ID, 903, "reserva_al_enviar_firme_al_enviar_caja")
	if err != nil || correction == nil || updated.State != "aceptada" {
		t.Fatalf("aceptación inesperada: %#v %#v %v", updated, correction, err)
	}
	detail, err := accounts.Get(context.Background(), db, sent.AccountID)
	if err != nil {
		t.Fatal(err)
	}
	active := map[int64]float64{}
	for _, line := range detail.Orders[0].Lines {
		if line.Quantity > 0 {
			active[line.ProductID] = line.Quantity
		}
	}
	if active[920] != 0 || active[921] != 1 {
		t.Fatalf("productos vigentes inesperados: %#v", active)
	}
}

func TestRejectedReplacementRemovesProductAndAnnulsSingleLineOrder(t *testing.T) {
	db := incidentDB(t)
	seedIncident(t, db)
	sent, lineID := sentIncidentOrder(t, db, "incident-reject")
	replacementID := int64(921)
	proposal := "Cambiar por agua sin gas"
	incident, err := incidents.Create(context.Background(), db, incidents.CreateInput{
		CommandID: sent.CommandID, CommandLineID: &lineID, Type: "sugerencia", Scope: "linea",
		Reason: "No queda agua con gas", Proposal: &proposal, ReplacementProductID: &replacementID,
	})
	if err != nil {
		t.Fatal(err)
	}
	updated, correction, err := incidents.Reject(context.Background(), db, incident.ID, 903, "reserva_al_enviar_firme_al_enviar_caja")
	if err != nil || correction == nil || updated.State != "eliminada" {
		t.Fatalf("rechazo inesperado: %#v %#v %v", updated, correction, err)
	}
	var state string
	if err := db.QueryRow("SELECT estado FROM ordenes WHERE id = ?", sent.OrderID).Scan(&state); err != nil || state != "anulada" {
		t.Fatalf("estado=%s err=%v", state, err)
	}
	var reserved float64
	if err := db.QueryRow("SELECT reserved_real FROM stock WHERE producto_id = 920").Scan(&reserved); err != nil || reserved != 0 {
		t.Fatalf("reserva=%v err=%v", reserved, err)
	}
}

func TestKitchenCanCancelStartedProductAndWaiterGetsUpdate(t *testing.T) {
	db := incidentDB(t)
	seedIncident(t, db)
	sent, lineID := sentIncidentOrder(t, db, "kitchen-cancel")
	if _, err := db.Exec("UPDATE comanda_lineas SET etapa = 'en_proceso' WHERE id = ?", lineID); err != nil {
		t.Fatal(err)
	}
	result, err := incidents.CancelFromKitchen(context.Background(), db, lineID, 903, "No se puede terminar", "reserva_al_enviar_firme_al_enviar_caja")
	if err != nil || result.CorrectionID == 0 {
		t.Fatalf("cancelación inesperada: %#v %v", result, err)
	}
	updates, err := incidents.ListKitchenUpdates(context.Background(), db)
	if err != nil || len(updates) != 1 || updates[0].OrderID != sent.OrderID {
		t.Fatalf("actualizaciones inesperadas: %#v %v", updates, err)
	}
	if _, err := incidents.RecognizeKitchenUpdate(context.Background(), db, updates[0].ID, 903); err != nil {
		t.Fatal(err)
	}
	updates, err = incidents.ListKitchenUpdates(context.Background(), db)
	if err != nil || len(updates) != 0 {
		t.Fatalf("la actualización sigue pendiente: %#v %v", updates, err)
	}
}

func incidentDB(t *testing.T) *sql.DB {
	t.Helper()
	migrations, err := filepath.Abs(filepath.Join("..", "..", "..", "src", "db", "migrations"))
	if err != nil {
		t.Fatal(err)
	}
	db, err := appRuntime.OpenAndMigrate(context.Background(), filepath.Join(t.TempDir(), "incidents.sqlite"), migrations)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func seedIncident(t *testing.T, db *sql.DB) {
	t.Helper()
	_, err := db.Exec(`
		INSERT INTO empleados (id, nombre, pin_hash, derecho, activo) VALUES (903, 'Ana', 'x', 'basico', 1);
		INSERT INTO pisos (id, nombre, activo) VALUES (905, 'Incidencias', 1);
		INSERT INTO mesas (id, piso_id, numero, asientos, activa) VALUES (907, 905, 7, 4, 1);
		INSERT INTO categorias_pos (id, nombre, estacion) VALUES (901, 'Bebidas incidencias', 'cocina');
		INSERT INTO productos
			(id, nombre, precio_centavos, categoria_id, tipo_consumo, disponible_en_pos, activo, rastrear_inventario)
		VALUES
			(920, 'Agua con gas', 1500, 901, 'almacenable_unitario', 1, 1, 1),
			(921, 'Agua sin gas', 1400, 901, 'almacenable_unitario', 1, 1, 1);
		INSERT INTO stock (producto_id, on_hand_real, reserved_real) VALUES (920, 10, 0), (921, 10, 0);
	`)
	if err != nil {
		t.Fatal(err)
	}
}

func sentIncidentOrder(t *testing.T, db *sql.DB, key string) (orders.Result, int64) {
	t.Helper()
	sent, err := orders.Send(context.Background(), db, orders.NewInput{
		TableID: 907, Key: key, Lines: []orders.Line{{ProductID: 920, Quantity: 1}},
	}, 903, orders.SendOptions{})
	if err != nil {
		t.Fatal(err)
	}
	var lineID int64
	if err := db.QueryRow("SELECT id FROM comanda_lineas WHERE comanda_id = ?", sent.CommandID).Scan(&lineID); err != nil {
		t.Fatal(err)
	}
	return sent, lineID
}
