package delivery

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

type Error struct{ Code, Message string }

func (err *Error) Error() string { return err.Message }

type Result struct {
	OrderID  int64  `json:"ordenId"`
	Origin   string `json:"origen"`
	Repeated bool   `json:"repetida"`
}

// Mark registra la entrega de una orden completamente lista. Nunca entrega
// parcialmente ni altera una orden que ya tiene comprobante de entrega.
func Mark(ctx context.Context, db *sql.DB, orderID, employeeID int64, origin string) (Result, error) {
	if origin != "manual" && origin != "automatica" && origin != "retiro" {
		return Result{}, &Error{Code: "origen_invalido", Message: "Origen de entrega inválido"}
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Result{}, err
	}
	defer tx.Rollback()
	var accountID int64
	var service string
	err = tx.QueryRowContext(ctx, `SELECT o.cuenta_id, c.tipo_servicio FROM ordenes o JOIN cuentas c ON c.id = o.cuenta_id WHERE o.id = ?`, orderID).Scan(&accountID, &service)
	if errors.Is(err, sql.ErrNoRows) {
		return Result{}, &Error{Code: "orden_inexistente", Message: "La orden no existe"}
	}
	if err != nil {
		return Result{}, err
	}
	var previous string
	err = tx.QueryRowContext(ctx, "SELECT origen FROM entregas_ordenes WHERE orden_id = ?", orderID).Scan(&previous)
	if err == nil {
		return Result{OrderID: orderID, Origin: previous, Repeated: true}, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return Result{}, err
	}

	rows, err := tx.QueryContext(ctx, `SELECT cl.etapa FROM comanda_lineas cl JOIN comandas c ON c.id = cl.comanda_id
		WHERE c.orden_id = ? AND cl.etapa NOT IN ('aviso', 'cancelado')`, orderID)
	if err != nil {
		return Result{}, err
	}
	stages := []string{}
	for rows.Next() {
		var stage string
		if err := rows.Scan(&stage); err != nil {
			rows.Close()
			return Result{}, err
		}
		stages = append(stages, stage)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return Result{}, err
	}
	if err := rows.Close(); err != nil {
		return Result{}, err
	}
	if len(stages) == 0 {
		return Result{}, &Error{Code: "orden_sin_productos", Message: "La orden no tiene productos para entregar"}
	}
	for _, stage := range stages {
		if stage != "listo" && stage != "servido" {
			return Result{}, &Error{Code: "orden_no_lista", Message: "La orden todavía no está lista para entregar"}
		}
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	if _, err := tx.ExecContext(ctx, `UPDATE comanda_lineas SET etapa = 'servido', etapa_actualizada_en = ?
		WHERE id IN (SELECT cl.id FROM comanda_lineas cl JOIN comandas c ON c.id = cl.comanda_id WHERE c.orden_id = ? AND cl.etapa = 'listo')`, now, orderID); err != nil {
		return Result{}, err
	}
	var signer any = employeeID
	if origin == "automatica" {
		signer = nil
	}
	if _, err := tx.ExecContext(ctx, "INSERT INTO entregas_ordenes (orden_id, origen, empleado_id, creada_en) VALUES (?, ?, ?, ?)", orderID, origin, signer, now); err != nil {
		return Result{}, err
	}
	if service == "para_llevar" && origin == "retiro" {
		if _, err := tx.ExecContext(ctx, "UPDATE cuentas SET estado = 'en_caja' WHERE id = ?", accountID); err != nil {
			return Result{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return Result{}, err
	}
	return Result{OrderID: orderID, Origin: origin}, nil
}

// ApplyAutomatic aplica el respaldo configurable solo a pedidos de mesa. Las
// incidencias pendientes pausan el reloj y los pedidos para llevar requieren
// retiro explícito.
func ApplyAutomatic(ctx context.Context, db *sql.DB, enabled bool, minutes int) (int, error) {
	if !enabled {
		return 0, nil
	}
	if minutes < 1 || minutes > 240 {
		minutes = 30
	}
	limit := time.Now().UTC().Add(-time.Duration(minutes) * time.Minute).Format("2006-01-02T15:04:05.000Z")
	rows, err := db.QueryContext(ctx, `
		SELECT o.id
		FROM ordenes o
		JOIN cuentas cu ON cu.id = o.cuenta_id AND cu.tipo_servicio = 'mesa'
		WHERE cu.estado IN ('abierta', 'precuenta_emitida')
		  AND NOT EXISTS (SELECT 1 FROM entregas_ordenes e WHERE e.orden_id = o.id)
		  AND NOT EXISTS (SELECT 1 FROM cocina_incidencias i WHERE i.orden_id = o.id AND i.estado = 'pendiente')
		  AND EXISTS (
			SELECT 1 FROM comanda_lineas cl JOIN comandas c ON c.id = cl.comanda_id
			WHERE c.orden_id = o.id AND cl.etapa = 'listo'
		  )
		  AND NOT EXISTS (
			SELECT 1 FROM comanda_lineas cl JOIN comandas c ON c.id = cl.comanda_id
			WHERE c.orden_id = o.id AND cl.etapa NOT IN ('listo', 'servido', 'aviso', 'cancelado')
		  )
		  AND COALESCE((
			SELECT MAX(cl.etapa_actualizada_en) FROM comanda_lineas cl JOIN comandas c ON c.id = cl.comanda_id
			WHERE c.orden_id = o.id AND cl.etapa = 'listo'
		  ), '9999-12-31') <= ?`, limit)
	if err != nil {
		return 0, err
	}
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, err
		}
		ids = append(ids, id)
	}
	if err := rows.Close(); err != nil {
		return 0, err
	}
	applied := 0
	for _, id := range ids {
		result, err := Mark(ctx, db, id, 0, "automatica")
		if err != nil {
			return applied, err
		}
		if !result.Repeated {
			applied++
		}
	}
	return applied, nil
}
