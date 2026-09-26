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

func TestEmpaqueParaLlevarHabilitadoPorDefecto(t *testing.T) {
	if !Defaults().SugerirEmpaqueParaLlevar {
		t.Fatal("la sugerencia de empaque debe quedar habilitada por defecto")
	}
}

func TestEnsureFileCreatesDefaultsWithoutOverwritingExistingConfig(t *testing.T) {
	dir := t.TempDir()
	if err := EnsureFile(dir, Defaults()); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "config.json")
	if _, err := os.Stat(path); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(`{"nombre_local":"Personalizado"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := EnsureFile(dir, Defaults()); err != nil {
		t.Fatal(err)
	}
	bytes, err := os.ReadFile(path)
	if err != nil || string(bytes) != `{"nombre_local":"Personalizado"}` {
		t.Fatalf("configuración existente alterada: %q, %v", bytes, err)
	}
}
