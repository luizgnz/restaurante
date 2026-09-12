package billing

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/luizgnz/restaurante/go/internal/accounts"
)

const disclaimer = "Esto no es boleta ni factura. El documento tributario lo emite caja."

type Error struct{ Code, Message string }

func (err *Error) Error() string { return err.Message }

type Options struct {
	InventoryPolicy string
	RequirePrecount bool
}

type SnapshotLine struct {
	ProductID  int64   `json:"productoId"`
	Name       string  `json:"nombre"`
	Quantity   float64 `json:"cantidad"`
	PriceCents int64   `json:"precioCentavos"`
	Note       *string `json:"nota"`
}

type SnapshotOrder struct {
	Number       int            `json:"numero"`
	Instructions *string        `json:"indicaciones"`
	Lines        []SnapshotLine `json:"lineas"`
}

type Snapshot struct {
	AccountID   int64           `json:"cuentaId"`
	TableNumber int             `json:"mesaNumero"`
	Orders      []SnapshotOrder `json:"ordenes"`
	TotalCents  int64           `json:"totalCentavos"`
	Seal        string          `json:"sello"`
	Waiter      string          `json:"mesero,omitempty"`
	Disclaimer  string          `json:"leyenda,omitempty"`
}

type PrecountResult struct {
	PrecountID int64 `json:"precuentaId"`
	Number     int   `json:"numero"`
	TotalCents int64 `json:"totalCentavos"`
}

type HandoffResult struct {
	HandoffID int64 `json:"handoffId"`
}

type CancelResult struct {
	AccountID     int64   `json:"cuentaId"`
	TableID       int64   `json:"mesaId"`
	TableNumber   int     `json:"mesaNumero"`
	Orders        int     `json:"ordenes"`
	PreparedLines float64 `json:"lineasPreparadas"`
	ReleasedLines float64 `json:"lineasLiberadas"`
	TotalCents    int64   `json:"totalCentavos"`
}

func EmitPrecount(ctx context.Context, db *sql.DB, accountID, employeeID int64, options Options) (PrecountResult, error) {
	detail, err := accounts.Get(ctx, db, accountID)
	if err != nil {
		return PrecountResult{}, translateAccountError(err)
	}
	if detail.State == "en_caja" || detail.State == "cancelada" {
		return PrecountResult{}, &Error{"cuenta_cerrada", "La cuenta ya está cerrada"}
	}
	if detail.ServiceType == "para_llevar" {
		return PrecountResult{}, &Error{"precuenta_no_aplica", "Los pedidos para llevar no usan precuenta"}
	}
	snapshot, err := snapshotFromDetail(ctx, db, detail)
	if err != nil {
		return PrecountResult{}, err
	}
	if len(snapshot.Orders) == 0 {
		return PrecountResult{}, &Error{"cuenta_sin_consumo", "La cuenta no tiene consumo que cobrar"}
	}
	if err := db.QueryRowContext(ctx, "SELECT nombre FROM empleados WHERE id = ? AND activo = 1", employeeID).Scan(&snapshot.Waiter); errors.Is(err, sql.ErrNoRows) {
		return PrecountResult{}, &Error{"empleado_inexistente", "Empleado inexistente"}
	} else if err != nil {
		return PrecountResult{}, err
	}
	snapshot.Disclaimer = disclaimer

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return PrecountResult{}, err
	}
	defer tx.Rollback()
	if err := validateAccountState(ctx, tx, accountID); err != nil {
		return PrecountResult{}, err
	}
	currentSeal, err := accountSeal(ctx, tx, accountID)
	if err != nil {
		return PrecountResult{}, err
	}
	if currentSeal != snapshot.Seal {
		return PrecountResult{}, &Error{"cuenta_desactualizada", "La cuenta cambió; vuelve a emitir la precuenta"}
	}
	if _, err := tx.ExecContext(ctx, "UPDATE precuentas SET vigente = 0 WHERE cuenta_id = ?", accountID); err != nil {
		return PrecountResult{}, err
	}
	var previous int
	if err := tx.QueryRowContext(ctx, "SELECT COALESCE(MAX(numero), 0) FROM precuentas WHERE cuenta_id = ?", accountID).Scan(&previous); err != nil {
		return PrecountResult{}, err
	}
	payload, err := json.Marshal(snapshot)
	if err != nil {
		return PrecountResult{}, err
	}
	result, err := tx.ExecContext(ctx, `
		INSERT INTO precuentas (pedido_id, cuenta_id, numero, vigente, mesero_id, snapshot_json, emitida_en)
		VALUES (NULL, ?, ?, 1, ?, ?, ?)`, accountID, previous+1, employeeID, string(payload), timestamp())
	if err != nil {
		return PrecountResult{}, err
	}
	precountID, _ := result.LastInsertId()
	if _, err := tx.ExecContext(ctx, "UPDATE cuentas SET estado = 'precuenta_emitida' WHERE id = ?", accountID); err != nil {
		return PrecountResult{}, err
	}
	if options.InventoryPolicy == "reserva_al_enviar_firme_al_precuenta" {
		if err := firmReserved(ctx, tx, accountID); err != nil {
			return PrecountResult{}, err
		}
	}
	jobPayload, _ := json.Marshal(map[string]any{
		"mesaNumero": snapshot.TableNumber, "mesero": snapshot.Waiter,
		"lineas": flatten(snapshot), "totalCentavos": snapshot.TotalCents,
	})
	if _, err := tx.ExecContext(ctx,
		"INSERT INTO print_jobs (kind, payload, status, attempts, created_en) VALUES ('precuenta', ?, 'queued', 0, ?)",
		string(jobPayload), timestamp()); err != nil {
		return PrecountResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return PrecountResult{}, err
	}
	return PrecountResult{precountID, previous + 1, snapshot.TotalCents}, nil
}

