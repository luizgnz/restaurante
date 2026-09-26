package runtime

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/luizgnz/restaurante/go/internal/config"
)

func TestServesAllBuiltUIAssets(t *testing.T) {
	uiDir := t.TempDir()
	files := map[string]string{
		"index.html":                    "<html>turno</html>",
		"assets/app.js":                 "console.log('turno')",
		"marcas/olla-horizontal.svg":    "<svg>olla</svg>",
		"fonts/fraunces-variable.ttf":   "font",
		"favicon.svg":                   "<svg>favicon</svg>",
		"productos/menu-real/plato.jpg": "foto",
		"secret.txt":                    "no debe exponerse",
	}
	for name, body := range files {
		path := filepath.Join(uiDir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	handler := NewHandler(nil, uiDir, config.Defaults())

	for route, expected := range map[string]string{
		"/":                              "<html>turno</html>",
		"/assets/app.js":                 "console.log('turno')",
		"/marcas/olla-horizontal.svg":    "<svg>olla</svg>",
		"/fonts/fraunces-variable.ttf":   "font",
		"/favicon.svg":                   "<svg>favicon</svg>",
		"/productos/menu-real/plato.jpg": "foto",
	} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, route, nil))
		if response.Code != http.StatusOK || response.Body.String() != expected {
			t.Errorf("GET %s: status=%d body=%q", route, response.Code, response.Body.String())
		}
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/secret.txt", nil))
	if response.Code != http.StatusNotFound {
		t.Errorf("GET /secret.txt: status=%d, se esperaba 404", response.Code)
	}
}

func TestDisabledNetworkRejectsIPButAllowsLocalhost(t *testing.T) {
	uiDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(uiDir, "index.html"), []byte("<html>local</html>"), 0o600); err != nil {
		t.Fatal(err)
	}
	settings := config.Defaults()
	settings.ServidorRedHabilitado = false
	handler := NewHandler(nil, uiDir, settings)

	remote := httptest.NewRequest(http.MethodGet, "/", nil)
	remote.RemoteAddr = "192.168.1.91:50321"
	blocked := httptest.NewRecorder()
	handler.ServeHTTP(blocked, remote)
	if blocked.Code != http.StatusForbidden {
		t.Fatalf("acceso por IP: status=%d; se esperaba 403", blocked.Code)
	}

	local := httptest.NewRequest(http.MethodGet, "/", nil)
	local.RemoteAddr = "127.0.0.1:50321"
	allowed := httptest.NewRecorder()
	handler.ServeHTTP(allowed, local)
	if allowed.Code != http.StatusOK {
		t.Fatalf("acceso por localhost: status=%d; se esperaba 200", allowed.Code)
	}
}
