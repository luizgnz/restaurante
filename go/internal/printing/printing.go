package printing

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"sort"
	"strings"
	"time"

	"github.com/luizgnz/restaurante/go/internal/config"
)

const timeout = 3 * time.Second

type Job struct {
	ID          int64   `json:"id"`
	Tipo        string  `json:"tipo"`
	Estado      string  `json:"estado"`
	Intentos    int     `json:"intentos"`
	UltimoError *string `json:"ultimoError"`
	CreadoEn    string  `json:"creadoEn"`
}

type Diagnostic struct {
	Conectado  bool   `json:"conectado"`
	LatenciaMS *int64 `json:"latenciaMs"`
	Mensaje    string `json:"mensaje"`
}

type DomainError struct{ Code, Message string }

func (e *DomainError) Error() string { return e.Message }

func Send(ctx context.Context, printer config.Printer, data []byte) (int64, error) {
	if strings.TrimSpace(printer.Host) == "" {
		return 0, errors.New("Indica la dirección IP o nombre de la impresora")
	}
	if printer.Port < 1 || printer.Port > 65535 {
		return 0, errors.New("El puerto de la impresora no es válido")
	}
	started := time.Now()
	dialer := net.Dialer{Timeout: timeout}
	connection, err := dialer.DialContext(ctx, "tcp", net.JoinHostPort(strings.TrimSpace(printer.Host), fmt.Sprint(printer.Port)))
	if err != nil {
		return 0, fmt.Errorf("No se pudo conectar: %w", err)
	}
	defer connection.Close()
	_ = connection.SetWriteDeadline(time.Now().Add(timeout))
	if len(data) > 0 {
		if _, err := connection.Write(data); err != nil {
			return 0, fmt.Errorf("No se pudo enviar la impresión: %w", err)
		}
	}
	return time.Since(started).Milliseconds(), nil
}

func Diagnose(ctx context.Context, printer config.Printer) Diagnostic {
	latency, err := Send(ctx, printer, nil)
	if err != nil {
		return Diagnostic{Mensaje: err.Error()}
	}
	return Diagnostic{Conectado: true, LatenciaMS: &latency, Mensaje: fmt.Sprintf("Conexión confirmada en %d ms", latency)}
}

func TestPage(ctx context.Context, kind string, appConfig config.App) (int64, error) {
	var printer config.Printer
	var template config.Template
	var body string
	switch kind {
	case "comanda":
		printer, template = appConfig.ImpresoraComanda, appConfig.PlantillaComanda
		body = "COMANDA\nMesa 4 · Orden 18\nMesero: Usuario de prueba\n2 x Producto de prueba\n   Sin cebolla"
	case "boleta":
		printer, template = appConfig.ImpresoraBoleta, appConfig.PlantillaBoleta
		body = "COMPROBANTE\nMesa 4\n1 x Producto de prueba  5000\nTOTAL 5000\nDocumento de prueba, no tributario"
	default:
		return 0, &DomainError{"tipo_impresion_invalido", "Selecciona comanda o boleta"}
	}
	if !printer.Enabled {
		return 0, &DomainError{"impresora_deshabilitada", "Activa y guarda la impresora antes de probarla"}
	}
	return Send(ctx, printer, applyTemplate(body, template))
}