func ReprintPrecount(ctx context.Context, db *sql.DB, accountID int64) (int, any, error) {
	var number int
	var raw string
	err := db.QueryRowContext(ctx, `
		SELECT numero, snapshot_json FROM precuentas
		WHERE cuenta_id = ? AND vigente = 1 ORDER BY id DESC LIMIT 1`, accountID).Scan(&number, &raw)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil, &Error{"precuenta_inexistente", "La cuenta no tiene una precuenta vigente"}
	}
	if err != nil {
		return 0, nil, err
	}
	var snapshot any
	if err := json.Unmarshal([]byte(raw), &snapshot); err != nil {
		return 0, nil, err
	}
	jobPayload, _ := json.Marshal(map[string]any{"snapshot": snapshot, "reimpresion": true})
	if _, err := db.ExecContext(ctx,
		"INSERT INTO print_jobs (kind, payload, status, attempts, created_en) VALUES ('precuenta', ?, 'queued', 0, ?)",
		string(jobPayload), timestamp()); err != nil {
		return 0, nil, err
	}
	return number, snapshot, nil
}

func SendToCash(ctx context.Context, db *sql.DB, accountID, employeeID int64, options Options) (HandoffResult, error) {
	detail, err := accounts.Get(ctx, db, accountID)
	if err != nil {
		return HandoffResult{}, translateAccountError(err)
	}
	if detail.State == "en_caja" || detail.State == "cancelada" {
		return HandoffResult{}, &Error{"cuenta_cerrada", "La cuenta ya está cerrada"}
	}
	fallbackSnapshot, err := snapshotFromDetail(ctx, db, detail)
	if err != nil {
		return HandoffResult{}, err
	}
	fallbackJSON, _ := json.Marshal(fallbackSnapshot)

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return HandoffResult{}, err
	}
	defer tx.Rollback()
	if err := validateAccountState(ctx, tx, accountID); err != nil {
		return HandoffResult{}, err
	}
	var precountID sql.NullInt64
	var snapshotJSON string
	err = tx.QueryRowContext(ctx, `
		SELECT id, snapshot_json FROM precuentas WHERE cuenta_id = ? ORDER BY numero DESC LIMIT 1`, accountID).
		Scan(&precountID, &snapshotJSON)
	if errors.Is(err, sql.ErrNoRows) {
		if options.RequirePrecount {
			return HandoffResult{}, &Error{"precuenta_requerida", "Hace falta emitir una precuenta antes del cierre"}
		}
		precountID = sql.NullInt64{}
		snapshotJSON = string(fallbackJSON)
	} else if err != nil {
		return HandoffResult{}, err
	} else {
		var snapshot struct {
			Seal string `json:"sello"`
		}
		if err := json.Unmarshal([]byte(snapshotJSON), &snapshot); err != nil {
			return HandoffResult{}, err
		}
		currentSeal, err := accountSeal(ctx, tx, accountID)
		if err != nil {
			return HandoffResult{}, err
		}
		if snapshot.Seal != currentSeal {
			return HandoffResult{}, &Error{"precuenta_desactualizada", "La última precuenta no refleja la última orden o corrección; hay que reemitirla"}
		}
	}
	if err := firmReserved(ctx, tx, accountID); err != nil {
		return HandoffResult{}, err
	}
	now := timestamp()
	if _, err := tx.ExecContext(ctx, "UPDATE cuentas SET estado = 'en_caja', cerrada_en = ? WHERE id = ?", now, accountID); err != nil {
		return HandoffResult{}, err
	}
	result, err := tx.ExecContext(ctx, `
		INSERT INTO caja_handoffs (pedido_id, cuenta_id, precuenta_id, mesero_id, snapshot_json, creado_en)
		VALUES (NULL, ?, ?, ?, ?, ?)`, accountID, nullInt(precountID), employeeID, snapshotJSON, now)
	if err != nil {
		return HandoffResult{}, err
	}
	handoffID, _ := result.LastInsertId()
	if err := tx.Commit(); err != nil {
		return HandoffResult{}, err
	}
	return HandoffResult{handoffID}, nil
}

