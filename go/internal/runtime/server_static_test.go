package runtime

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/luizgnz/restaurante/go/internal/config"
)

func TestStaticHandlerServesProductPhotosAndFonts(t *testing.T) {
	dir := t.TempDir()
	for _, file := range []string{"index.html", "productos/menu-real/plato.jpg", "fonts/fuente.woff2"} {
		path := filepath.Join(dir, file)
		if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("contenido-"+file), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	handler := NewHandler(nil, dir, config.Defaults())
	for _, path := range []string{"/productos/menu-real/plato.jpg", "/fonts/fuente.woff2"} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != http.StatusOK {
			t.Fatalf("%s devolvió %d: %s", path, response.Code, response.Body.String())
		}
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/archivo-no-permitido.txt", nil))
	if response.Code != http.StatusNotFound {
		t.Fatalf("archivo fuera de rutas públicas devolvió %d", response.Code)
	}
}
