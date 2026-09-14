package runtime

import (
	"testing"
	"time"
)

func TestPINGuardPausesAfterConfiguredFailures(t *testing.T) {
	now := time.Date(2026, 9, 12, 14, 0, 0, 0, time.UTC)
	guard := newPINGuard()
	guard.now = func() time.Time { return now }

	for attempt := 1; attempt < 5; attempt++ {
		if _, blocked := guard.fail("terminal-caja", 5, time.Minute); blocked {
			t.Fatalf("bloqueó antes del quinto fallo: intento %d", attempt)
		}
	}
	if remaining, blocked := guard.fail("terminal-caja", 5, time.Minute); !blocked || remaining != time.Minute {
		t.Fatalf("quinto fallo = (%v, %v), se esperaba pausa de un minuto", remaining, blocked)
	}
	if _, allowed := guard.allow("terminal-caja"); allowed {
		t.Fatal("permitió probar durante la pausa")
	}
	if _, allowed := guard.allow("tablet-cocina"); !allowed {
		t.Fatal("la pausa de un equipo afectó a otro")
	}

	now = now.Add(time.Minute)
	if _, allowed := guard.allow("terminal-caja"); !allowed {
		t.Fatal("la pausa no terminó automáticamente")
	}
}

func TestPINGuardSuccessClearsFailures(t *testing.T) {
	guard := newPINGuard()
	for range 4 {
		guard.fail("telefono-mesero", 5, time.Minute)
	}
	guard.succeed("telefono-mesero")
	if _, blocked := guard.fail("telefono-mesero", 5, time.Minute); blocked {
		t.Fatal("un PIN correcto no limpió los fallos anteriores")
	}
}