func CancelAccount(ctx context.Context, db *sql.DB, accountID, employeeID int64, reason string) (CancelResult, error) {
	reason = trim(reason)
	if reason == "" {
		return CancelResult{}, &Error{"justificacion_requerida", "Para cancelar la cuenta hay que registrar el motivo"}
	}
	detail, err := accounts.Get(ctx, db, accountID)
	if err != nil {
		return CancelResult{}, translateAccountError(err)
	}
	if detail.State != "abierta" && detail.State != "precuenta_emitida" {
		return CancelResult{}, &Error{"cuenta_cerrada", "La cuenta ya no se puede cancelar"}
	}
	snapshot, err := snapshotFromDetail(ctx, db, detail)
	if err != nil {
		return CancelResult{}, err
	}
	prepared := float64(0)
	released := float64(0)
	for _, order := range detail.Orders {
		for _, line := range order.Lines {
			if line.Quantity <= 0 {
				continue
			}
			released += line.Quantity
			if lineIsPrepared(ctx, db, order.ID, line.LineKey, line.OrderLineID) {
				prepared += line.Quantity
			}
		}
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return CancelResult{}, err
	}
	defer tx.Rollback()
	if err := validateAccountState(ctx, tx, accountID); err != nil {
		return CancelResult{}, err
	}
	currentSeal, err := accountSeal(ctx, tx, accountID)
	if err != nil {
		return CancelResult{}, err
	}
	if currentSeal != snapshot.Seal {
		return CancelResult{}, &Error{"cuenta_desactualizada", "La cuenta cambió; vuelve a intentar"}
	}
	if err := releaseAllInventory(ctx, tx, accountID); err != nil {
		return CancelResult{}, err
	}
	now := timestamp()
	if _, err := tx.ExecContext(ctx, `
		UPDATE comanda_lineas SET etapa = 'cancelado', etapa_actualizada_en = ?
		WHERE etapa IN ('por_preparar', 'en_proceso') AND comanda_id IN (
			SELECT c.id FROM comandas c JOIN ordenes o ON o.id = c.orden_id WHERE o.cuenta_id = ?
		)`, now, accountID); err != nil {
		return CancelResult{}, err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE precuentas SET vigente = 0 WHERE cuenta_id = ?", accountID); err != nil {
		return CancelResult{}, err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE cuentas SET estado = 'cancelada', cerrada_en = ? WHERE id = ?", now, accountID); err != nil {
		return CancelResult{}, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO cancelaciones_cuentas
			(cuenta_id, mesa_id, mesa_numero, empleado_id, motivo, total_centavos, ordenes, lineas_preparadas, lineas_liberadas, creada_en)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, accountID, detail.Table.ID, detail.Table.Number, employeeID,
		reason, snapshot.TotalCents, len(detail.Orders), prepared, released, now); err != nil {
		return CancelResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return CancelResult{}, err
	}
	return CancelResult{accountID, detail.Table.ID, detail.Table.Number, len(detail.Orders), prepared, released, snapshot.TotalCents}, nil
}