func ListJobs(ctx context.Context, db *sql.DB) ([]Job, error) {
	rows, err := db.QueryContext(ctx, `SELECT id, kind, status, attempts, last_error, created_en FROM print_jobs ORDER BY id DESC LIMIT 50`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	jobs := []Job{}
	for rows.Next() {
		var job Job
		var last sql.NullString
		if err := rows.Scan(&job.ID, &job.Tipo, &job.Estado, &job.Intentos, &last, &job.CreadoEn); err != nil {
			return nil, err
		}
		if last.Valid {
			job.UltimoError = &last.String
		}
		jobs = append(jobs, job)
	}
	return jobs, rows.Err()
}

func Retry(ctx context.Context, db *sql.DB, id int64, appConfig config.App) (Job, error) {
	result, err := db.ExecContext(ctx, "UPDATE print_jobs SET status = 'queued', last_error = NULL WHERE id = ?", id)
	if err != nil {
		return Job{}, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return Job{}, err
	}
	if rows == 0 {
		return Job{}, &DomainError{"impresion_inexistente", "El trabajo de impresión no existe"}
	}
	if err := Dispatch(ctx, db, appConfig); err != nil {
		return Job{}, err
	}
	var job Job
	var last sql.NullString
	err = db.QueryRowContext(ctx, `SELECT id, kind, status, attempts, last_error, created_en FROM print_jobs WHERE id = ?`, id).
		Scan(&job.ID, &job.Tipo, &job.Estado, &job.Intentos, &last, &job.CreadoEn)
	if last.Valid {
		job.UltimoError = &last.String
	}
	return job, err
}

func Dispatch(ctx context.Context, db *sql.DB, appConfig config.App) error {
	rows, err := db.QueryContext(ctx, "SELECT id, kind, payload FROM print_jobs WHERE status IN ('queued', 'failed') ORDER BY id")
	if err != nil {
		return err
	}
	type pending struct {
		id            int64
		kind, payload string
	}
	jobs := []pending{}
	for rows.Next() {
		var job pending
		if err := rows.Scan(&job.id, &job.kind, &job.payload); err != nil {
			rows.Close()
			return err
		}
		jobs = append(jobs, job)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	for _, job := range jobs {
		printer := appConfig.ImpresoraComanda
		template := appConfig.PlantillaComanda
		if job.kind == "precuenta" {
			printer = appConfig.ImpresoraBoleta
			template = appConfig.PlantillaBoleta
		}
		var sendErr error
		if printer.Enabled {
			_, sendErr = Send(ctx, printer, applyTemplate(render(job.kind, job.payload), template))
		}
		if sendErr == nil {
			_, err = db.ExecContext(ctx, "UPDATE print_jobs SET status = 'sent', attempts = attempts + 1, last_error = NULL WHERE id = ?", job.id)
		} else {
			_, err = db.ExecContext(ctx, "UPDATE print_jobs SET status = 'queued', attempts = attempts + 1, last_error = ? WHERE id = ?", sendErr.Error(), job.id)
		}
		if err != nil {
			return err
		}
	}
	return nil
}

func applyTemplate(body string, template config.Template) []byte {
	lines := strings.Split(strings.TrimSpace(body), "\n")
	if strings.TrimSpace(template.Title) != "" && len(lines) > 0 {
		lines[0] = strings.TrimSpace(template.Title)
	}
	parts := []string{}
	if value := strings.TrimSpace(template.Header); value != "" {
		parts = append(parts, value)
	}
	parts = append(parts, lines...)
	if value := strings.TrimSpace(template.Footer); value != "" {
		parts = append(parts, value)
	}
	return []byte("\x1b@" + strings.Join(parts, "\n") + "\n")
}

func render(kind, payload string) string {
	var data map[string]any
	if json.Unmarshal([]byte(payload), &data) != nil {
		return strings.ToUpper(kind) + "\n" + payload
	}
	reprint := boolValue(data["reimpresion"])
	if snapshot, ok := data["snapshot"].(map[string]any); ok {
		data = snapshot
	}
	title := strings.ToUpper(kind)
	if kind == "precuenta" {
		title = "PRECUENTA"
	}
	if reprint {
		title += " (reimpresión)"
	}
	lines := []string{title}
	if table, ok := numberValue(data["mesaNumero"]); ok {
		lines = append(lines, fmt.Sprintf("Mesa %.0f", table))
	} else if service, _ := data["tipoServicio"].(string); service == "para_llevar" {
		lines = append(lines, "PARA LLEVAR")
	}
	if order, ok := numberValue(data["ordenNumero"]); ok {
		lines = append(lines, fmt.Sprintf("Orden %.0f", order))
	}
	if waiter, ok := data["mesero"].(string); ok && waiter != "" {
		lines = append(lines, "Mesero: "+waiter)
	}
	if instructions, ok := data["indicaciones"].(string); ok && strings.TrimSpace(instructions) != "" {
		lines = append(lines, "Indicaciones: "+strings.TrimSpace(instructions))
	}
	if rawLines, ok := data["lineas"].([]any); ok {
		for _, raw := range rawLines {
			if line, ok := raw.(map[string]any); ok {
				lines = append(lines, renderLine(kind, line))
			}
		}
	}
	if total, ok := numberValue(data["totalCentavos"]); ok {
		lines = append(lines, fmt.Sprintf("TOTAL %.0f", total))
	}
	return strings.Join(lines, "\n")
}

func renderLine(kind string, line map[string]any) string {
	name, _ := line["nombre"].(string)
	quantity, _ := numberValue(line["cantidad"])
	if kind == "correccion" {
		if after, ok := numberValue(line["cantidadNueva"]); ok && after == 0 {
			return fmt.Sprintf("ANULADO: %.0f %s", quantityOr(line["cantidadAnterior"], quantity), name)
		}
		if delta, ok := numberValue(line["delta"]); ok {
			if delta > 0 {
				return fmt.Sprintf("+ %.0f %s", delta, name)
			}
			if delta < 0 {
				return fmt.Sprintf("- %.0f %s", -delta, name)
			}
		}
	}
	result := fmt.Sprintf("%.0f x %s", quantity, name)
	if note, ok := line["nota"].(string); ok && strings.TrimSpace(note) != "" {
		result += " (" + strings.TrimSpace(note) + ")"
	}
	if price, ok := numberValue(line["precio_centavos"]); ok {
		result += fmt.Sprintf("  %.0f", price)
	}
	if contours, ok := line["contornos"].([]any); ok {
		for _, contour := range contours {
			result += "\n   " + fmt.Sprint(contour)
		}
	}
	return result
}

func numberValue(value any) (float64, bool) { number, ok := value.(float64); return number, ok }
func quantityOr(value any, fallback float64) float64 {
	if number, ok := numberValue(value); ok {
		return number
	}
	return fallback
}
func boolValue(value any) bool { result, _ := value.(bool); return result }

func NetworkURLs(port int, enabled bool, addresses []string) []string {
	if !enabled {
		return []string{}
	}
	sort.Strings(addresses)
	result := []string{}
	seen := map[string]bool{}
	for _, address := range addresses {
		if address == "" || seen[address] {
			continue
		}
		seen[address] = true
		result = append(result, fmt.Sprintf("http://%s:%d", address, port))
	}
	return result
}
