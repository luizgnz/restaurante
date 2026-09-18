package runtime

import (
	"errors"
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/luizgnz/restaurante/go/internal/auth"
	"github.com/luizgnz/restaurante/go/internal/config"
)

type pinAttempt struct {
	failures     int
	blockedUntil time.Time
}

// pinGuard es deliberadamente local y efímero: limita fuerza bruta desde un
// dispositivo sin crear una dependencia externa ni bloquear a todo el salón.
// Reiniciar el servidor limpia el contador, una concesión apropiada para el
// alcance de este POS en red local.
type pinGuard struct {
	mu       sync.Mutex
	attempts map[string]pinAttempt
	now      func() time.Time
}

func newPINGuard() *pinGuard {
	return &pinGuard{attempts: map[string]pinAttempt{}, now: time.Now}
}

func (guard *pinGuard) allow(key string) (time.Duration, bool) {
	guard.mu.Lock()
	defer guard.mu.Unlock()
	attempt := guard.attempts[key]
	remaining := attempt.blockedUntil.Sub(guard.now())
	if remaining > 0 {
		return remaining, false
	}
	if !attempt.blockedUntil.IsZero() {
		delete(guard.attempts, key)
	}
	return 0, true
}

func (guard *pinGuard) fail(key string, maximum int, blockFor time.Duration) (time.Duration, bool) {
	guard.mu.Lock()
	defer guard.mu.Unlock()
	attempt := guard.attempts[key]
	attempt.failures++
	if attempt.failures >= maximum {
		attempt.failures = 0
		attempt.blockedUntil = guard.now().Add(blockFor)
		guard.attempts[key] = attempt
		return blockFor, true
	}
	guard.attempts[key] = attempt
	return 0, false
}

func (guard *pinGuard) succeed(key string) {
	guard.mu.Lock()
	defer guard.mu.Unlock()
	delete(guard.attempts, key)
}

func pinClientKey(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && host != "" {
		return host
	}
	if r.RemoteAddr != "" {
		return r.RemoteAddr
	}
	return "local"
}

func requirePINAttempt(w http.ResponseWriter, r *http.Request, guard *pinGuard) bool {
	remaining, ok := guard.allow(pinClientKey(r))
	if ok {
		return true
	}
	seconds := int(remaining.Round(time.Second).Seconds())
	if seconds < 1 {
		seconds = 1
	}
	w.Header().Set("Retry-After", strconv.Itoa(seconds))
	writeError(w, http.StatusTooManyRequests, "pin_bloqueado", "Demasiados intentos. Espera un momento y vuelve a intentar")
	return false
}

func registerPINFailure(w http.ResponseWriter, r *http.Request, guard *pinGuard, maximum, blockSeconds int) bool {
	duration, blocked := guard.fail(pinClientKey(r), maximum, time.Duration(blockSeconds)*time.Second)
	if !blocked {
		return false
	}
	w.Header().Set("Retry-After", strconv.Itoa(int(duration.Seconds())))
	writeError(w, http.StatusTooManyRequests, "pin_bloqueado", "Demasiados intentos. Espera un momento y vuelve a intentar")
	return true
}

// finishPINAttempt adapta los flujos de Inventario, que validan el PIN dentro
// del dominio. Solo un PIN realmente incorrecto suma un fallo; un PIN válido
// con un rol insuficiente limpia el contador igual que cualquier acierto.
func finishPINAttempt(w http.ResponseWriter, r *http.Request, guard *pinGuard, settings config.App, err error) bool {
	if errors.Is(err, auth.ErrInvalidPIN) {
		return registerPINFailure(w, r, guard, settings.IntentosPINMaximos, settings.BloqueoPINSegundos)
	}
	if err == nil || errors.Is(err, auth.ErrForbidden) {
		guard.succeed(pinClientKey(r))
	}
	return false
}
