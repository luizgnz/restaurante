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
	"strings"
	"testing"
	"time"

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

func TestTurnStatusAndWaiterCanOpenFromClosedSalon(t *testing.T) {
	fixture := newCancellationFixture(t)
	if _, err := fixture.db.Exec(`UPDATE jornadas_operativas SET estado='cerrada', cerrada_en=? WHERE estado='abierta'`, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}
	assertTurnStatus := func(expected string) {
		t.Helper()
		response := fixture.request(t, "mesero", http.MethodGet, "/api/mesas", nil)
		if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"estado":"`+expected+`"`) {
			t.Fatalf("turno=%s: status=%d cuerpo=%s", expected, response.Code, response.Body.String())
		}
	}
	assertTurnStatus("cerrado")
	response := fixture.request(t, "mesero", http.MethodPost, "/api/jornadas/abrir", nil)
	if response.Code != http.StatusCreated {
		t.Fatalf("el mesero no pudo abrir turno: status=%d cuerpo=%s", response.Code, response.Body.String())
	}
	assertTurnStatus("abierto")
	if _, err := fixture.db.Exec(`UPDATE jornadas_operativas SET fecha_operativa=? WHERE estado='abierta'`, time.Now().AddDate(0, 0, -1).Format("2006-01-02")); err != nil {
		t.Fatal(err)
	}
	assertTurnStatus("anterior")
}

func TestCloseTurnWithOpenTableDoesNotCloseAccount(t *testing.T) {
	fixture := newCancellationFixture(t)
	account := fixture.order(t, "cierre-con-mesa")
	response := fixture.request(t, "admin", http.MethodPost, "/api/jornadas/cerrar", nil)
	if response.Code != http.StatusConflict || !strings.Contains(response.Body.String(), "Hay mesas abiertas. Cierra todas las cuentas antes de cerrar el turno") {
		t.Fatalf("cierre debía bloquearse sin señalar mesas: status=%d cuerpo=%s", response.Code, response.Body.String())
	}
	fixture.assertAccount(t, account.AccountID, "abierta", 0)
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

func TestPINLimitAppliesAcrossRequestsFromSameDevice(t *testing.T) {
	fixture := newCancellationFixture(t)
	account := fixture.order(t, "pin-limit")
	path := fmt.Sprintf("/api/cuentas/%d/cancelar", account.AccountID)

	for attempt := 1; attempt <= 5; attempt++ {
		response := fixture.request(t, "admin", http.MethodPost, path, map[string]any{"pin": "0000", "motivo": "Prueba de límite"})
		expected := http.StatusBadRequest
		if attempt == 5 {
			expected = http.StatusTooManyRequests
		}
		if response.Code != expected {
			t.Fatalf("intento %d: status=%d cuerpo=%s; se esperaba %d", attempt, response.Code, response.Body.String(), expected)
		}
	}
	response := fixture.request(t, "admin", http.MethodPost, path, map[string]any{"pin": "9001", "motivo": "PIN correcto durante pausa"})
	if response.Code != http.StatusTooManyRequests || response.Header().Get("Retry-After") == "" {
		t.Fatalf("la pausa no protegió el siguiente intento: status=%d retry=%q cuerpo=%s", response.Code, response.Header().Get("Retry-After"), response.Body.String())
	}
	fixture.assertAccount(t, account.AccountID, "abierta", 0)
}

func TestExpiredSessionIsRejectedByHTTPServer(t *testing.T) {
	fixture := newCancellationFixture(t)
	old := time.Now().UTC().Add(-17 * time.Hour).Format("2006-01-02T15:04:05.000Z")
	if _, err := fixture.db.Exec("UPDATE sesiones_usuario SET abierta_en = ?", old); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/config", nil)
	request.AddCookie(&http.Cookie{Name: auth.CookieName, Value: fixture.tokens["admin"]})
	response := httptest.NewRecorder()
	fixture.handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("sesión vencida: status=%d cuerpo=%s", response.Code, response.Body.String())
	}
	if cookie := response.Header().Get("Set-Cookie"); !strings.Contains(cookie, "Max-Age=0") {
		t.Fatalf("no eliminó la cookie vencida: %q", cookie)
	}
}

func TestJourneyHTTPAllowsShiftLeadAndClosesEmptyAccountsInBulk(t *testing.T) {
	fixture := newCancellationFixture(t)
	var journeyID int64
	if err := fixture.db.QueryRow("SELECT id FROM jornadas_operativas WHERE estado='abierta'").Scan(&journeyID); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.db.Exec(`INSERT INTO cuentas
		(id,mesa_id,estado,abierta_por_empleado_id,abierta_en,jornada_id,tipo_servicio)
		VALUES (10050,10001,'abierta',?,datetime('now'),?,'mesa')`, fixture.users["mesero"].ID, journeyID); err != nil {
		t.Fatal(err)
	}

	response := fixture.request(t, "encargado", http.MethodGet, "/api/jornadas/actual", nil)
	if response.Code != http.StatusOK {
		t.Fatalf("encargado no pudo consultar la jornada: status=%d cuerpo=%s", response.Code, response.Body.String())
	}
	response = fixture.request(t, "admin", http.MethodPost, "/api/jornadas/cerrar-masivo", map[string]any{
		"usuario": "encargado-cancel", "password": "incorrecta",
	})
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("credenciales incorrectas: status=%d cuerpo=%s", response.Code, response.Body.String())
	}
	response = fixture.request(t, "admin", http.MethodPost, "/api/jornadas/cerrar-masivo", map[string]any{
		"usuario": "encargado-cancel", "password": "secreto-encargado",
	})
	if response.Code != http.StatusOK {
		t.Fatalf("cierre masivo: status=%d cuerpo=%s", response.Code, response.Body.String())
	}
	fixture.assertAccount(t, 10050, "cancelada", 1)
}

func TestReportDownloadsEnforceRolesAndReturnPDF(t *testing.T) {
	fixture := newCancellationFixture(t)
	date := time.Now().Format("2006-01-02")
	query := "?desde=" + date + "&hasta=" + date

	response := fixture.request(t, "encargado", http.MethodGet, "/api/reportes/ventas.pdf"+query, nil)
	if response.Code != http.StatusOK || response.Header().Get("Content-Type") != "application/pdf" || !bytes.HasPrefix(response.Body.Bytes(), []byte("%PDF-")) {
		t.Fatalf("reporte de ventas inválido: status=%d tipo=%q cuerpo=%q", response.Code, response.Header().Get("Content-Type"), response.Body.String())
	}
	response = fixture.request(t, "admin", http.MethodGet, "/api/reportes/inventario.pdf"+query, nil)
	if response.Code != http.StatusOK || !bytes.HasPrefix(response.Body.Bytes(), []byte("%PDF-")) {
		t.Fatalf("reporte de inventario inválido: status=%d cuerpo=%q", response.Code, response.Body.String())
	}
	response = fixture.request(t, "cocina", http.MethodGet, "/api/reportes/ventas.pdf"+query, nil)
	if response.Code != http.StatusForbidden {
		t.Fatalf("Cocina no debía acceder al reporte: status=%d", response.Code)
	}
	response = fixture.request(t, "admin", http.MethodGet, "/api/reportes/ventas.pdf?desde=mal&hasta=2026-09-12", nil)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("período inválido debía devolver 400: status=%d", response.Code)
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
		INSERT INTO pisos (id, nombre, activo) VALUES (10000, 'Pruebas HTTP', 1);
		INSERT INTO mesas (id, piso_id, numero, asientos, activa) VALUES (10001, 10000, 1, 4, 1);
		INSERT INTO categorias_pos (id, nombre, estacion) VALUES (10002, 'Pruebas HTTP', 'cocina');
		INSERT INTO productos (id, nombre, precio_centavos, categoria_id, tipo_consumo, disponible_en_pos, activo, rastrear_inventario)
		VALUES (10003, 'Producto de prueba', 1500, 10002, 'almacenable_unitario', 1, 1, 1);
		INSERT INTO stock (producto_id, on_hand_real, reserved_real) VALUES (10003, 10, 0);`); err != nil {
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
		TableID: 10001, ServiceType: "mesa", Key: key, Lines: []orders.Line{{ProductID: 10003, Quantity: 1}},
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
	if err := fixture.db.QueryRow("SELECT on_hand_real, reserved_real FROM stock WHERE producto_id = 10003").Scan(&gotOnHand, &gotReserved); err != nil {
		t.Fatal(err)
	}
	if gotOnHand != onHand || gotReserved != reserved {
		t.Fatalf("stock=(%v,%v); se esperaba (%v,%v)", gotOnHand, gotReserved, onHand, reserved)
	}
}
