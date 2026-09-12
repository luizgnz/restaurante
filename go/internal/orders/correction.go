package orders

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
)

type CorrectionLine struct {
	LineKey     string  `json:"lineaClave"`
	ProductID   int64   `json:"productoId"`
	OrderLineID *int64  `json:"ordenLineaId"`
	Quantity    float64 `json:"cantidad"`
	Note        *string `json:"nota"`
}

type CorrectionInput struct {
	OrderID      int64            `json:"-"`
	Key          string           `json:"claveIdempotencia"`
	Lines        []CorrectionLine `json:"lineas"`
	Instructions *string          `json:"indicaciones"`
	Reason       *string          `json:"motivo"`
	PIN          *string          `json:"pin"`
}

type CorrectionOptions struct {
	InventoryPolicy string
	Origin          string
}

type CorrectionResult struct {
	OrderID      int64    `json:"ordenId"`
	CorrectionID int64    `json:"correccionId"`
	CommandID    int64    `json:"comandaId"`
	Repeated     bool     `json:"repetida"`
	Warnings     []string `json:"avisos"`
}

type currentLine struct {
	key         string
	orderLineID *int64
	productID   int64
	name        string
	quantity    float64
	price       int64
	note        *string
}

type difference struct {
	before currentLine
	after  CorrectionLine
	delta  float64
	name   string
	price  int64
}

