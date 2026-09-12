package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/luizgnz/restaurante/go/internal/auth"
	"github.com/luizgnz/restaurante/go/internal/config"
)

const compatibleArgon2Hash = "$argon2id$v=19$m=65536,p=4,t=3$/7FsKEDwvV6V6vjLO+yHmQ$e0h9jyFrmVBQpkMmDXu/FMsbAc5MwV0hUXMzYX3byWk"

func TestOrderRouteAuthenticatesPINAndCreatesOrder(t *testing.T) {
	migrations, err := filepath.Abs(filepath.Join("..", "..", "..", "src", "db", "migrations"))
	if err != nil {
		t.Fatal(err)
	}
	db, err := OpenAndMigrate(context.Background(), filepath.Join(t.TempDir(), "route.sqlite"), migrations)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	_, err = db.Exec(`
		INSERT INTO empleados (id, nombre, pin_hash, derecho, activo, usuario, password_hash)
		VALUES (903, 'Ana', ?, 'basico', 1, 'ana-go', ?);
		INSERT INTO empleado_roles (empleado_id, rol_clave) VALUES (903, 'mesero');
		INSERT INTO pisos (id, nombre, activo) VALUES (905, 'Salón de ruta', 1);
		INSERT INTO mesas (id, piso_id, numero, asientos, activa) VALUES (907, 905, 7, 4, 1);
		INSERT INTO categorias_pos (id, nombre, estacion) VALUES (901, 'Ruta Go', 'cocina');
		INSERT INTO productos
			(id, nombre, precio_centavos, categoria_id, tipo_consumo, disponible_en_pos, activo, rastrear_inventario)
		VALUES (920, 'Agua ruta', 1500, 901, 'almacenable_unitario', 1, 1, 1);
		INSERT INTO stock (producto_id, on_hand_real, reserved_real) VALUES (920, 5, 0);`,
		compatibleArgon2Hash, compatibleArgon2Hash)
	if err != nil {
		t.Fatal(err)
	}

	token, _, err := auth.Open(context.Background(), db, "ana-go", "secreto")
	if err != nil {
		t.Fatal(err)
	}
	handler := NewHandler(db, t.TempDir(), config.Defaults())
	body := []byte(`{
		"mesaId":907,
		"tipoServicio":"mesa",
		"claveIdempotencia":"http-envio-1",
		"pin":"secreto",
		"lineas":[{"productoId":920,"cantidad":1}],
		"indicaciones":null
	}`)
	request := httptest.NewRequest(http.MethodPost, "/api/ordenes", bytes.NewReader(body))
	request.AddCookie(&http.Cookie{Name: auth.CookieName, Value: token})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("status=%d cuerpo=%s", response.Code, response.Body.String())
	}
	var payload struct {
		AccountID   int64 `json:"cuentaId"`
		OrderNumber int   `json:"ordenNumero"`
		CommandID   int64 `json:"comandaId"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.AccountID == 0 || payload.OrderNumber != 1 || payload.CommandID == 0 {
		t.Fatalf("respuesta inesperada: %#v", payload)
	}
}

func TestOrderRouteRejectsCookPINWithoutWriting(t *testing.T) {
	migrations, _ := filepath.Abs(filepath.Join("..", "..", "..", "src", "db", "migrations"))
	db, err := OpenAndMigrate(context.Background(), filepath.Join(t.TempDir(), "forbidden.sqlite"), migrations)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	_, err = db.Exec(`
		INSERT INTO empleados (id, nombre, pin_hash, derecho, activo, usuario, password_hash)
		VALUES (904, 'Cocina', ?, 'basico', 1, 'cocina-go', ?);
		INSERT INTO empleado_roles (empleado_id, rol_clave) VALUES (904, 'cocina');`,
		compatibleArgon2Hash, compatibleArgon2Hash)
	if err != nil {
		t.Fatal(err)
	}
	token, _, err := auth.Open(context.Background(), db, "cocina-go", "secreto")
	if err != nil {
		t.Fatal(err)
	}
	handler := NewHandler(db, t.TempDir(), config.Defaults())
	request := httptest.NewRequest(http.MethodPost, "/api/ordenes", bytes.NewBufferString(`{
		"mesaId":1,"claveIdempotencia":"prohibida","pin":"secreto",
		"lineas":[{"productoId":1,"cantidad":1}]
	}`))
	request.AddCookie(&http.Cookie{Name: auth.CookieName, Value: token})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("status=%d cuerpo=%s", response.Code, response.Body.String())
	}
	var count int
	if err := db.QueryRow("SELECT count(*) FROM ordenes WHERE clave_idempotencia = 'prohibida'").Scan(&count); err != nil || count != 0 {
		t.Fatalf("la orden prohibida se guardó: count=%d err=%v", count, err)
	}
}
