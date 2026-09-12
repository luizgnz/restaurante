package runtime

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/luizgnz/restaurante/go/internal/auth"
	"github.com/luizgnz/restaurante/go/internal/config"
	"github.com/luizgnz/restaurante/go/internal/orders"
)

type cancellationFixture struct {
	db      *sql.DB
	handler http.Handler
	users   map[string]auth.ManagedUser
	tokens  map[string]string
}

func TestCancelAccountHTTPRequiresAuthorizedPINAndReason(t *testing.T) {
	fixture := newCancellationFixture(t)

	adminAccount := fixture.order(t, "cancel-admin")
	response := fixture.request(t, "admin", http.MethodPost, fmt.Sprintf("/api/cuentas/%d/cancelar", adminAccount.AccountID), map[string]any{
		"pin": "9001", "motivo": "Cliente se retiró antes de pagar",
	})
	if response.Code != http.StatusOK {
		t.Fatalf("administración no pudo cancelar: status=%d cuerpo=%s", response.Code, response.Body.String())
	}
	fixture.assertAccount(t, adminAccount.AccountID, "cancelada", 1)
	fixture.assertStock(t, 10, 0)

	shiftAccount := fixture.order(t, "cancel-encargado")
	response = fixture.request(t, "encargado", http.MethodPost, fmt.Sprintf("/api/cuentas/%d/cancelar", shiftAccount.AccountID), map[string]any{
		"pin": "9002", "motivo": "Cierre autorizado por encargado de turno",
	})
	if response.Code != http.StatusOK {
		t.Fatalf("encargado no pudo cancelar: status=%d cuerpo=%s", response.Code, response.Body.String())
	}
	fixture.assertAccount(t, shiftAccount.AccountID, "cancelada", 1)

	openAccount := fixture.order(t, "cancel-rechazos")
	response = fixture.request(t, "mesero", http.MethodPost, fmt.Sprintf("/api/cuentas/%d/cancelar", openAccount.AccountID), map[string]any{
		"pin": "9003", "motivo": "Intento sin autorización",
	})
	if response.Code != http.StatusForbidden {
		t.Fatalf("mesero debía ser rechazado: status=%d cuerpo=%s", response.Code, response.Body.String())
	}
	fixture.assertAccount(t, openAccount.AccountID, "abierta", 0)

	response = fixture.request(t, "admin", http.MethodPost, fmt.Sprintf("/api/cuentas/%d/cancelar", openAccount.AccountID), map[string]any{
		"pin": "incorrecto", "motivo": "PIN inválido",
	})
	if response.Code != http.StatusBadRequest {
		t.Fatalf("PIN inválido debía devolver 400: status=%d cuerpo=%s", response.Code, response.Body.String())
	}
	fixture.assertAccount(t, openAccount.AccountID, "abierta", 0)

	response = fixture.request(t, "admin", http.MethodPost, fmt.Sprintf("/api/cuentas/%d/cancelar", openAccount.AccountID), map[string]any{
		"pin": "9001", "motivo": " ",
	})
	if response.Code != http.StatusBadRequest {
		t.Fatalf("motivo vacío debía devolver 400: status=%d cuerpo=%s", response.Code, response.Body.String())
	}
	fixture.assertAccount(t, openAccount.AccountID, "abierta", 0)

	response = fixture.request(t, "admin", http.MethodPost, fmt.Sprintf("/api/cuentas/%d/cancelar", adminAccount.AccountID), map[string]any{
		"pin": "9001", "motivo": "Reintento sobre cuenta cerrada",
	})
	if response.Code != http.StatusConflict {
		t.Fatalf("cuenta cerrada debía devolver 409: status=%d cuerpo=%s", response.Code, response.Body.String())
	}
}

func TestCancelStartedProductHTTPOnlyAllowsKitchenAndReturnsReservation(t *testing.T) {
	fixture := newCancellationFixture(t)
	order := fixture.order(t, "cancel-producto-iniciado")
	var commandLineID int64
	if err := fixture.db.QueryRow("SELECT id FROM comanda_lineas WHERE comanda_id = ?", order.CommandID).Scan(&commandLineID); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.db.Exec("UPDATE comanda_lineas SET etapa = 'en_proceso' WHERE id = ?", commandLineID); err != nil {
		t.Fatal(err)
	}

	response := fixture.request(t, "mesero", http.MethodPost, fmt.Sprintf("/api/kds/lineas/%d/cancelar", commandLineID), map[string]any{"motivo": "No se puede terminar"})
	if response.Code != http.StatusForbidden {
		t.Fatalf("mesero debía ser rechazado: status=%d cuerpo=%s", response.Code, response.Body.String())
	}
	fixture.assertStock(t, 10, 1)

	response = fixture.request(t, "cocina", http.MethodPost, fmt.Sprintf("/api/kds/lineas/%d/cancelar", commandLineID), map[string]any{"motivo": "No se puede terminar"})
	if response.Code != http.StatusOK {
		t.Fatalf("cocina no pudo cancelar: status=%d cuerpo=%s", response.Code, response.Body.String())
	}
	fixture.assertStock(t, 10, 0)

	var state string
	if err := fixture.db.QueryRow("SELECT estado FROM ordenes WHERE id = ?", order.OrderID).Scan(&state); err != nil {
		t.Fatal(err)
	}
	if state != "anulada" {
		t.Fatalf("orden=%s; se esperaba anulada", state)
	}
	var audit int
	if err := fixture.db.QueryRow("SELECT count(*) FROM cancelaciones_productos_cocina WHERE orden_id = ?", order.OrderID).Scan(&audit); err != nil {
		t.Fatal(err)
	}
	if audit != 1 {
		t.Fatalf("auditoría de cocina=%d; se esperaba 1", audit)
	}
}