func Correct(ctx context.Context, db *sql.DB, input CorrectionInput, employeeID int64, options CorrectionOptions) (CorrectionResult, error) {
	input.Key = strings.TrimSpace(input.Key)
	if input.Key == "" {
		return CorrectionResult{}, &Error{"clave_idempotencia_requerida", "Hace falta una clave de idempotencia"}
	}
	if input.OrderID < 1 {
		return CorrectionResult{}, &Error{"orden_inexistente", "Orden inexistente"}
	}
	if len(input.Key) > 500 || input.Instructions != nil && len(*input.Instructions) > 500 || input.Reason != nil && len(*input.Reason) > 500 {
		return CorrectionResult{}, &Error{"texto_largo", "Ese texto supera 500 caracteres"}
	}
	if options.Origin == "" {
		options.Origin = "mesero"
	}
	if options.Origin != "mesero" && options.Origin != "cocina" && options.Origin != "incidencia" {
		return CorrectionResult{}, &Error{"origen_invalido", "Origen de corrección inválido"}
	}
	if options.InventoryPolicy != "descuento_al_enviar" && options.InventoryPolicy != "reserva_al_enviar_firme_al_precuenta" && options.InventoryPolicy != "reserva_al_enviar_firme_al_enviar_caja" {
		options.InventoryPolicy = "reserva_al_enviar_firme_al_enviar_caja"
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return CorrectionResult{}, err
	}
	defer tx.Rollback()

	if result, found, err := repeatedCorrection(ctx, tx, input.OrderID, input.Key); err != nil {
		return CorrectionResult{}, err
	} else if found {
		if err := tx.Commit(); err != nil {
			return CorrectionResult{}, err
		}
		return result, nil
	}

	var orderNumber int
	var orderState string
	var accountID, tableNumber, journeyID int64
	var accountState, serviceType string
	err = tx.QueryRowContext(ctx, `
		SELECT o.numero, o.estado, o.cuenta_id, c.estado, c.tipo_servicio, m.numero, c.jornada_id
		FROM ordenes o
		JOIN cuentas c ON c.id = o.cuenta_id
		JOIN mesas m ON m.id = c.mesa_id
		WHERE o.id = ?`, input.OrderID).Scan(
		&orderNumber, &orderState, &accountID, &accountState, &serviceType, &tableNumber, &journeyID,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return CorrectionResult{}, &Error{"orden_inexistente", "Orden inexistente"}
	}
	if err != nil {
		return CorrectionResult{}, err
	}
	if orderState == "anulada" {
		return CorrectionResult{}, &Error{"orden_anulada", "La orden ya está anulada"}
	}
	if accountState == "en_caja" || accountState == "cancelada" {
		return CorrectionResult{}, &Error{"cuenta_cerrada", "La cuenta ya no acepta cambios"}
	}
	var employeeName string
	if err := tx.QueryRowContext(ctx, "SELECT nombre FROM empleados WHERE id = ? AND activo = 1", employeeID).Scan(&employeeName); err != nil {
		return CorrectionResult{}, &Error{"empleado_inexistente", "Empleado inexistente"}
	}

	current, currentInstructions, err := currentOrder(ctx, tx, input.OrderID)
	if err != nil {
		return CorrectionResult{}, err
	}
	differences, err := correctionDifferences(ctx, tx, input.OrderID, current, input.Lines)
	if err != nil {
		return CorrectionResult{}, err
	}
	instructionsChanged := input.Instructions != nil && textValue(clean(input.Instructions)) != textValue(clean(currentInstructions))
	if len(differences) == 0 && !instructionsChanged {
		return CorrectionResult{}, &Error{"correccion_sin_cambios", "La corrección no cambia cantidades, notas ni indicaciones"}
	}

	final := map[string]float64{}
	for _, line := range current {
		final[line.key] = line.quantity
	}
	cancels := false
	for _, diff := range differences {
		final[diff.after.LineKey] = diff.after.Quantity
		if diff.before.quantity > 0 && diff.after.Quantity == 0 {
			cancels = true
		}
	}
	orderAtZero := len(final) > 0
	for _, quantity := range final {
		if quantity > 0 {
			orderAtZero = false
			break
		}
	}
	reason := clean(input.Reason)
	if (cancels || orderAtZero) && reason == nil {
		return CorrectionResult{}, &Error{"justificacion_requerida", "Hay que seleccionar por qué se anula"}
	}
	if options.Origin == "mesero" {
		started, err := orderStarted(ctx, tx, input.OrderID)
		if err != nil {
			return CorrectionResult{}, err
		}
		if started {
			return CorrectionResult{}, &Error{"orden_en_preparacion", "Cocina ya inició esta orden: solo Cocina puede cancelar sus productos"}
		}
		if orderAtZero && serviceType == "para_llevar" {
			allowed, err := employeeHasRole(ctx, tx, employeeID, "administrador", "encargado_turno")
			if err != nil {
				return CorrectionResult{}, err
			}
			if !allowed {
				return CorrectionResult{}, &Error{"sin_derecho", "Cancelar un pedido para llevar requiere Administración o encargado de turno"}
			}
		}
	}
	for _, diff := range differences {
		if diff.delta >= 0 {
			if options.Origin == "cocina" {
				return CorrectionResult{}, &Error{"cambio_cocina_invalido", "Cocina solo puede cancelar por completo un producto que ya empezó"}
			}
			continue
		}
		prepared, err := linePrepared(ctx, tx, input.OrderID, diff.after.LineKey, diff.before.orderLineID)
		if err != nil {
			return CorrectionResult{}, err
		}
		if options.Origin == "cocina" && !prepared {
			return CorrectionResult{}, &Error{"producto_no_iniciado", diff.name + " todavía no empezó: debe cancelarlo el mesero"}
		}
		if prepared && options.Origin == "mesero" {
			return CorrectionResult{}, &Error{"linea_preparada", diff.name + " ya está en preparación: debe cancelarlo Cocina"}
		}
		if options.Origin == "cocina" && (diff.after.Quantity != 0 || !sameText(diff.before.note, diff.after.Note)) {
			return CorrectionResult{}, &Error{"cambio_cocina_invalido", "Cocina solo puede cancelar por completo un producto que ya empezó"}
		}
	}
	if options.Origin == "cocina" && instructionsChanged {
		return CorrectionResult{}, &Error{"cambio_cocina_invalido", "Cocina no puede cambiar las indicaciones desde una cancelación"}
	}

	if err := checkPositiveCorrectionStock(ctx, tx, differences); err != nil {
		return CorrectionResult{}, err
	}
	if err := validateCorrectionTrace(ctx, tx, input.OrderID, differences); err != nil {
		return CorrectionResult{}, err
	}

	var previousVersion int
	if err := tx.QueryRowContext(ctx, "SELECT COALESCE(MAX(numero_version), 0) FROM orden_correcciones WHERE orden_id = ?", input.OrderID).Scan(&previousVersion); err != nil {
		return CorrectionResult{}, err
	}
	now := timestamp()
	var storedInstructions any
	if instructionsChanged {
		if cleaned := clean(input.Instructions); cleaned != nil {
			storedInstructions = *cleaned
		} else {
			storedInstructions = ""
		}
	}
	correctionResult, err := tx.ExecContext(ctx, `
		INSERT INTO orden_correcciones
			(orden_id, numero_version, motivo, indicaciones, es_anulacion, creada_por_empleado_id, creada_en, clave_idempotencia)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		input.OrderID, previousVersion+1, reason, storedInstructions, boolInt(cancels), employeeID, now, input.Key)
	if err != nil {
		return CorrectionResult{}, err
	}
	correctionID, err := correctionResult.LastInsertId()
	if err != nil {
		return CorrectionResult{}, err
	}

	correctionLineIDs := []int64{}
	for _, diff := range differences {
		lineResult, err := tx.ExecContext(ctx, `
			INSERT INTO orden_correccion_lineas
				(correccion_id, orden_linea_id, producto_id, cantidad_anterior, cantidad_nueva, nota_anterior, nota_nueva, linea_clave, precio_centavos)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			correctionID, nullableInt(diff.before.orderLineID), diff.after.ProductID, diff.before.quantity,
			diff.after.Quantity, clean(diff.before.note), clean(diff.after.Note), diff.after.LineKey, diff.price)
		if err != nil {
			return CorrectionResult{}, err
		}
		lineID, _ := lineResult.LastInsertId()
		correctionLineIDs = append(correctionLineIDs, lineID)
	}
	if err := applyCorrectionInventory(ctx, tx, input.OrderID, differences, options.InventoryPolicy); err != nil {
		return CorrectionResult{}, err
	}
	state := "corregida"
	commandType := "correccion"
	if orderAtZero {
		state = "anulada"
		commandType = "anulacion"
	}
	if _, err := tx.ExecContext(ctx, "UPDATE ordenes SET estado = ? WHERE id = ?", state, input.OrderID); err != nil {
		return CorrectionResult{}, err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE precuentas SET vigente = 0 WHERE cuenta_id = ?", accountID); err != nil {
		return CorrectionResult{}, err
	}
	if accountState == "precuenta_emitida" {
		if _, err := tx.ExecContext(ctx, "UPDATE cuentas SET estado = 'abierta' WHERE id = ?", accountID); err != nil {
			return CorrectionResult{}, err
		}
	}
	commandResult, err := tx.ExecContext(ctx, `
		INSERT INTO comandas (pedido_id, envio_n, mesero_id, creada_en, orden_id, correccion_id, tipo, jornada_id)
		VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)`, previousVersion+1, employeeID, now, input.OrderID, correctionID, commandType, journeyID)
	if err != nil {
		return CorrectionResult{}, err
	}
	commandID, _ := commandResult.LastInsertId()
	for index, lineID := range correctionLineIDs {
		stage := "aviso"
		if differences[index].delta > 0 {
			stage = "por_preparar"
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO comanda_lineas
				(comanda_id, pedido_linea_id, orden_linea_id, orden_correccion_linea_id, etapa, etapa_actualizada_en)
			VALUES (?, NULL, NULL, ?, ?, ?)`, commandID, lineID, stage, now); err != nil {
			return CorrectionResult{}, err
		}
	}
	for _, diff := range differences {
		if diff.before.quantity > 0 && diff.after.Quantity == 0 {
			if err := cancelKitchenLines(ctx, tx, input.OrderID, diff.after.LineKey, options.Origin == "cocina", now); err != nil {
				return CorrectionResult{}, err
			}
		}
	}
	if cancels {
		summary := correctionSummary(differences, orderAtZero)
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO auditoria_anulaciones
				(cuenta_id, orden_id, correccion_id, mesa_numero, orden_numero, empleado_id, resumen, justificacion, creada_en)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, accountID, input.OrderID, correctionID, tableNumber,
			orderNumber, employeeID, summary, reason, now); err != nil {
			return CorrectionResult{}, err
		}
	}
	ticketDifferences := make([]map[string]any, 0, len(differences))
	for _, item := range differences {
		ticketDifferences = append(ticketDifferences, map[string]any{
			"nombre": item.name, "delta": item.delta,
			"cantidadAnterior": item.before.quantity, "cantidadNueva": item.after.Quantity,
			"notaAnterior": item.before.note, "notaNueva": item.after.Note,
		})
	}
	payload, _ := json.Marshal(map[string]any{
		"mesaNumero": tableNumber, "ordenNumero": orderNumber, "mesero": employeeName,
		"esAnulacion": orderAtZero, "indicaciones": clean(input.Instructions), "lineas": ticketDifferences,
	})
	if _, err := tx.ExecContext(ctx,
		"INSERT INTO print_jobs (kind, payload, status, attempts, created_en) VALUES ('correccion', ?, 'queued', 0, ?)",
		string(payload), now); err != nil {
		return CorrectionResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return CorrectionResult{}, err
	}
	return CorrectionResult{input.OrderID, correctionID, commandID, false, []string{}}, nil
}

// LinesForCancellation construye la anulación desde la versión vigente, nunca
// desde el cuerpo del cliente ni desde la primera versión de la orden.
func LinesForCancellation(ctx context.Context, db *sql.DB, orderID int64) ([]CorrectionLine, error) {
	tx, err := db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	lines, _, err := currentOrder(ctx, tx, orderID)
	if err != nil {
		return nil, err
	}
	if len(lines) == 0 {
		return nil, &Error{"orden_inexistente", "Orden inexistente"}
	}
	result := make([]CorrectionLine, 0, len(lines))
	for _, line := range lines {
		result = append(result, CorrectionLine{
			LineKey: line.key, ProductID: line.productID, OrderLineID: line.orderLineID,
			Quantity: 0, Note: line.note,
		})
	}
	return result, tx.Commit()
}

// CurrentCorrectionLine localiza una línea vigente por su clave o por el id de
// la línea original. La usan las incidencias sin exponer el modelo interno.
func CurrentCorrectionLine(ctx context.Context, db *sql.DB, orderID int64, lineKey *string, originalID *int64) (CorrectionLine, error) {
	tx, err := db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return CorrectionLine{}, err
	}
	defer tx.Rollback()
	lines, _, err := currentOrder(ctx, tx, orderID)
	if err != nil {
		return CorrectionLine{}, err
	}
	for _, line := range lines {
		matchesKey := lineKey != nil && line.key == *lineKey
		matchesID := originalID != nil && line.orderLineID != nil && *line.orderLineID == *originalID
		if matchesKey || matchesID {
			return CorrectionLine{LineKey: line.key, ProductID: line.productID, OrderLineID: line.orderLineID, Quantity: line.quantity, Note: line.note}, tx.Commit()
		}
	}
	return CorrectionLine{}, &Error{"linea_inexistente", "El producto ya no forma parte de la orden"}
}

func repeatedCorrection(ctx context.Context, tx *sql.Tx, orderID int64, key string) (CorrectionResult, bool, error) {
	var correctionID, commandID int64
	err := tx.QueryRowContext(ctx, `
		SELECT oc.id, c.id
		FROM orden_correcciones oc
		JOIN comandas c ON c.correccion_id = oc.id
		WHERE oc.orden_id = ? AND oc.clave_idempotencia = ?`, orderID, key).Scan(&correctionID, &commandID)
	if errors.Is(err, sql.ErrNoRows) {
		return CorrectionResult{}, false, nil
	}
	if err != nil {
		return CorrectionResult{}, false, err
	}
	return CorrectionResult{orderID, correctionID, commandID, true, []string{}}, true, nil
}

func currentOrder(ctx context.Context, tx *sql.Tx, orderID int64) ([]currentLine, *string, error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT ol.id, ol.producto_id, p.nombre, ol.cantidad, ol.precio_centavos, ol.nota, ol.linea_clave
		FROM orden_lineas ol JOIN productos p ON p.id = ol.producto_id
		WHERE ol.orden_id = ? ORDER BY ol.id`, orderID)
	if err != nil {
		return nil, nil, err
	}
	lines := map[string]currentLine{}
	keys := []string{}
	for rows.Next() {
		var line currentLine
		var lineID int64
		var note sql.NullString
		if err := rows.Scan(&lineID, &line.productID, &line.name, &line.quantity, &line.price, &note, &line.key); err != nil {
			rows.Close()
			return nil, nil, err
		}
		line.orderLineID = &lineID
		if note.Valid {
			value := note.String
			line.note = &value
		}
		lines[line.key] = line
		keys = append(keys, line.key)
	}
	if err := rows.Close(); err != nil {
		return nil, nil, err
	}
	changes, err := tx.QueryContext(ctx, `
		SELECT ocl.producto_id, p.nombre, ocl.cantidad_nueva, ocl.precio_centavos, ocl.nota_nueva, ocl.linea_clave
		FROM orden_correcciones oc
		JOIN orden_correccion_lineas ocl ON ocl.correccion_id = oc.id
		JOIN productos p ON p.id = ocl.producto_id
		WHERE oc.orden_id = ? ORDER BY oc.numero_version, ocl.id`, orderID)
	if err != nil {
		return nil, nil, err
	}
	for changes.Next() {
		var line currentLine
		var note sql.NullString
		if err := changes.Scan(&line.productID, &line.name, &line.quantity, &line.price, &note, &line.key); err != nil {
			changes.Close()
			return nil, nil, err
		}
		if previous, ok := lines[line.key]; ok {
			line.orderLineID = previous.orderLineID
		} else {
			keys = append(keys, line.key)
		}
		if note.Valid {
			value := note.String
			line.note = &value
		}
		lines[line.key] = line
	}
	if err := changes.Close(); err != nil {
		return nil, nil, err
	}
	result := make([]currentLine, 0, len(keys))
	for _, key := range keys {
		result = append(result, lines[key])
	}
	var instructions sql.NullString
	err = tx.QueryRowContext(ctx, `
		SELECT indicaciones FROM orden_correcciones
		WHERE orden_id = ? AND indicaciones IS NOT NULL
		ORDER BY numero_version DESC LIMIT 1`, orderID).Scan(&instructions)
	if errors.Is(err, sql.ErrNoRows) {
		err = tx.QueryRowContext(ctx, "SELECT indicaciones FROM ordenes WHERE id = ?", orderID).Scan(&instructions)
	}
	if err != nil {
		return nil, nil, err
	}
	if instructions.Valid && strings.TrimSpace(instructions.String) != "" {
		value := instructions.String
		return result, &value, nil
	}
	return result, nil, nil
}

