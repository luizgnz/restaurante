package config

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

type App struct {
	Puerto                        int      `json:"puerto"`
	ExtraNube                     bool     `json:"extra_nube"`
	AccesoDirecto                 bool     `json:"acceso_directo"`
	URLUpdates                    string   `json:"url_updates"`
	PoliticaInventario            string   `json:"politica_inventario"`
	BloqueoSinStock               string   `json:"bloqueo_sin_stock"`
	NombreLocal                   string   `json:"nombre_local"`
	LogoData                      *string  `json:"logo_data"`
	Tipografia                    string   `json:"tipografia"`
	TamanoUI                      string   `json:"tamano_ui"`
	PINHabilitado                 bool     `json:"pin_habilitado"`
	ConfirmarComanda              bool     `json:"confirmar_comanda"`
	PINAlAnular                   bool     `json:"pin_al_anular"`
	AuditoriaAnulaciones          bool     `json:"auditoria_anulaciones"`
	JustificacionAnulacion        bool     `json:"justificacion_anulacion"`
	EntregaAutomaticaSiNoConfirma bool     `json:"entrega_automatica_si_no_confirma"`
	EntregaAutomaticaMinutos      int      `json:"entrega_automatica_minutos"`
	PrioridadParaLlevar           string   `json:"prioridad_para_llevar"`
	DevolverInsumosPreparados     bool     `json:"devolver_insumos_preparados"`
	PINAlEmitirPrecuenta          bool     `json:"pin_al_emitir_precuenta"`
	PINAlEnviarCaja               bool     `json:"pin_al_enviar_caja"`
	EnviarCajaRequiereAvanzado    bool     `json:"enviar_a_caja_requiere_avanzado"`
	PrecuentaObligatoriaAntesCaja bool     `json:"precuenta_obligatoria_antes_de_caja"`
	TabletCocina                  bool     `json:"tablet_cocina"`
	LiberarMesaCuando             string   `json:"liberar_mesa_cuando"`
	BloqueoInactividadSeg         int      `json:"bloqueo_inactividad_seg"`
	ImpresoraComanda              Printer  `json:"impresora_comanda"`
	ImpresoraBoleta               Printer  `json:"impresora_boleta"`
	PlantillaComanda              Template `json:"plantilla_comanda"`
	PlantillaBoleta               Template `json:"plantilla_boleta"`
	ServidorRedHabilitado         bool     `json:"servidor_red_habilitado"`
	NombreServidor                string   `json:"nombre_servidor"`
}

type Printer struct {
	Enabled bool   `json:"habilitada"`
	Name    string `json:"nombre"`
	Host    string `json:"host"`
	Port    int    `json:"puerto"`
	WidthMM int    `json:"ancho_mm"`
}

type Template struct {
	Title  string `json:"titulo"`
	Header string `json:"encabezado"`
	Footer string `json:"pie"`
}

func Defaults() App {
	return App{
		Puerto:                        8080,
		PoliticaInventario:            "reserva_al_enviar_firme_al_enviar_caja",
		BloqueoSinStock:               "avisar",
		NombreLocal:                   "Restaurante",
		Tipografia:                    "sans",
		TamanoUI:                      "normal",
		PINHabilitado:                 true,
		PINAlAnular:                   true,
		AuditoriaAnulaciones:          true,
		JustificacionAnulacion:        true,
		EntregaAutomaticaSiNoConfirma: true,
		EntregaAutomaticaMinutos:      30,
		PrioridadParaLlevar:           "igual",
		DevolverInsumosPreparados:     true,
		PINAlEmitirPrecuenta:          true,
		PINAlEnviarCaja:               true,
		EnviarCajaRequiereAvanzado:    false,
		PrecuentaObligatoriaAntesCaja: true,
		LiberarMesaCuando:             "al_enviar_a_caja",
		BloqueoInactividadSeg:         60,
		ImpresoraComanda:              Printer{Name: "Cocina", Port: 9100, WidthMM: 80},
		ImpresoraBoleta:               Printer{Name: "Caja", Port: 9100, WidthMM: 80},
		PlantillaComanda:              Template{Title: "COMANDA"},
		PlantillaBoleta:               Template{Title: "COMPROBANTE", Footer: "Gracias por su visita"},
		ServidorRedHabilitado:         true,
		NombreServidor:                "Restaurante",
	}
}

func Load(dataDir string) (App, error) {
	config := Defaults()
	bytes, err := os.ReadFile(filepath.Join(dataDir, "config.json"))
	if errors.Is(err, os.ErrNotExist) {
		return config, nil
	}
	if err != nil {
		return App{}, err
	}
	if err := json.Unmarshal(bytes, &config); err != nil {
		return App{}, err
	}
	if config.PoliticaInventario != "descuento_al_enviar" && config.PoliticaInventario != "reserva_al_enviar_firme_al_precuenta" && config.PoliticaInventario != "reserva_al_enviar_firme_al_enviar_caja" {
		config.PoliticaInventario = Defaults().PoliticaInventario
	}
	if config.BloqueoSinStock != "permitir" && config.BloqueoSinStock != "avisar" && config.BloqueoSinStock != "bloquear" {
		config.BloqueoSinStock = Defaults().BloqueoSinStock
	}
	if config.EntregaAutomaticaMinutos < 1 || config.EntregaAutomaticaMinutos > 240 {
		config.EntregaAutomaticaMinutos = Defaults().EntregaAutomaticaMinutos
	}
	if config.PrioridadParaLlevar != "prioritaria" {
		config.PrioridadParaLlevar = "igual"
	}
	if config.Tipografia != "serif" && config.Tipografia != "redondeada" {
		config.Tipografia = "sans"
	}
	if config.TamanoUI != "compacto" && config.TamanoUI != "grande" {
		config.TamanoUI = "normal"
	}
	if config.ImpresoraComanda.Port < 1 || config.ImpresoraComanda.Port > 65535 {
		config.ImpresoraComanda.Port = Defaults().ImpresoraComanda.Port
	}
	if config.ImpresoraComanda.WidthMM != 58 && config.ImpresoraComanda.WidthMM != 80 {
		config.ImpresoraComanda.WidthMM = 80
	}
	if config.ImpresoraBoleta.Port < 1 || config.ImpresoraBoleta.Port > 65535 {
		config.ImpresoraBoleta.Port = Defaults().ImpresoraBoleta.Port
	}
	if config.ImpresoraBoleta.WidthMM != 58 && config.ImpresoraBoleta.WidthMM != 80 {
		config.ImpresoraBoleta.WidthMM = 80
	}
	// La decisión de producto vigente siempre devuelve la receta completa.
	config.DevolverInsumosPreparados = true
	return config, nil
}

func Save(dataDir string, value App) error {
	if err := os.MkdirAll(dataDir, 0o750); err != nil {
		return err
	}
	bytes, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	bytes = append(bytes, '\n')
	return os.WriteFile(filepath.Join(dataDir, "config.json"), bytes, 0o600)
}
