package runtime

import (
	"net/http"
	"testing"

	"github.com/luizgnz/restaurante/go/internal/config"
)

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
