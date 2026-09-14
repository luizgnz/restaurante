package runtime

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"

	"github.com/luizgnz/restaurante/go/internal/config"
)

func TestConfigLogoAceptaFormatosRasterOptimizados(t *testing.T) {
	for _, mime := range []string{"png", "jpeg", "webp"} {
		valor := "data:image/" + mime + ";base64," + base64.StdEncoding.EncodeToString([]byte("imagen"))
		raw, _ := json.Marshal(valor)
		actualizada, err := applyConfigPatch(config.Defaults(), map[string]json.RawMessage{"logo_data": raw})
		if err != nil {
			t.Fatalf("%s rechazado: %#v", mime, err)
		}
		if actualizada.LogoData == nil || *actualizada.LogoData != valor {
			t.Fatalf("%s no persistido", mime)
		}
	}
}

func TestConfigLogoRechazaSVGYPesoProcesadoExcesivo(t *testing.T) {
	svg, _ := json.Marshal("data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte("<svg/>")))
	if _, err := applyConfigPatch(config.Defaults(), map[string]json.RawMessage{"logo_data": svg}); err == nil || err.Code != "logo_formato_invalido" {
		t.Fatalf("SVG debería rechazarse: %#v", err)
	}

	grande, _ := json.Marshal("data:image/webp;base64," + base64.StdEncoding.EncodeToString([]byte(strings.Repeat("x", 1024*1024+1))))
	if _, err := applyConfigPatch(config.Defaults(), map[string]json.RawMessage{"logo_data": grande}); err == nil || err.Code != "logo_grande" {
		t.Fatalf("logo grande debería rechazarse: %#v", err)
	}
}

func TestConfigLogoPersisteTrasReiniciar(t *testing.T) {
	valor := "data:image/webp;base64," + base64.StdEncoding.EncodeToString([]byte("logo-optimizado"))
	raw, _ := json.Marshal(valor)
	actualizada, err := applyConfigPatch(config.Defaults(), map[string]json.RawMessage{"logo_data": raw})
	if err != nil {
		t.Fatal(err)
	}
	directorio := t.TempDir()
	if err := config.Save(directorio, actualizada); err != nil {
		t.Fatal(err)
	}
	recargada, loadErr := config.Load(directorio)
	if loadErr != nil {
		t.Fatal(loadErr)
	}
	if recargada.LogoData == nil || *recargada.LogoData != valor {
		t.Fatalf("logo perdido tras recargar configuración: %#v", recargada.LogoData)
	}
}

func TestConfigEmpaqueParaLlevarAceptaDesactivacion(t *testing.T) {
	actualizada, err := applyConfigPatch(config.Defaults(), map[string]json.RawMessage{
		"sugerir_empaque_para_llevar": json.RawMessage("false"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if actualizada.SugerirEmpaqueParaLlevar {
		t.Fatal("la sugerencia de empaque no se desactivó")
	}
	publica := publicConfig(actualizada)
	if valor, ok := publica["sugerir_empaque_para_llevar"].(bool); !ok || valor {
		t.Fatalf("configuración pública inesperada: %#v", publica["sugerir_empaque_para_llevar"])
	}
}
