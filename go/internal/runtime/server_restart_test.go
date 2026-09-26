package runtime

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/luizgnz/restaurante/go/internal/config"
)

func TestHealthChangesBootIDWithNewServer(t *testing.T) {
	fixture := newCancellationFixture(t)
	readID := func() string {
		handler := NewHandler(fixture.db, t.TempDir(), config.Defaults())
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/salud", nil))
		if response.Code != http.StatusOK {
			t.Fatalf("salud: status=%d", response.Code)
		}
		var body struct {
			ID string `json:"idArranque"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || body.ID == "" {
			t.Fatalf("identificador de arranque inválido: %q, %v", body.ID, err)
		}
		return body.ID
	}
	if first, second := readID(), readID(); first == second {
		t.Fatal("dos instancias compartieron identificador de arranque")
	}
}

func TestRestartRequiresAdministrator(t *testing.T) {
	fixture := newCancellationFixture(t)
	calls := 0
	fixture.handler = NewHandlerWithRestart(fixture.db, t.TempDir(), config.Defaults(), t.TempDir(), func() error {
		calls++
		return nil
	})
	if got := fixture.request(t, "mesero", http.MethodPost, "/api/red/reiniciar", nil).Code; got != http.StatusForbidden {
		t.Fatalf("mesero: status=%d; se esperaba 403", got)
	}
	if calls != 0 {
		t.Fatal("un usuario sin permiso solicitó el reinicio")
	}
	if got := fixture.request(t, "admin", http.MethodPost, "/api/red/reiniciar", nil).Code; got != http.StatusAccepted {
		t.Fatalf("administrador: status=%d; se esperaba 202", got)
	}
	if calls != 1 {
		t.Fatalf("reinicios solicitados=%d; se esperaba 1", calls)
	}
}
