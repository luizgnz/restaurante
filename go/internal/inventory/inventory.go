package inventory

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/luizgnz/restaurante/go/internal/auth"
)

var (
	ErrInvalidAmount = errors.New("cantidad inválida")
	ErrInvalidReason = errors.New("motivo inválido")
	ErrNotFound      = errors.New("material inexistente")
	ErrInsufficient  = errors.New("stock insuficiente")
)

type Material struct {
	ID              int64   `json:"id"`
	Nombre          string  `json:"nombre"`
	Codigo          *string `json:"codigo"`
	EnMano          float64 `json:"enMano"`
	Reservado       float64 `json:"reservado"`
	Disponible      float64 `json:"disponible"`
	UltimaEntradaEn *string `json:"ultimaEntradaEn"`
}

type Result struct {
	Material     Material `json:"material"`
	MovimientoID int64    `json:"movimientoId"`
}

const materialSelect = `
  SELECT p.id, p.nombre, p.codigo, s.on_hand_real, s.reserved_real,
    (SELECT max(m.creado_en) FROM inventario_movimientos m WHERE m.producto_id = p.id AND m.tipo = 'entrada') AS ultima_entrada_en
  FROM productos p JOIN stock s ON s.producto_id = p.id WHERE p.activo = 1`

func List(ctx context.Context, db *sql.DB) ([]Material, error) {
	rows, err := db.QueryContext(ctx, materialSelect+" ORDER BY lower(p.nombre), p.id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	materials := []Material{}
	for rows.Next() {
		material, err := scanMaterial(rows)
		if err != nil {
			return nil, err
		}
		materials = append(materials, material)
	}
	return materials, rows.Err()
}

func RegisterEntry(ctx context.Context, db *sql.DB, productID int64, amount float64, pin string) (Result, error) {
	if amount <= 0 || amount > 1_000_000 {
		return Result{}, ErrInvalidAmount
	}
	employee, err := auth.VerifyPINForAdmin(ctx, db, pin)
	if err != nil {
		return Result{}, err
	}
	return register(ctx, db, productID, amount, "entrada", "", employee.ID)
}

func RegisterLoss(ctx context.Context, db *sql.DB, productID int64, amount float64, reason, pin string) (Result, error) {
	if amount <= 0 || amount > 1_000_000 {
		return Result{}, ErrInvalidAmount
	}
	if reason != "producto_danado" && reason != "consumo_interno" {
		return Result{}, ErrInvalidReason
	}
	employee, err := auth.VerifyPINForAdmin(ctx, db, pin)
	if err != nil {
		return Result{}, err
	}
	return register(ctx, db, productID, -amount, "perdida", reason, employee.ID)
}

func register(ctx context.Context, db *sql.DB, productID int64, delta float64, kind, reason string, employeeID int64) (Result, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Result{}, err
	}
	defer tx.Rollback()
	var before float64
	err = tx.QueryRowContext(ctx, `SELECT s.on_hand_real FROM productos p JOIN stock s ON s.producto_id = p.id WHERE p.id = ? AND p.activo = 1`, productID).Scan(&before)
	if err == sql.ErrNoRows {
		return Result{}, ErrNotFound
	}
	if err != nil {
		return Result{}, err
	}
	if delta < 0 && -delta > before {
		return Result{}, ErrInsufficient
	}
	after := before + delta
	if _, err := tx.ExecContext(ctx, "UPDATE stock SET on_hand_real = ? WHERE producto_id = ?", after, productID); err != nil {
		return Result{}, err
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	var result sql.Result
	if kind == "entrada" {
		result, err = tx.ExecContext(ctx, `INSERT INTO inventario_movimientos (producto_id, tipo, cantidad_real, stock_anterior_real, stock_nuevo_real, empleado_id, creado_en) VALUES (?, 'entrada', ?, ?, ?, ?, ?)`, productID, delta, before, after, employeeID, now)
	} else {
		result, err = tx.ExecContext(ctx, `INSERT INTO inventario_movimientos (producto_id, tipo, cantidad_real, stock_anterior_real, stock_nuevo_real, empleado_id, motivo, creado_en) VALUES (?, 'perdida', ?, ?, ?, ?, ?, ?)`, productID, -delta, before, after, employeeID, reason, now)
	}
	if err != nil {
		return Result{}, err
	}
	movementID, err := result.LastInsertId()
	if err != nil {
		return Result{}, err
	}
	material, err := materialByID(ctx, tx, productID)
	if err != nil {
		return Result{}, err
	}
	if err := tx.Commit(); err != nil {
		return Result{}, err
	}
	return Result{Material: material, MovimientoID: movementID}, nil
}

type scanner interface{ Scan(...any) error }

func scanMaterial(row scanner) (Material, error) {
	var material Material
	var code, last sql.NullString
	if err := row.Scan(&material.ID, &material.Nombre, &code, &material.EnMano, &material.Reservado, &last); err != nil {
		return Material{}, err
	}
	if code.Valid {
		material.Codigo = &code.String
	}
	if last.Valid {
		material.UltimaEntradaEn = &last.String
	}
	material.Disponible = material.EnMano - material.Reservado
	return material, nil
}

func materialByID(ctx context.Context, tx *sql.Tx, productID int64) (Material, error) {
	material, err := scanMaterial(tx.QueryRowContext(ctx, materialSelect+" AND p.id = ?", productID))
	if err == sql.ErrNoRows {
		return Material{}, ErrNotFound
	}
	if err != nil {
		return Material{}, fmt.Errorf("leer material actualizado: %w", err)
	}
	return material, nil
}