func snapshotFromDetail(ctx context.Context, db *sql.DB, detail accounts.Detail) (Snapshot, error) {
	snapshot := Snapshot{AccountID: detail.ID, TableNumber: detail.Table.Number, Orders: []SnapshotOrder{}}
	for _, order := range detail.Orders {
		current := SnapshotOrder{Number: order.Number, Instructions: order.Instructions, Lines: []SnapshotLine{}}
		for _, line := range order.Lines {
			if line.Quantity <= 0 {
				continue
			}
			current.Lines = append(current.Lines, SnapshotLine{line.ProductID, line.Name, line.Quantity, line.PriceCents, line.Note})
			snapshot.TotalCents += int64(math.Round(line.Quantity * float64(line.PriceCents)))
		}
		if len(current.Lines) > 0 {
			snapshot.Orders = append(snapshot.Orders, current)
		}
	}
	seal, err := accountSeal(ctx, db, detail.ID)
	if err != nil {
		return Snapshot{}, err
	}
	snapshot.Seal = seal
	return snapshot, nil
}

type rowQuerier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func accountSeal(ctx context.Context, query rowQuerier, accountID int64) (string, error) {
	var orderCount, lastOrder, correctionCount, lastCorrection int64
	if err := query.QueryRowContext(ctx,
		"SELECT count(*), COALESCE(MAX(id), 0) FROM ordenes WHERE cuenta_id = ?", accountID).
		Scan(&orderCount, &lastOrder); err != nil {
		return "", err
	}
	if err := query.QueryRowContext(ctx, `
		SELECT count(*), COALESCE(MAX(oc.id), 0)
		FROM orden_correcciones oc JOIN ordenes o ON o.id = oc.orden_id
		WHERE o.cuenta_id = ?`, accountID).Scan(&correctionCount, &lastCorrection); err != nil {
		return "", err
	}
	return fmt.Sprintf("o:%d:%d/c:%d:%d", orderCount, lastOrder, correctionCount, lastCorrection), nil
}

func validateAccountState(ctx context.Context, tx *sql.Tx, accountID int64) error {
	var state string
	err := tx.QueryRowContext(ctx, "SELECT estado FROM cuentas WHERE id = ?", accountID).Scan(&state)
	if errors.Is(err, sql.ErrNoRows) {
		return &Error{"cuenta_inexistente", "Cuenta inexistente"}
	}
	if err != nil {
		return err
	}
	if state != "abierta" && state != "precuenta_emitida" {
		return &Error{"cuenta_cerrada", "La cuenta ya está cerrada"}
	}
	return nil
}