func newCancellationFixture(t *testing.T) cancellationFixture {
	t.Helper()
	migrations, err := filepath.Abs(filepath.Join("..", "..", "..", "src", "db", "migrations"))
	if err != nil {
		t.Fatal(err)
	}
	db, err := OpenAndMigrate(context.Background(), filepath.Join(t.TempDir(), "cancellations.sqlite"), migrations)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })

	users := map[string]auth.ManagedUser{}
	for _, item := range []struct{ key, name, username, pin, role string }{
		{"admin", "Administración", "admin-cancel", "9001", "administrador"},
		{"encargado", "Encargado", "encargado-cancel", "9002", "encargado_turno"},
		{"mesero", "Mesero", "mesero-cancel", "9003", "mesero"},
		{"cocina", "Cocina", "cocina-cancel", "9004", "cocina"},
	} {
		username, pin, password := item.username, item.pin, "secreto-"+item.key
		user, err := auth.CreateUser(context.Background(), db, auth.UserInput{
			Nombre: item.name, Usuario: &username, PIN: &pin, Password: &password, Roles: []string{item.role}, Activo: true,
		})
		if err != nil {
			t.Fatal(err)
		}
		users[item.key] = user
	}
	if _, err := db.Exec(`
		INSERT INTO pisos (id, nombre, activo) VALUES (100, 'Pruebas HTTP', 1);
		INSERT INTO mesas (id, piso_id, numero, asientos, activa) VALUES (101, 100, 1, 4, 1);
		INSERT INTO categorias_pos (id, nombre, estacion) VALUES (102, 'Pruebas HTTP', 'cocina');
		INSERT INTO productos (id, nombre, precio_centavos, categoria_id, tipo_consumo, disponible_en_pos, activo, rastrear_inventario)
		VALUES (103, 'Producto de prueba', 1500, 102, 'almacenable_unitario', 1, 1, 1);
		INSERT INTO stock (producto_id, on_hand_real, reserved_real) VALUES (103, 10, 0);`); err != nil {
		t.Fatal(err)
	}
	tokens := map[string]string{}
	for key, user := range users {
		password := "secreto-" + key
		token, _, err := auth.Open(context.Background(), db, *user.Usuario, password)
		if err != nil {
			t.Fatal(err)
		}
		tokens[key] = token
	}
	return cancellationFixture{db: db, handler: NewHandler(db, t.TempDir(), config.Defaults()), users: users, tokens: tokens}
}

func (fixture cancellationFixture) order(t *testing.T, key string) orders.Result {
	t.Helper()
	result, err := orders.Send(context.Background(), fixture.db, orders.NewInput{
		TableID: 101, ServiceType: "mesa", Key: key, Lines: []orders.Line{{ProductID: 103, Quantity: 1}},
	}, fixture.users["mesero"].ID, orders.SendOptions{InventoryPolicy: "reserva_al_enviar_firme_al_enviar_caja"})
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func (fixture cancellationFixture) request(t *testing.T, user, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	payload, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(method, path, bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{Name: auth.CookieName, Value: fixture.tokens[user]})
	response := httptest.NewRecorder()
	fixture.handler.ServeHTTP(response, request)
	return response
}

func (fixture cancellationFixture) assertAccount(t *testing.T, accountID int64, expectedState string, expectedAudits int) {
	t.Helper()
	var state string
	if err := fixture.db.QueryRow("SELECT estado FROM cuentas WHERE id = ?", accountID).Scan(&state); err != nil {
		t.Fatal(err)
	}
	if state != expectedState {
		t.Fatalf("cuenta=%s; se esperaba %s", state, expectedState)
	}
	var audits int
	if err := fixture.db.QueryRow("SELECT count(*) FROM cancelaciones_cuentas WHERE cuenta_id = ?", accountID).Scan(&audits); err != nil {
		t.Fatal(err)
	}
	if audits != expectedAudits {
		t.Fatalf("auditorías=%d; se esperaba %d", audits, expectedAudits)
	}
}

func (fixture cancellationFixture) assertStock(t *testing.T, onHand, reserved float64) {
	t.Helper()
	var gotOnHand, gotReserved float64
	if err := fixture.db.QueryRow("SELECT on_hand_real, reserved_real FROM stock WHERE producto_id = 103").Scan(&gotOnHand, &gotReserved); err != nil {
		t.Fatal(err)
	}
	if gotOnHand != onHand || gotReserved != reserved {
		t.Fatalf("stock=(%v,%v); se esperaba (%v,%v)", gotOnHand, gotReserved, onHand, reserved)
	}
}
