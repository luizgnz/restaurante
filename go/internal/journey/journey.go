package journey

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/luizgnz/restaurante/go/internal/accounts"
	"github.com/luizgnz/restaurante/go/internal/billing"
	"github.com/luizgnz/restaurante/go/internal/delivery"
)

type Journey struct {
	ID                 int64   `json:"id"`
	FechaOperativa     string  `json:"fechaOperativa"`
	Estado             string  `json:"estado"`
	AbiertaEn          string  `json:"abiertaEn"`
	AbiertaPor         *string `json:"abiertaPor"`
	CerradaEn          *string `json:"cerradaEn"`
	CerradaPor         *string `json:"cerradaPor"`
	RespaldoRuta       *string `json:"respaldoRuta"`
	TurnoPlantillaID   *int64  `json:"turnoPlantillaId"`
	TurnoNombre        string  `json:"turnoNombre"`
	CierreRegistradoEn *string `json:"cierreRegistradoEn"`
}

type Template struct {
	ID               int64   `json:"id"`
	Nombre           string  `json:"nombre"`
	HoraInicio       *string `json:"horaInicio"`
	HoraFin          *string `json:"horaFin"`
	EsPredeterminada bool    `json:"esPredeterminada"`
	Activa           bool    `json:"activa"`
}

type Summary struct {
	CuentasActivas              int `json:"cuentasActivas"`
	CuentasTotales              int `json:"cuentasTotales"`
	Ordenes                     int `json:"ordenes"`
	TareasCocinaPendientes      int `json:"tareasCocinaPendientes"`
	IncidenciasPendientes       int `json:"incidenciasPendientes"`
	OrdenesListas               int `json:"ordenesListas"`
	PedidosParaLlevarPendientes int `json:"pedidosParaLlevarPendientes"`
	CuentasVacias               int `json:"cuentasVacias"`
}

type State struct {
	Jornada       *Journey `json:"jornada"`
	Resumen       *Summary `json:"resumen"`
	UltimaCerrada *Journey `json:"ultimaCerrada"`
}

type CloseResult struct {
	Jornada      Journey                  `json:"jornada"`
	Resumen      Summary                  `json:"resumen"`
	RespaldoRuta string                   `json:"respaldoRuta"`
	CierreMasivo *billing.BulkCloseResult `json:"cierreMasivo,omitempty"`
}

type DomainError struct{ Code, Message string }

func (e *DomainError) Error() string { return e.Message }

const selectJourney = `SELECT j.id, j.fecha_operativa, j.estado, j.abierta_en, ea.nombre,
	j.cerrada_en, ec.nombre, j.respaldo_ruta, j.turno_plantilla_id,
	COALESCE(j.turno_nombre, 'Jornada general'), j.cierre_registrado_en FROM jornadas_operativas j
	LEFT JOIN empleados ea ON ea.id = j.abierta_por_empleado_id
	LEFT JOIN empleados ec ON ec.id = j.cerrada_por_empleado_id`

func Current(ctx context.Context, db *sql.DB) (State, error) {
	current, err := get(ctx, db, selectJourney+" WHERE j.estado = 'abierta' LIMIT 1")
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return State{}, err
	}
	last, lastErr := get(ctx, db, selectJourney+" WHERE j.estado = 'cerrada' ORDER BY j.id DESC LIMIT 1")
	if lastErr != nil && !errors.Is(lastErr, sql.ErrNoRows) {
		return State{}, lastErr
	}
	state := State{}
	if err == nil {
		state.Jornada = &current
		summary, err := GetSummary(ctx, db, current.ID)
		if err != nil {
			return State{}, err
		}
		state.Resumen = &summary
	}
	if lastErr == nil {
		state.UltimaCerrada = &last
	}
	return state, nil
}

