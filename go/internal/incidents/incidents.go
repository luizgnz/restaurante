package incidents

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/luizgnz/restaurante/go/internal/orders"
)

type Error struct{ Code, Message string }

func (err *Error) Error() string { return err.Message }

type Item struct {
	ID                   int64   `json:"id"`
	CommandID            int64   `json:"comandaId"`
	OrderID              int64   `json:"ordenId"`
	CommandLineID        *int64  `json:"comandaLineaId"`
	Type                 string  `json:"tipo"`
	Scope                string  `json:"alcance"`
	Reason               string  `json:"motivo"`
	Proposal             *string `json:"propuesta"`
	State                string  `json:"estado"`
	CreatedAt            string  `json:"creadaEn"`
	RespondedAt          *string `json:"respondidaEn"`
	Table                int     `json:"mesa"`
	OrderNumber          int     `json:"ordenNumero"`
	Product              *string `json:"producto"`
	ReplacementProductID *int64  `json:"productoReemplazoId"`
	ReplacementProduct   *string `json:"productoReemplazo"`
}

type CreateInput struct {
	CommandID            int64   `json:"comandaId"`
	CommandLineID        *int64  `json:"comandaLineaId"`
	Type                 string  `json:"tipo"`
	Scope                string  `json:"alcance"`
	Reason               string  `json:"motivo"`
	Proposal             *string `json:"propuesta"`
	ReplacementProductID *int64  `json:"productoReemplazoId"`
}

func ListPending(ctx context.Context, db *sql.DB) ([]Item, error) {
	rows, err := db.QueryContext(ctx, incidentSelect+`
		JOIN comandas co ON co.id = i.comanda_id
		JOIN jornadas_operativas j ON j.id = co.jornada_id AND j.estado = 'abierta'
		WHERE i.estado = 'pendiente' ORDER BY i.id DESC`)
	if err != nil {
		return nil, err
	}
	return scanItems(rows)
}

