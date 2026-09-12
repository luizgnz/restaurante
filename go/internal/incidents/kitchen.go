package incidents

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/luizgnz/restaurante/go/internal/orders"
)

type KitchenUpdate struct {
	ID            int64   `json:"id"`
	OrderID       int64   `json:"ordenId"`
	Table         int     `json:"mesa"`
	ServiceType   string  `json:"tipoServicio"`
	ServiceNumber *int    `json:"numeroServicio"`
	CustomerName  *string `json:"clienteNombre"`
	Product       string  `json:"producto"`
	Quantity      float64 `json:"cantidad"`
	Reason        string  `json:"motivo"`
	Kitchen       string  `json:"cocina"`
	CreatedAt     string  `json:"creadaEn"`
}

func CancelFromKitchen(
	ctx context.Context,
	db *sql.DB,
	commandLineID, employeeID int64,
	reason, inventoryPolicy string,
) (orders.CorrectionResult, error) {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return orders.CorrectionResult{}, &Error{"motivo_requerido", "Selecciona el motivo de la cancelación"}
	}
	var orderID int64
	var originalID sql.NullInt64
	var correctionKey sql.NullString
	var stage string
	err := db.QueryRowContext(ctx, `
		SELECT c.orden_id, cl.orden_linea_id, ocl.linea_clave, cl.etapa
		FROM comanda_lineas cl
		JOIN comandas c ON c.id = cl.comanda_id
		LEFT JOIN orden_correccion_lineas ocl ON ocl.id = cl.orden_correccion_linea_id
		WHERE cl.id = ?`, commandLineID).Scan(&orderID, &originalID, &correctionKey, &stage)
	if errors.Is(err, sql.ErrNoRows) || orderID == 0 {
		return orders.CorrectionResult{}, &Error{"linea_inexistente", "El producto no pertenece a una orden activa"}
	}
	if err != nil {
		return orders.CorrectionResult{}, err
	}
	if stage != "en_proceso" && stage != "listo" && stage != "servido" {
		return orders.CorrectionResult{}, &Error{"etapa_no_avanzable", "Cocina solo cancela productos que ya comenzaron"}
	}
	var originalPointer *int64
	if originalID.Valid {
		value := originalID.Int64
		originalPointer = &value
	}
	var keyPointer *string
	if correctionKey.Valid {
		value := correctionKey.String
		keyPointer = &value
	}
	line, err := orders.CurrentCorrectionLine(ctx, db, orderID, keyPointer, originalPointer)
	if err != nil || line.Quantity <= 0 {
		return orders.CorrectionResult{}, &Error{"linea_inexistente", "El producto ya no forma parte de la orden"}
	}
	quantity := line.Quantity
	line.Quantity = 0
	result, err := orders.Correct(ctx, db, orders.CorrectionInput{
		OrderID: orderID, Key: "cocina-cancelar-" + intString(commandLineID), Reason: &reason,
		Lines: []orders.CorrectionLine{line},
	}, employeeID, orders.CorrectionOptions{InventoryPolicy: inventoryPolicy, Origin: "cocina"})
	if err != nil {
		return orders.CorrectionResult{}, translateOrderError(err)
	}
	now := timestamp()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return orders.CorrectionResult{}, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `
		INSERT OR IGNORE INTO cancelaciones_productos_cocina
			(orden_id, correccion_id, linea_clave, producto_id, cantidad, empleado_id, motivo, creada_en)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, orderID, result.CorrectionID, line.LineKey, line.ProductID,
		quantity, employeeID, reason, now); err != nil {
		return orders.CorrectionResult{}, err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE cocina_incidencias SET estado = 'eliminada', respondida_en = ?
		WHERE orden_id = ? AND estado = 'pendiente'
		AND (comanda_linea_id IS NULL OR comanda_linea_id = ?)`, now, orderID, commandLineID); err != nil {
		return orders.CorrectionResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return orders.CorrectionResult{}, err
	}
	return result, nil
}

func ListKitchenUpdates(ctx context.Context, db *sql.DB) ([]KitchenUpdate, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT cp.id, cp.orden_id, m.numero, cu.tipo_servicio, cu.numero_servicio,
		       cu.cliente_nombre, p.nombre, cp.cantidad, cp.motivo, e.nombre, cp.creada_en
		FROM cancelaciones_productos_cocina cp
		JOIN ordenes o ON o.id = cp.orden_id
		JOIN cuentas cu ON cu.id = o.cuenta_id
		JOIN mesas m ON m.id = cu.mesa_id
		JOIN productos p ON p.id = cp.producto_id
		JOIN empleados e ON e.id = cp.empleado_id
		JOIN jornadas_operativas jo ON jo.id = cu.jornada_id
		WHERE cp.reconocida_en IS NULL AND jo.estado = 'abierta'
		ORDER BY cp.creada_en DESC, cp.id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	updates := []KitchenUpdate{}
	for rows.Next() {
		var update KitchenUpdate
		var serviceNumber sql.NullInt64
		var customer sql.NullString
		if err := rows.Scan(&update.ID, &update.OrderID, &update.Table, &update.ServiceType, &serviceNumber,
			&customer, &update.Product, &update.Quantity, &update.Reason, &update.Kitchen, &update.CreatedAt); err != nil {
			return nil, err
		}
		if serviceNumber.Valid {
			value := int(serviceNumber.Int64)
			update.ServiceNumber = &value
		}
		if customer.Valid {
			value := customer.String
			update.CustomerName = &value
		}
		updates = append(updates, update)
	}
	return updates, rows.Err()
}

func RecognizeKitchenUpdate(ctx context.Context, db *sql.DB, id, employeeID int64) (KitchenUpdate, error) {
	updates, err := ListKitchenUpdates(ctx, db)
	if err != nil {
		return KitchenUpdate{}, err
	}
	var selected *KitchenUpdate
	for index := range updates {
		if updates[index].ID == id {
			selected = &updates[index]
			break
		}
	}
	if selected == nil {
		return KitchenUpdate{}, &Error{"linea_inexistente", "La actualización ya fue reconocida o no existe"}
	}
	result, err := db.ExecContext(ctx, `
		UPDATE cancelaciones_productos_cocina
		SET reconocida_en = ?, reconocida_por_empleado_id = ?
		WHERE id = ? AND reconocida_en IS NULL`, timestamp(), employeeID, id)
	if err != nil {
		return KitchenUpdate{}, err
	}
	affected, err := result.RowsAffected()
	if err != nil || affected != 1 {
		return KitchenUpdate{}, &Error{"linea_inexistente", "La actualización ya fue reconocida o no existe"}
	}
	return *selected, nil
}