func firmReserved(ctx context.Context, tx *sql.Tx, accountID int64) error {
	rows, err := tx.QueryContext(ctx, `
		SELECT oli.orden_id, oli.linea_clave, oli.producto_id, oli.reservada_real
		FROM orden_linea_inventario oli JOIN ordenes o ON o.id = oli.orden_id
		WHERE o.cuenta_id = ? AND oli.reservada_real > 0`, accountID)
	if err != nil {
		return err
	}
	type item struct {
		orderID, productID int64
		key                string
		amount             float64
	}
	items := []item{}
	for rows.Next() {
		var value item
		if err := rows.Scan(&value.orderID, &value.key, &value.productID, &value.amount); err != nil {
			rows.Close()
			return err
		}
		items = append(items, value)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	for _, value := range items {
		if _, err := tx.ExecContext(ctx,
			"UPDATE stock SET on_hand_real = on_hand_real - ?, reserved_real = reserved_real - ? WHERE producto_id = ?",
			value.amount, value.amount, value.productID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `
			UPDATE orden_linea_inventario SET reservada_real = 0, firmada_real = firmada_real + ?
			WHERE orden_id = ? AND linea_clave = ? AND producto_id = ?`, value.amount, value.orderID, value.key, value.productID); err != nil {
			return err
		}
	}
	return nil
}

func releaseAllInventory(ctx context.Context, tx *sql.Tx, accountID int64) error {
	rows, err := tx.QueryContext(ctx, `
		SELECT oli.orden_id, oli.linea_clave, oli.producto_id, oli.reservada_real, oli.firmada_real
		FROM orden_linea_inventario oli JOIN ordenes o ON o.id = oli.orden_id
		WHERE o.cuenta_id = ? AND (oli.reservada_real > 0 OR oli.firmada_real > 0)`, accountID)
	if err != nil {
		return err
	}
	type item struct {
		orderID, productID int64
		key                string
		reserved, firmed   float64
	}
	items := []item{}
	for rows.Next() {
		var value item
		if err := rows.Scan(&value.orderID, &value.key, &value.productID, &value.reserved, &value.firmed); err != nil {
			rows.Close()
			return err
		}
		items = append(items, value)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	for _, value := range items {
		if _, err := tx.ExecContext(ctx,
			"UPDATE stock SET reserved_real = reserved_real - ?, on_hand_real = on_hand_real + ? WHERE producto_id = ?",
			value.reserved, value.firmed, value.productID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `
			UPDATE orden_linea_inventario SET reservada_real = 0, firmada_real = 0
			WHERE orden_id = ? AND linea_clave = ? AND producto_id = ?`, value.orderID, value.key, value.productID); err != nil {
			return err
		}
	}
	return nil
}

func lineIsPrepared(ctx context.Context, db *sql.DB, orderID int64, key string, originalID *int64) bool {
	id := int64(-1)
	if originalID != nil {
		id = *originalID
	}
	var count int
	err := db.QueryRowContext(ctx, `
		SELECT count(*) FROM comanda_lineas cl
		JOIN comandas c ON c.id = cl.comanda_id
		LEFT JOIN orden_correccion_lineas ocl ON ocl.id = cl.orden_correccion_linea_id
		WHERE c.orden_id = ? AND (cl.orden_linea_id = ? OR ocl.linea_clave = ?)
		AND cl.etapa IN ('en_proceso', 'listo', 'servido')`, orderID, id, key).Scan(&count)
	return err == nil && count > 0
}

func flatten(snapshot Snapshot) []map[string]any {
	lines := []map[string]any{}
	for _, order := range snapshot.Orders {
		for _, line := range order.Lines {
			lines = append(lines, map[string]any{"nombre": line.Name, "cantidad": line.Quantity, "precio_centavos": line.PriceCents, "nota": line.Note})
		}
	}
	return lines
}

func translateAccountError(err error) error {
	var accountError *accounts.Error
	if errors.As(err, &accountError) {
		return &Error{accountError.Code, accountError.Message}
	}
	return err
}

func nullInt(value sql.NullInt64) any {
	if !value.Valid {
		return nil
	}
	return value.Int64
}

func trim(value string) string {
	return stringTrim(value)
}

func stringTrim(value string) string {
	start, end := 0, len(value)
	for start < end && (value[start] == ' ' || value[start] == '\n' || value[start] == '\t' || value[start] == '\r') {
		start++
	}
	for end > start && (value[end-1] == ' ' || value[end-1] == '\n' || value[end-1] == '\t' || value[end-1] == '\r') {
		end--
	}
	return value[start:end]
}

func timestamp() string {
	return time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
}