func correctionDifferences(ctx context.Context, tx *sql.Tx, orderID int64, current []currentLine, requested []CorrectionLine) ([]difference, error) {
	byKey := map[string]currentLine{}
	for _, line := range current {
		byKey[line.key] = line
	}
	seen := map[string]bool{}
	diffs := []difference{}
	for _, requestedLine := range requested {
		requestedLine.LineKey = strings.TrimSpace(requestedLine.LineKey)
		if requestedLine.LineKey == "" {
			return nil, &Error{"linea_sin_clave", "Cada línea necesita su lineaClave"}
		}
		if seen[requestedLine.LineKey] {
			return nil, &Error{"linea_duplicada", "lineaClave repetida: " + requestedLine.LineKey}
		}
		seen[requestedLine.LineKey] = true
		if requestedLine.ProductID < 1 || requestedLine.Quantity < 0 || math.IsNaN(requestedLine.Quantity) || math.IsInf(requestedLine.Quantity, 0) {
			return nil, &Error{"cantidad_invalida", "Cantidad inválida"}
		}
		if requestedLine.Note != nil && len(*requestedLine.Note) > 500 {
			return nil, &Error{"texto_largo", "Ese texto supera 500 caracteres"}
		}
		before, exists := byKey[requestedLine.LineKey]
		if !exists {
			if requestedLine.OrderLineID != nil {
				return nil, &Error{"linea_desalineada", "ordenLineaId no corresponde a una línea de la orden"}
			}
			if requestedLine.Quantity == 0 {
				return nil, &Error{"linea_agregada_en_cero", "Una línea nueva no puede agregarse en cero"}
			}
			var other int
			err := tx.QueryRowContext(ctx, `
				SELECT EXISTS(
					SELECT 1 FROM orden_lineas WHERE linea_clave = ? AND orden_id != ?
					UNION ALL
					SELECT 1 FROM orden_correccion_lineas ocl JOIN orden_correcciones oc ON oc.id = ocl.correccion_id
					WHERE ocl.linea_clave = ? AND oc.orden_id != ?
				)`, requestedLine.LineKey, orderID, requestedLine.LineKey, orderID).Scan(&other)
			if err != nil {
				return nil, err
			}
			if other == 1 {
				return nil, &Error{"linea_de_otra_orden", "Esa lineaClave pertenece a otra orden"}
			}
		} else {
			if requestedLine.OrderLineID != nil && (before.orderLineID == nil || *requestedLine.OrderLineID != *before.orderLineID) {
				return nil, &Error{"linea_desalineada", "ordenLineaId no corresponde a esa lineaClave"}
			}
			if requestedLine.ProductID != before.productID {
				return nil, &Error{"producto_desalineado", "El producto no corresponde a esa lineaClave"}
			}
		}
		var name string
		var catalogPrice int64
		if err := tx.QueryRowContext(ctx, "SELECT nombre, precio_centavos FROM productos WHERE id = ?", requestedLine.ProductID).Scan(&name, &catalogPrice); errors.Is(err, sql.ErrNoRows) {
			return nil, &Error{"producto_inexistente", "Producto inexistente"}
		} else if err != nil {
			return nil, err
		}
		if exists {
			catalogPrice = before.price
		}
		delta := requestedLine.Quantity - before.quantity
		if delta == 0 && sameText(before.note, requestedLine.Note) {
			continue
		}
		diffs = append(diffs, difference{before: before, after: requestedLine, delta: delta, name: name, price: catalogPrice})
	}
	return diffs, nil
}

