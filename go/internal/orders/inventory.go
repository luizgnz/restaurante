package orders

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

func componentsFor(ctx context.Context, tx *sql.Tx, productID int64) ([]component, error) {
	var kind string
	var tracked int
	if err := tx.QueryRowContext(ctx,
		"SELECT tipo_consumo, rastrear_inventario FROM productos WHERE id = ?",
		productID,
	).Scan(&kind, &tracked); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, &Error{"producto_inexistente", "Producto inexistente"}
		}
		return nil, err
	}

	if kind != "receta_kit" {
		if kind == "almacenable_unitario" || tracked == 1 {
			var name string
			if err := tx.QueryRowContext(ctx, "SELECT nombre FROM productos WHERE id = ?", productID).Scan(&name); err != nil {
				return nil, err
			}
			return []component{{productID: productID, perUnit: 1, name: name}}, nil
		}
		return []component{}, nil
	}

	rows, err := tx.QueryContext(ctx, `
		SELECT r.ingrediente_id, SUM(r.cantidad_real), p.nombre
		FROM receta_lineas r
		JOIN productos p ON p.id = r.ingrediente_id
		WHERE r.producto_id = ?
		GROUP BY r.ingrediente_id, p.nombre
		ORDER BY r.ingrediente_id`, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	parts := []component{}
	for rows.Next() {
		var part component
		if err := rows.Scan(&part.productID, &part.perUnit, &part.name); err != nil {
			return nil, err
		}
		parts = append(parts, part)
	}
	return parts, rows.Err()
}

func ensureStock(ctx context.Context, tx *sql.Tx, consumptions []consumption) error {
	required := map[int64]float64{}
	names := map[int64]string{}
	for _, item := range consumptions {
		for _, part := range item.components {
			required[part.productID] += part.perUnit * item.quantity
			names[part.productID] = part.name
		}
	}

	shortages := []string{}
	for productID, amount := range required {
		var onHand, reserved float64
		err := tx.QueryRowContext(ctx,
			"SELECT on_hand_real, reserved_real FROM stock WHERE producto_id = ?",
			productID,
		).Scan(&onHand, &reserved)
		if errors.Is(err, sql.ErrNoRows) {
			onHand, reserved = 0, 0
		} else if err != nil {
			return err
		}
		available := onHand - reserved
		if amount > available+1e-9 {
			if available < 0 {
				available = 0
			}
			shortages = append(shortages,
				fmt.Sprintf("%s: pide %.2f, disponible %.2f", names[productID], amount, available))
		}
	}
	if len(shortages) > 0 {
		return &Error{"stock_insuficiente", "Sin stock suficiente — " + joinDetails(shortages)}
	}
	return nil
}

func joinDetails(values []string) string {
	result := ""
	for index, value := range values {
		if index > 0 {
			result += "; "
		}
		result += value
	}
	return result
}