func Create(ctx context.Context, db *sql.DB, input CreateInput) (Item, error) {
	input.Reason = strings.TrimSpace(input.Reason)
	if input.Type != "rechazo" && input.Type != "sugerencia" {
		return Item{}, &Error{"tipo_invalido", "Tipo de solicitud inválido"}
	}
	if input.Scope != "linea" && input.Scope != "orden" {
		return Item{}, &Error{"alcance_invalido", "Alcance inválido"}
	}
	if input.Reason == "" {
		return Item{}, &Error{"motivo_requerido", "Hace falta motivo"}
	}
	if len(input.Reason) > 500 {
		return Item{}, &Error{"texto_largo", "El texto supera 500 caracteres"}
	}
	if input.Type == "sugerencia" {
		input.Proposal = cleaned(input.Proposal)
		if input.Proposal == nil {
			return Item{}, &Error{"propuesta_requerida", "Hace falta propuesta"}
		}
		if len(*input.Proposal) > 500 {
			return Item{}, &Error{"texto_largo", "El texto supera 500 caracteres"}
		}
	} else {
		input.Proposal = nil
		input.ReplacementProductID = nil
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Item{}, err
	}
	defer tx.Rollback()
	var orderID int64
	var commandType string
	err = tx.QueryRowContext(ctx, `
		SELECT c.orden_id, c.tipo FROM comandas c
		JOIN jornadas_operativas j ON j.id = c.jornada_id AND j.estado = 'abierta'
		WHERE c.id = ?`, input.CommandID).Scan(&orderID, &commandType)
	if errors.Is(err, sql.ErrNoRows) || orderID == 0 || commandType != "orden" {
		return Item{}, &Error{"comanda_no_gestionable", "Esta comanda no admite solicitudes nuevas"}
	}
	if err != nil {
		return Item{}, err
	}
	var commandLine any
	if input.Scope == "linea" {
		if input.CommandLineID == nil {
			return Item{}, &Error{"linea_requerida", "Selecciona un producto"}
		}
		var originalLineID, productID int64
		var stage string
		err := tx.QueryRowContext(ctx, `
			SELECT cl.orden_linea_id, cl.etapa, ol.producto_id
			FROM comanda_lineas cl JOIN orden_lineas ol ON ol.id = cl.orden_linea_id
			WHERE cl.id = ? AND cl.comanda_id = ?`, *input.CommandLineID, input.CommandID).
			Scan(&originalLineID, &stage, &productID)
		if errors.Is(err, sql.ErrNoRows) {
			return Item{}, &Error{"linea_inexistente", "El producto no pertenece a la orden"}
		}
		if err != nil {
			return Item{}, err
		}
		if stage != "por_preparar" && stage != "en_proceso" && stage != "listo" {
			return Item{}, &Error{"producto_ya_iniciado", "El producto ya no admite una incidencia"}
		}
		if input.ReplacementProductID != nil {
			if *input.ReplacementProductID == productID {
				return Item{}, &Error{"reemplazo_invalido", "El reemplazo debe ser un producto diferente"}
			}
			var exists int
			err := tx.QueryRowContext(ctx, "SELECT 1 FROM productos WHERE id = ? AND activo = 1 AND disponible_en_pos = 1", *input.ReplacementProductID).Scan(&exists)
			if errors.Is(err, sql.ErrNoRows) {
				return Item{}, &Error{"reemplazo_invalido", "El producto de reemplazo no está disponible"}
			}
			if err != nil {
				return Item{}, err
			}
		}
		commandLine = *input.CommandLineID
	} else {
		var total, started int
		if err := tx.QueryRowContext(ctx, `
			SELECT count(*), COALESCE(SUM(CASE WHEN etapa NOT IN ('por_preparar','cancelado') THEN 1 ELSE 0 END), 0)
			FROM comanda_lineas WHERE comanda_id = ? AND orden_linea_id IS NOT NULL`, input.CommandID).
			Scan(&total, &started); err != nil {
			return Item{}, err
		}
		if total == 0 {
			return Item{}, &Error{"orden_sin_productos", "La orden no tiene productos"}
		}
		if started > 0 {
			return Item{}, &Error{"orden_ya_iniciada", "La orden ya comenzó su preparación"}
		}
		commandLine = nil
		input.ReplacementProductID = nil
	}
	var pending int
	if err := tx.QueryRowContext(ctx, `
		SELECT count(*) FROM cocina_incidencias
		WHERE orden_id = ? AND estado = 'pendiente'
		AND (comanda_linea_id IS NULL OR ? IS NULL OR comanda_linea_id = ?)`,
		orderID, commandLine, commandLine).Scan(&pending); err != nil {
		return Item{}, err
	}
	if pending > 0 {
		return Item{}, &Error{"incidencia_pendiente", "Ya hay una solicitud pendiente para este pedido"}
	}
	result, err := tx.ExecContext(ctx, `
		INSERT INTO cocina_incidencias
			(comanda_id, orden_id, comanda_linea_id, tipo, alcance, motivo, propuesta, producto_reemplazo_id, estado, creada_en)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
		input.CommandID, orderID, commandLine, input.Type, input.Scope, input.Reason,
		cleaned(input.Proposal), nullableInt(input.ReplacementProductID), timestamp())
	if err != nil {
		return Item{}, err
	}
	id, _ := result.LastInsertId()
	if err := tx.Commit(); err != nil {
		return Item{}, err
	}
	return Get(ctx, db, id)
}

func AcceptReplacement(ctx context.Context, db *sql.DB, id, employeeID int64, inventoryPolicy string) (Item, *orders.CorrectionResult, error) {
	incident, err := Get(ctx, db, id)
	if err != nil {
		return Item{}, nil, err
	}
	if incident.State != "pendiente" || incident.Type != "sugerencia" {
		return Item{}, nil, &Error{"incidencia_resuelta", "La sugerencia ya fue respondida"}
	}
	var correction *orders.CorrectionResult
	if incident.Scope == "linea" && incident.CommandLineID != nil && incident.ReplacementProductID != nil {
		line, err := lineForIncident(ctx, db, incident)
		if err != nil {
			return Item{}, nil, err
		}
		reason := "Sugerencia aceptada: " + incident.Reason
		if incident.Proposal != nil {
			reason = "Sugerencia aceptada: " + *incident.Proposal
		}
		newKey := "incidencia-" + intString(id) + "-reemplazo"
		result, err := orders.Correct(ctx, db, orders.CorrectionInput{
			OrderID: incident.OrderID, Key: "incidencia-" + intString(id) + "-aceptar", Reason: &reason,
			Lines: []orders.CorrectionLine{
				{LineKey: line.LineKey, ProductID: line.ProductID, OrderLineID: line.OrderLineID, Quantity: 0, Note: line.Note},
				{LineKey: newKey, ProductID: *incident.ReplacementProductID, Quantity: line.Quantity, Note: line.Note},
			},
		}, employeeID, orders.CorrectionOptions{InventoryPolicy: inventoryPolicy, Origin: "incidencia"})
		if err != nil {
			return Item{}, nil, translateOrderError(err)
		}
		correction = &result
	}
	if _, err := db.ExecContext(ctx, "UPDATE cocina_incidencias SET estado = 'aceptada', respondida_en = ? WHERE id = ? AND estado = 'pendiente'", timestamp(), id); err != nil {
		return Item{}, nil, err
	}
	updated, err := Get(ctx, db, id)
	return updated, correction, err
}

// Reject elimina de la orden el producto que el cliente no aceptó. No muestra
// ni decide diferencias de precio: eso no forma parte de esta conversación.
func Reject(ctx context.Context, db *sql.DB, id, employeeID int64, inventoryPolicy string) (Item, *orders.CorrectionResult, error) {
	incident, err := Get(ctx, db, id)
	if err != nil {
		return Item{}, nil, err
	}
	if incident.State != "pendiente" {
		return Item{}, nil, &Error{"incidencia_resuelta", "La solicitud ya fue respondida"}
	}
	var lines []orders.CorrectionLine
	if incident.Scope == "orden" {
		lines, err = orders.LinesForCancellation(ctx, db, incident.OrderID)
	} else {
		var line orders.CorrectionLine
		line, err = lineForIncident(ctx, db, incident)
		line.Quantity = 0
		lines = []orders.CorrectionLine{line}
	}
	if err != nil {
		return Item{}, nil, translateOrderError(err)
	}
	reason := "Cliente no aceptó el reemplazo"
	result, err := orders.Correct(ctx, db, orders.CorrectionInput{
		OrderID: incident.OrderID, Key: "incidencia-" + intString(id) + "-eliminar", Reason: &reason, Lines: lines,
	}, employeeID, orders.CorrectionOptions{InventoryPolicy: inventoryPolicy, Origin: "incidencia"})
	if err != nil {
		return Item{}, nil, translateOrderError(err)
	}
	if _, err := db.ExecContext(ctx, "UPDATE cocina_incidencias SET estado = 'eliminada', respondida_en = ? WHERE id = ? AND estado = 'pendiente'", timestamp(), id); err != nil {
		return Item{}, nil, err
	}
	updated, err := Get(ctx, db, id)
	return updated, &result, err
}

func Get(ctx context.Context, db *sql.DB, id int64) (Item, error) {
	rows, err := db.QueryContext(ctx, incidentSelect+" WHERE i.id = ?", id)
	if err != nil {
		return Item{}, err
	}
	items, err := scanItems(rows)
	if err != nil {
		return Item{}, err
	}
	if len(items) == 0 {
		return Item{}, &Error{"incidencia_inexistente", "La solicitud de cocina no existe"}
	}
	return items[0], nil
}

func lineForIncident(ctx context.Context, db *sql.DB, incident Item) (orders.CorrectionLine, error) {
	if incident.CommandLineID == nil {
		return orders.CorrectionLine{}, &Error{"linea_inexistente", "El producto ya no forma parte de la orden"}
	}
	var originalID sql.NullInt64
	var correctionKey sql.NullString
	if err := db.QueryRowContext(ctx, `
		SELECT cl.orden_linea_id, ocl.linea_clave
		FROM comanda_lineas cl LEFT JOIN orden_correccion_lineas ocl ON ocl.id = cl.orden_correccion_linea_id
		WHERE cl.id = ?`, *incident.CommandLineID).Scan(&originalID, &correctionKey); err != nil {
		return orders.CorrectionLine{}, &Error{"linea_inexistente", "El producto ya no forma parte de la orden"}
	}
	var id *int64
	if originalID.Valid {
		value := originalID.Int64
		id = &value
	}
	var key *string
	if correctionKey.Valid {
		value := correctionKey.String
		key = &value
	}
	line, err := orders.CurrentCorrectionLine(ctx, db, incident.OrderID, key, id)
	if err != nil {
		return orders.CorrectionLine{}, translateOrderError(err)
	}
	return line, nil
}

const incidentSelect = `
	SELECT i.id, i.comanda_id, i.orden_id, i.comanda_linea_id, i.tipo, i.alcance,
	       i.motivo, i.propuesta, i.estado, i.creada_en, i.respondida_en,
	       m.numero, o.numero, p.nombre, i.producto_reemplazo_id, pr.nombre
	FROM cocina_incidencias i
	JOIN ordenes o ON o.id = i.orden_id
	JOIN cuentas cu ON cu.id = o.cuenta_id
	JOIN mesas m ON m.id = cu.mesa_id
	LEFT JOIN comanda_lineas cl ON cl.id = i.comanda_linea_id
	LEFT JOIN orden_lineas ol ON ol.id = cl.orden_linea_id
	LEFT JOIN productos p ON p.id = ol.producto_id
	LEFT JOIN productos pr ON pr.id = i.producto_reemplazo_id`

func scanItems(rows *sql.Rows) ([]Item, error) {
	defer rows.Close()
	items := []Item{}
	for rows.Next() {
		var item Item
		var commandLine, replacementID sql.NullInt64
		var proposal, responded, product, replacement sql.NullString
		if err := rows.Scan(&item.ID, &item.CommandID, &item.OrderID, &commandLine, &item.Type, &item.Scope,
			&item.Reason, &proposal, &item.State, &item.CreatedAt, &responded, &item.Table, &item.OrderNumber,
			&product, &replacementID, &replacement); err != nil {
			return nil, err
		}
		item.CommandLineID = intPointer(commandLine)
		item.ReplacementProductID = intPointer(replacementID)
		item.Proposal = stringPointer(proposal)
		item.RespondedAt = stringPointer(responded)
		item.Product = stringPointer(product)
		item.ReplacementProduct = stringPointer(replacement)
		items = append(items, item)
	}
	return items, rows.Err()
}

func translateOrderError(err error) error {
	var domain *orders.Error
	if errors.As(err, &domain) {
		return &Error{domain.Code, domain.Message}
	}
	return err
}

func cleaned(value *string) *string {
	if value == nil {
		return nil
	}
	clean := strings.TrimSpace(*value)
	if clean == "" {
		return nil
	}
	return &clean
}

func nullableInt(value *int64) any {
	if value == nil {
		return nil
	}
	return *value
}

func intPointer(value sql.NullInt64) *int64 {
	if !value.Valid {
		return nil
	}
	result := value.Int64
	return &result
}

func stringPointer(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	result := value.String
	return &result
}

func intString(value int64) string {
	return strconv.FormatInt(value, 10)
}

func timestamp() string {
	return time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
}