func checkPositiveCorrectionStock(ctx context.Context, tx *sql.Tx, diffs []difference) error {
	items := []consumption{}
	for _, diff := range diffs {
		if diff.delta <= 0 {
			continue
		}
		parts, err := componentsFor(ctx, tx, diff.after.ProductID)
		if err != nil {
			return err
		}
		items = append(items, consumption{productID: diff.after.ProductID, quantity: diff.delta, components: parts})
	}
	return ensureStock(ctx, tx, items)
}

func validateCorrectionTrace(ctx context.Context, tx *sql.Tx, orderID int64, diffs []difference) error {
	for _, diff := range diffs {
		if diff.delta >= 0 || diff.before.quantity == 0 {
			continue
		}
		var rows int
		if err := tx.QueryRowContext(ctx,
			"SELECT count(*) FROM orden_linea_inventario WHERE orden_id = ? AND linea_clave = ?",
			orderID, diff.after.LineKey).Scan(&rows); err != nil {
			return err
		}
		if rows > 0 {
			continue
		}
		parts, err := componentsFor(ctx, tx, diff.after.ProductID)
		if err != nil {
			return err
		}
		if len(parts) > 0 {
			return &Error{"inventario_sin_trazabilidad", "Sin libro de inventario para: " + diff.after.LineKey}
		}
	}
	return nil
}

