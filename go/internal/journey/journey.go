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
)

type Journey struct {
	ID             int64   `json:"id"`
	FechaOperativa string  `json:"fechaOperativa"`
	Estado         string  `json:"estado"`
	AbiertaEn      string  `json:"abiertaEn"`
	AbiertaPor     *string `json:"abiertaPor"`
	CerradaEn      *string `json:"cerradaEn"`
	CerradaPor     *string `json:"cerradaPor"`
	RespaldoRuta   *string `json:"respaldoRuta"`
}

type Summary struct {
	CuentasActivas         int `json:"cuentasActivas"`
	CuentasTotales         int `json:"cuentasTotales"`
	Ordenes                int `json:"ordenes"`
	TareasCocinaPendientes int `json:"tareasCocinaPendientes"`
	IncidenciasPendientes  int `json:"incidenciasPendientes"`
}

type State struct {
	Jornada       *Journey `json:"jornada"`
	Resumen       *Summary `json:"resumen"`
	UltimaCerrada *Journey `json:"ultimaCerrada"`
}

type CloseResult struct {
	Jornada      Journey `json:"jornada"`
	Resumen      Summary `json:"resumen"`
	RespaldoRuta string  `json:"respaldoRuta"`
}

type DomainError struct{ Code, Message string }

func (e *DomainError) Error() string { return e.Message }

const selectJourney = `SELECT j.id, j.fecha_operativa, j.estado, j.abierta_en, ea.nombre,
	j.cerrada_en, ec.nombre, j.respaldo_ruta FROM jornadas_operativas j
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
	localDate := now.Format("2006-01-02")
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Journey{}, err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `INSERT INTO jornadas_operativas (fecha_operativa, estado, abierta_en, abierta_por_empleado_id)
		VALUES (?, 'abierta', ?, ?)`, localDate, timestamp, employeeID)
	if err != nil {
		return Journey{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return Journey{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO jornada_eventos (jornada_id, tipo, empleado_id, detalle_json, creado_en)
		VALUES (?, 'apertura', ?, '{"origen":"administracion"}', ?)`, id, employeeID, timestamp); err != nil {
		return Journey{}, err
	}
	if err := tx.Commit(); err != nil {
		return Journey{}, err
	}
	return get(ctx, db, selectJourney+" WHERE j.id = ?", id)
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
		return CloseResult{}, &DomainError{"jornada_con_cuentas", fmt.Sprintf("Quedan %d cuentas activas", summary.CuentasActivas)}
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
	return result, nil
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
	var openBy, closedAt, closedBy, backup sql.NullString
	err := db.QueryRowContext(ctx, query, args...).Scan(&item.ID, &item.FechaOperativa, &item.Estado, &item.AbiertaEn, &openBy, &closedAt, &closedBy, &backup)
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
	return item, err
}