func Open(ctx context.Context, db *sql.DB, employeeID *int64) (Journey, error) {
	var count int
	if err := db.QueryRowContext(ctx, "SELECT count(*) FROM jornadas_operativas WHERE estado = 'abierta'").Scan(&count); err != nil {
		return Journey{}, err
	}
	if count > 0 {
		return Journey{}, &DomainError{"jornada_ya_abierta", "Ya existe una jornada operativa abierta"}
	}
	now := time.Now()
	timestamp := now.UTC().Format(time.RFC3339Nano)
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Journey{}, err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `INSERT INTO jornadas_operativas
		(fecha_operativa, estado, abierta_en, abierta_por_empleado_id)
		VALUES (?, 'abierta', ?, ?)`, now.Format("2006-01-02"), timestamp, employeeID)
	if err != nil {
		return Journey{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return Journey{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO jornada_eventos (jornada_id, tipo, empleado_id, detalle_json, creado_en)
		VALUES (?, 'apertura', ?, ?, ?)`, id, employeeID, `{"origen":"administracion"}`, timestamp); err != nil {
		return Journey{}, err
	}
	if err := tx.Commit(); err != nil {
		return Journey{}, err
	}
	return get(ctx, db, selectJourney+" WHERE j.id = ?", id)
}

func OpenWithTemplate(ctx context.Context, db *sql.DB, employeeID *int64, templateID int64) (Journey, error) {
	var count int
	if err := db.QueryRowContext(ctx, "SELECT count(*) FROM jornadas_operativas WHERE estado = 'abierta'").Scan(&count); err != nil {
		return Journey{}, err
	}
	if count > 0 {
		return Journey{}, &DomainError{"jornada_ya_abierta", "Ya existe una jornada operativa abierta"}
	}
	now := time.Now()
	timestamp := now.UTC().Format(time.RFC3339Nano)
	localDate := now.Format("2006-01-02")
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Journey{}, err
	}
	defer tx.Rollback()
	var template Template
	if templateID == 0 {
		err = tx.QueryRowContext(ctx, `SELECT id, nombre, hora_inicio, hora_fin, es_predeterminada, activa
			FROM turno_plantillas WHERE activa = 1 ORDER BY es_predeterminada DESC, id LIMIT 1`).Scan(
			&template.ID, &template.Nombre, &template.HoraInicio, &template.HoraFin, &template.EsPredeterminada, &template.Activa)
	} else {
		err = tx.QueryRowContext(ctx, `SELECT id, nombre, hora_inicio, hora_fin, es_predeterminada, activa
			FROM turno_plantillas WHERE id = ? AND activa = 1`, templateID).Scan(
			&template.ID, &template.Nombre, &template.HoraInicio, &template.HoraFin, &template.EsPredeterminada, &template.Activa)
	}
	if errors.Is(err, sql.ErrNoRows) {
		return Journey{}, &DomainError{"turno_inexistente", "La plantilla de turno no existe o está desactivada"}
	}
	if err != nil {
		return Journey{}, err
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO jornadas_operativas
		(fecha_operativa, estado, abierta_en, abierta_por_empleado_id, turno_plantilla_id, turno_nombre)
		VALUES (?, 'abierta', ?, ?, ?, ?)`, localDate, timestamp, employeeID, template.ID, template.Nombre)
	if err != nil {
		return Journey{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return Journey{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO jornada_eventos (jornada_id, tipo, empleado_id, detalle_json, creado_en)
		VALUES (?, 'apertura', ?, ?, ?)`, id, employeeID, fmt.Sprintf(`{"origen":"administracion","turno":%q}`, template.Nombre), timestamp); err != nil {
		return Journey{}, err
	}
	if err := tx.Commit(); err != nil {
		return Journey{}, err
	}
	return get(ctx, db, selectJourney+" WHERE j.id = ?", id)
}

func ListTemplates(ctx context.Context, db *sql.DB, includeInactive bool) ([]Template, error) {
	query := `SELECT id, nombre, hora_inicio, hora_fin, es_predeterminada, activa FROM turno_plantillas`
	if !includeInactive {
		query += " WHERE activa = 1"
	}
	query += " ORDER BY es_predeterminada DESC, lower(nombre), id"
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Template{}
	for rows.Next() {
		var item Template
		if err := rows.Scan(&item.ID, &item.Nombre, &item.HoraInicio, &item.HoraFin, &item.EsPredeterminada, &item.Activa); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func SaveTemplate(ctx context.Context, db *sql.DB, item Template) (Template, error) {
	item.Nombre = strings.TrimSpace(item.Nombre)
	if item.Nombre == "" || len([]rune(item.Nombre)) > 40 {
		return Template{}, &DomainError{"turno_invalido", "El turno necesita un nombre de hasta 40 caracteres"}
	}
	if !validOptionalTime(item.HoraInicio) || !validOptionalTime(item.HoraFin) {
		return Template{}, &DomainError{"horario_invalido", "Los horarios deben usar el formato HH:MM"}
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Template{}, err
	}
	defer tx.Rollback()
	if item.EsPredeterminada {
		if _, err := tx.ExecContext(ctx, "UPDATE turno_plantillas SET es_predeterminada = 0"); err != nil {
			return Template{}, err
		}
	}
	if item.ID == 0 {
		result, err := tx.ExecContext(ctx, `INSERT INTO turno_plantillas
			(nombre, hora_inicio, hora_fin, es_predeterminada, activa, creada_en) VALUES (?, ?, ?, ?, 1, ?)`,
			item.Nombre, nullableString(item.HoraInicio), nullableString(item.HoraFin), boolInt(item.EsPredeterminada), time.Now().UTC().Format(time.RFC3339Nano))
		if err != nil {
			return Template{}, &DomainError{"turno_duplicado", "Ya existe un turno con ese nombre"}
		}
		item.ID, err = result.LastInsertId()
		if err != nil {
			return Template{}, err
		}
		item.Activa = true
	} else {
		result, err := tx.ExecContext(ctx, `UPDATE turno_plantillas SET nombre=?, hora_inicio=?, hora_fin=?, es_predeterminada=?, activa=? WHERE id=?`,
			item.Nombre, nullableString(item.HoraInicio), nullableString(item.HoraFin), boolInt(item.EsPredeterminada), boolInt(item.Activa), item.ID)
		if err != nil {
			return Template{}, &DomainError{"turno_duplicado", "Ya existe un turno con ese nombre"}
		}
		if count, _ := result.RowsAffected(); count != 1 {
			return Template{}, &DomainError{"turno_inexistente", "La plantilla de turno no existe"}
		}
	}
	var activeDefaults int
	if err := tx.QueryRowContext(ctx, "SELECT count(*) FROM turno_plantillas WHERE activa=1 AND es_predeterminada=1").Scan(&activeDefaults); err != nil {
		return Template{}, err
	}
	if activeDefaults == 0 {
		if _, err := tx.ExecContext(ctx, "UPDATE turno_plantillas SET es_predeterminada=1 WHERE id=(SELECT id FROM turno_plantillas WHERE activa=1 ORDER BY id LIMIT 1)"); err != nil {
			return Template{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return Template{}, err
	}
	items, err := ListTemplates(ctx, db, true)
	if err != nil {
		return Template{}, err
	}
	for _, candidate := range items {
		if candidate.ID == item.ID {
			return candidate, nil
		}
	}
	return Template{}, &DomainError{"turno_inexistente", "La plantilla de turno no existe"}
}

func Close(ctx context.Context, db *sql.DB, employeeID *int64, dataDir string) (CloseResult, error) {
	state, err := Current(ctx, db)
	if err != nil {
		return CloseResult{}, err
	}
	if state.Jornada == nil {
		return CloseResult{}, &DomainError{"jornada_cerrada", "No hay una jornada operativa abierta"}
	}
	summary := *state.Resumen
	if summary.CuentasActivas > 0 {
		return CloseResult{}, &DomainError{"jornada_con_cuentas", "Hay mesas abiertas. Cierra todas las cuentas antes de cerrar el turno"}
	}
	if summary.TareasCocinaPendientes > 0 {
		return CloseResult{}, &DomainError{"jornada_con_cocina", fmt.Sprintf("Quedan %d tareas de cocina pendientes", summary.TareasCocinaPendientes)}
	}
	if summary.IncidenciasPendientes > 0 {
		return CloseResult{}, &DomainError{"jornada_con_incidencias", fmt.Sprintf("Quedan %d solicitudes de cocina pendientes", summary.IncidenciasPendientes)}
	}
	backup, err := Backup(ctx, db, *state.Jornada, dataDir)
	if err != nil {
		return CloseResult{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	summaryJSON, _ := json.Marshal(summary)
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return CloseResult{}, err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `UPDATE jornadas_operativas SET estado='cerrada', cerrada_en=?,
		cerrada_por_empleado_id=?, respaldo_ruta=?, resumen_json=? WHERE id=? AND estado='abierta'`, now, employeeID, backup, string(summaryJSON), state.Jornada.ID)
	if err != nil {
		return CloseResult{}, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return CloseResult{}, err
	}
	if rows != 1 {
		return CloseResult{}, &DomainError{"jornada_cerrada", "La jornada ya fue cerrada"}
	}
	detail, _ := json.Marshal(map[string]any{"resumen": summary, "respaldoRuta": backup})
	if _, err := tx.ExecContext(ctx, `INSERT INTO jornada_eventos (jornada_id,tipo,empleado_id,detalle_json,creado_en)
		VALUES (?,'cierre',?,?,?)`, state.Jornada.ID, employeeID, string(detail), now); err != nil {
		return CloseResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return CloseResult{}, err
	}
	closed, err := get(ctx, db, selectJourney+" WHERE j.id = ?", state.Jornada.ID)
	return CloseResult{Jornada: closed, Resumen: summary, RespaldoRuta: backup}, err
}

func GetSummary(ctx context.Context, db *sql.DB, journeyID int64) (Summary, error) {
	var result Summary
	if err := db.QueryRowContext(ctx, `SELECT count(*), COALESCE(SUM(CASE WHEN estado IN ('abierta','precuenta_emitida') THEN 1 ELSE 0 END),0)
		FROM cuentas WHERE jornada_id=?`, journeyID).Scan(&result.CuentasTotales, &result.CuentasActivas); err != nil {
		return Summary{}, err
	}
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM ordenes o JOIN cuentas c ON c.id=o.cuenta_id WHERE c.jornada_id=?`, journeyID).Scan(&result.Ordenes); err != nil {
		return Summary{}, err
	}
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM comanda_lineas cl JOIN comandas c ON c.id=cl.comanda_id
		WHERE c.jornada_id=? AND cl.etapa IN ('por_preparar','en_proceso')`, journeyID).Scan(&result.TareasCocinaPendientes); err != nil {
		return Summary{}, err
	}
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM cocina_incidencias i JOIN comandas c ON c.id=i.comanda_id
		WHERE c.jornada_id=? AND i.estado='pendiente'`, journeyID).Scan(&result.IncidenciasPendientes); err != nil {
		return Summary{}, err
	}
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM cuentas
		WHERE jornada_id=? AND estado IN ('abierta','precuenta_emitida') AND tipo_servicio='para_llevar'`, journeyID).Scan(&result.PedidosParaLlevarPendientes); err != nil {
		return Summary{}, err
	}
	ready, err := readyOrderIDs(ctx, db, journeyID)
	if err != nil {
		return Summary{}, err
	}
	result.OrdenesListas = len(ready)
	rows, err := db.QueryContext(ctx, `SELECT id FROM cuentas WHERE jornada_id=? AND estado IN ('abierta','precuenta_emitida')`, journeyID)
	if err != nil {
		return Summary{}, err
	}
	accountIDs := []int64{}
	for rows.Next() {
		var accountID int64
		if err := rows.Scan(&accountID); err != nil {
			rows.Close()
			return Summary{}, err
		}
		accountIDs = append(accountIDs, accountID)
	}
	if err := rows.Close(); err != nil {
		return Summary{}, err
	}
	for _, accountID := range accountIDs {
		detail, err := accounts.Get(ctx, db, accountID)
		if err != nil {
			return Summary{}, err
		}
		empty := true
		for _, order := range detail.Orders {
			for _, line := range order.Lines {
				if line.Quantity > 0 {
					empty = false
				}
			}
		}
		if empty {
			result.CuentasVacias++
		}
	}
	return result, nil
}

func MarkAllReadyDelivered(ctx context.Context, db *sql.DB, journeyID, employeeID int64) (int, error) {
	ids, err := readyOrderIDs(ctx, db, journeyID)
	if err != nil {
		return 0, err
	}
	for _, id := range ids {
		if _, err := delivery.Mark(ctx, db, id, employeeID, "manual"); err != nil {
			return 0, err
		}
	}
	return len(ids), nil
}

func CloseBulk(ctx context.Context, db *sql.DB, employeeID int64, dataDir string, effectiveClose *time.Time) (CloseResult, error) {
	state, err := Current(ctx, db)
	if err != nil {
		return CloseResult{}, err
	}
	if state.Jornada == nil {
		return CloseResult{}, &DomainError{"jornada_cerrada", "No hay una jornada operativa abierta"}
	}
	summary := *state.Resumen
	if summary.TareasCocinaPendientes > 0 {
		return CloseResult{}, &DomainError{"jornada_con_cocina", fmt.Sprintf("Quedan %d tareas de cocina pendientes", summary.TareasCocinaPendientes)}
	}
	if summary.IncidenciasPendientes > 0 {
		return CloseResult{}, &DomainError{"jornada_con_incidencias", fmt.Sprintf("Quedan %d solicitudes de cocina pendientes", summary.IncidenciasPendientes)}
	}
	if summary.OrdenesListas > 0 {
		return CloseResult{}, &DomainError{"jornada_con_listos", fmt.Sprintf("Quedan %d órdenes listas sin confirmar", summary.OrdenesListas)}
	}
	if summary.PedidosParaLlevarPendientes > 0 {
		return CloseResult{}, &DomainError{"jornada_con_retiros", fmt.Sprintf("Quedan %d pedidos para llevar sin retirar", summary.PedidosParaLlevarPendientes)}
	}
	now := time.Now().UTC()
	closedAt := now
	if effectiveClose != nil {
		if effectiveClose.After(now) || effectiveClose.Before(parseTime(state.Jornada.AbiertaEn)) {
			return CloseResult{}, &DomainError{"hora_cierre_invalida", "La hora corregida debe estar entre la apertura y el momento actual"}
		}
		closedAt = effectiveClose.UTC()
	}
	backup, err := Backup(ctx, db, *state.Jornada, dataDir)
	if err != nil {
		return CloseResult{}, err
	}
	plans, err := billing.PrepareBulkClose(ctx, db, state.Jornada.ID)
	if err != nil {
		return CloseResult{}, err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return CloseResult{}, err
	}
	defer tx.Rollback()
	bulk, err := billing.BulkCloseTx(ctx, tx, plans, employeeID, closedAt.Format(time.RFC3339Nano))
	if err != nil {
		return CloseResult{}, err
	}
	detail, _ := json.Marshal(map[string]any{"resumen": summary, "cierreMasivo": bulk, "respaldoRuta": backup, "cierreEfectivo": closedAt.Format(time.RFC3339Nano), "registradoEn": now.Format(time.RFC3339Nano)})
	result, err := tx.ExecContext(ctx, `UPDATE jornadas_operativas SET estado='cerrada', cerrada_en=?, cierre_registrado_en=?,
		cerrada_por_empleado_id=?, respaldo_ruta=?, resumen_json=? WHERE id=? AND estado='abierta'`,
		closedAt.Format(time.RFC3339Nano), now.Format(time.RFC3339Nano), employeeID, backup, string(detail), state.Jornada.ID)
	if err != nil {
		return CloseResult{}, err
	}
	if changed, _ := result.RowsAffected(); changed != 1 {
		return CloseResult{}, &DomainError{"jornada_cerrada", "La jornada ya fue cerrada"}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO jornada_eventos (jornada_id,tipo,empleado_id,detalle_json,creado_en) VALUES (?,'cierre',?,?,?)`, state.Jornada.ID, employeeID, string(detail), now.Format(time.RFC3339Nano)); err != nil {
		return CloseResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return CloseResult{}, err
	}
	closed, err := get(ctx, db, selectJourney+" WHERE j.id = ?", state.Jornada.ID)
	return CloseResult{Jornada: closed, Resumen: summary, RespaldoRuta: backup, CierreMasivo: &bulk}, err
}

func readyOrderIDs(ctx context.Context, db *sql.DB, journeyID int64) ([]int64, error) {
	rows, err := db.QueryContext(ctx, `SELECT o.id FROM ordenes o JOIN cuentas cu ON cu.id=o.cuenta_id
		WHERE cu.jornada_id=? AND cu.tipo_servicio='mesa' AND cu.estado IN ('abierta','precuenta_emitida')
		AND NOT EXISTS (SELECT 1 FROM entregas_ordenes e WHERE e.orden_id=o.id)
		AND EXISTS (SELECT 1 FROM comanda_lineas cl JOIN comandas c ON c.id=cl.comanda_id WHERE c.orden_id=o.id AND cl.etapa='listo')
		AND NOT EXISTS (SELECT 1 FROM comanda_lineas cl JOIN comandas c ON c.id=cl.comanda_id WHERE c.orden_id=o.id AND cl.etapa NOT IN ('listo','servido','aviso','cancelado'))`, journeyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func Backup(ctx context.Context, db *sql.DB, journey Journey, dataDir string) (string, error) {
	if strings.TrimSpace(dataDir) == "" {
		var sequence int
		var name, file string
		rows, err := db.QueryContext(ctx, "PRAGMA database_list")
		if err != nil {
			return "", err
		}
		for rows.Next() {
			if err := rows.Scan(&sequence, &name, &file); err != nil {
				rows.Close()
				return "", err
			}
			if name == "main" {
				dataDir = filepath.Dir(filepath.Dir(file))
				break
			}
		}
		rows.Close()
	}
	if dataDir == "" {
		return "", &DomainError{"respaldo_no_disponible", "La base no tiene una ruta disponible para respaldar"}
	}
	directory := filepath.Join(dataDir, "backups")
	if err := os.MkdirAll(directory, 0o750); err != nil {
		return "", err
	}
	stamp := strings.NewReplacer(":", "-", ".", "-").Replace(time.Now().UTC().Format(time.RFC3339Nano))
	destination := filepath.Join(directory, fmt.Sprintf("jornada-%s-%d-%s.sqlite", journey.FechaOperativa, journey.ID, stamp))
	if _, err := db.ExecContext(ctx, "PRAGMA wal_checkpoint(FULL)"); err != nil {
		return "", err
	}
	escaped := strings.ReplaceAll(destination, "'", "''")
	if _, err := db.ExecContext(ctx, "VACUUM INTO '"+escaped+"'"); err != nil {
		return "", err
	}
	return destination, nil
}

func get(ctx context.Context, db *sql.DB, query string, args ...any) (Journey, error) {
	var item Journey
	var openBy, closedAt, closedBy, backup, recorded sql.NullString
	var templateID sql.NullInt64
	err := db.QueryRowContext(ctx, query, args...).Scan(&item.ID, &item.FechaOperativa, &item.Estado, &item.AbiertaEn, &openBy, &closedAt, &closedBy, &backup, &templateID, &item.TurnoNombre, &recorded)
	if openBy.Valid {
		item.AbiertaPor = &openBy.String
	}
	if closedAt.Valid {
		item.CerradaEn = &closedAt.String
	}
	if closedBy.Valid {
		item.CerradaPor = &closedBy.String
	}
	if backup.Valid {
		item.RespaldoRuta = &backup.String
	}
	if templateID.Valid {
		item.TurnoPlantillaID = &templateID.Int64
	}
	if recorded.Valid {
		item.CierreRegistradoEn = &recorded.String
	}
	return item, err
}

func validOptionalTime(value *string) bool {
	if value == nil || strings.TrimSpace(*value) == "" {
		return true
	}
	_, err := time.Parse("15:04", strings.TrimSpace(*value))
	return err == nil
}

func nullableString(value *string) any {
	if value == nil || strings.TrimSpace(*value) == "" {
		return nil
	}
	return strings.TrimSpace(*value)
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func parseTime(value string) time.Time {
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02 15:04:05"} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed
		}
	}
	return time.Time{}
}