func applyCorrectionInventory(ctx context.Context, tx *sql.Tx, orderID int64, diffs []difference, policy string) error {
	for _, diff := range diffs {
		if diff.delta == 0 {
			continue
		}
		type ledger struct {
			productID        int64
			perUnit          float64
			reserved, firmed float64
		}
		ledgerRows := []ledger{}
		rows, err := tx.QueryContext(ctx, `
			SELECT producto_id, cantidad_por_unidad, reservada_real, firmada_real
			FROM orden_linea_inventario WHERE orden_id = ? AND linea_clave = ?`, orderID, diff.after.LineKey)
		if err != nil {
			return err
		}
		for rows.Next() {
			var row ledger
			if err := rows.Scan(&row.productID, &row.perUnit, &row.reserved, &row.firmed); err != nil {
				rows.Close()
				return err
			}
			ledgerRows = append(ledgerRows, row)
		}
		if err := rows.Close(); err != nil {
			return err
		}
		if diff.delta > 0 {
			if len(ledgerRows) == 0 {
				parts, err := componentsFor(ctx, tx, diff.after.ProductID)
				if err != nil {
					return err
				}
				for _, part := range parts {
					ledgerRows = append(ledgerRows, ledger{productID: part.productID, perUnit: part.perUnit})
				}
			}
			for _, row := range ledgerRows {
				amount := row.perUnit * diff.delta
				if _, err := tx.ExecContext(ctx, "INSERT INTO stock (producto_id, on_hand_real, reserved_real) VALUES (?, 0, 0) ON CONFLICT(producto_id) DO NOTHING", row.productID); err != nil {
					return err
				}
				reservedDelta, firmedDelta := amount, float64(0)
				if policy == "descuento_al_enviar" {
					reservedDelta, firmedDelta = 0, amount
					if _, err := tx.ExecContext(ctx, "UPDATE stock SET on_hand_real = on_hand_real - ? WHERE producto_id = ?", amount, row.productID); err != nil {
						return err
					}
				} else if _, err := tx.ExecContext(ctx, "UPDATE stock SET reserved_real = reserved_real + ? WHERE producto_id = ?", amount, row.productID); err != nil {
					return err
				}
				if _, err := tx.ExecContext(ctx, `
					INSERT INTO orden_linea_inventario
						(orden_id, linea_clave, producto_id, cantidad_por_unidad, reservada_real, firmada_real)
					VALUES (?, ?, ?, ?, ?, ?)
					ON CONFLICT(orden_id, linea_clave, producto_id) DO UPDATE SET
						reservada_real = reservada_real + excluded.reservada_real,
						firmada_real = firmada_real + excluded.firmada_real`,
					orderID, diff.after.LineKey, row.productID, row.perUnit, reservedDelta, firmedDelta); err != nil {
					return err
				}
			}
			continue
		}
		for _, row := range ledgerRows {
			amount := row.perUnit * -diff.delta
			fromReserved := math.Min(row.reserved, amount)
			fromFirmed := math.Min(row.firmed, amount-fromReserved)
			if _, err := tx.ExecContext(ctx,
				"UPDATE stock SET reserved_real = reserved_real - ?, on_hand_real = on_hand_real + ? WHERE producto_id = ?",
				fromReserved, fromFirmed, row.productID); err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx, `
				UPDATE orden_linea_inventario
				SET reservada_real = reservada_real - ?, firmada_real = firmada_real - ?
				WHERE orden_id = ? AND linea_clave = ? AND producto_id = ?`,
				fromReserved, fromFirmed, orderID, diff.after.LineKey, row.productID); err != nil {
				return err
			}
		}
	}
	return nil
}

