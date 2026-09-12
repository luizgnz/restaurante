package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadUsesDefaultsAndNormalizesInvalidValues(t *testing.T) {
	dir := t.TempDir()
	loaded, err := Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	if loaded != Defaults() {
		t.Fatalf("defaults inesperados: %#v", loaded)
	}
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte(`{"politica_inventario":"invalida","bloqueo_sin_stock":"bloquear","nombre_local":"La Olla"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	loaded, err = Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.PoliticaInventario != Defaults().PoliticaInventario || loaded.BloqueoSinStock != "bloquear" || loaded.NombreLocal != "La Olla" {
		t.Fatalf("configuración inesperada: %#v", loaded)
	}
}