func orderStarted(ctx context.Context, tx *sql.Tx, orderID int64) (bool, error) {
	var count int
	err := tx.QueryRowContext(ctx, `
		SELECT count(*) FROM comanda_lineas cl
		JOIN comandas c ON c.id = cl.comanda_id
		WHERE c.orden_id = ? AND cl.etapa IN ('en_proceso', 'listo', 'servido')`, orderID).Scan(&count)
	return count > 0, err
}

func linePrepared(ctx context.Context, tx *sql.Tx, orderID int64, lineKey string, orderLineID *int64) (bool, error) {
	id := int64(-1)
	if orderLineID != nil {
		id = *orderLineID
	}
	var count int
	err := tx.QueryRowContext(ctx, `
		SELECT count(*) FROM comanda_lineas cl
		JOIN comandas c ON c.id = cl.comanda_id
		LEFT JOIN orden_correccion_lineas ocl ON ocl.id = cl.orden_correccion_linea_id
		WHERE c.orden_id = ? AND (cl.orden_linea_id = ? OR ocl.linea_clave = ?)
		  AND cl.etapa IN ('en_proceso', 'listo', 'servido')`, orderID, id, lineKey).Scan(&count)
	return count > 0, err
}

func cancelKitchenLines(ctx context.Context, tx *sql.Tx, orderID int64, lineKey string, includeFinished bool, now string) error {
	stages := "'por_preparar','en_proceso'"
	if includeFinished {
		stages += ",'listo','servido'"
	}
	_, err := tx.ExecContext(ctx, `
		UPDATE comanda_lineas SET etapa = 'cancelado', etapa_actualizada_en = ?
		WHERE id IN (
			SELECT cl.id FROM comanda_lineas cl
			JOIN comandas c ON c.id = cl.comanda_id
			LEFT JOIN orden_lineas ol ON ol.id = cl.orden_linea_id
			LEFT JOIN orden_correccion_lineas ocl ON ocl.id = cl.orden_correccion_linea_id
			WHERE c.orden_id = ? AND (ol.linea_clave = ? OR ocl.linea_clave = ?)
			  AND cl.etapa IN (`+stages+`)
		)`, now, orderID, lineKey, lineKey)
	return err
}

func employeeHasRole(ctx context.Context, tx *sql.Tx, employeeID int64, roles ...string) (bool, error) {
	rows, err := tx.QueryContext(ctx, "SELECT rol_clave FROM empleado_roles WHERE empleado_id = ?", employeeID)
	if err != nil {
		return false, err
	}
	defer rows.Close()
	for rows.Next() {
		var current string
		if err := rows.Scan(&current); err != nil {
			return false, err
		}
		for _, allowed := range roles {
			if current == allowed {
				return true, nil
			}
		}
	}
	return false, rows.Err()
}

func correctionSummary(diffs []difference, all bool) string {
	label := "Productos anulados: "
	if all {
		label = "Orden anulada: "
	}
	items := []string{}
	for _, diff := range diffs {
		if diff.before.quantity > 0 && diff.after.Quantity == 0 {
			items = append(items, fmt.Sprintf("%.2g %s", diff.before.quantity, diff.name))
		}
	}
	return label + strings.Join(items, ", ")
}

func sameText(left, right *string) bool {
	return textValue(clean(left)) == textValue(clean(right))
}

func textValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func nullableInt(value *int64) any {
	if value == nil {
		return nil
	}
	return *value
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
