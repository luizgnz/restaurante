// Package accounts concentra las consultas de Cuentas y Órdenes del runtime Go.
package accounts

import (
	"context"
	"database/sql"
	"errors"
	"math"
	"strconv"
	"strings"
	"time"
)

type Error struct{ Code, Message string }

func (err *Error) Error() string { return err.Message }

type Line struct {
	LineKey     string   `json:"lineaClave"`
	OrderLineID *int64   `json:"ordenLineaId"`
	ProductID   int64    `json:"productoId"`
	Name        string   `json:"nombre"`
	Quantity    float64  `json:"cantidad"`
	PriceCents  int64    `json:"precioCentavos"`
	Note        *string  `json:"nota"`
	Contours    []string `json:"contornos"`
}

type Order struct {
	ID                   int64   `json:"id"`
	Number               int     `json:"numero"`
	State                string  `json:"estado"`
	Stage                string  `json:"etapa"`
	Instructions         *string `json:"indicaciones"`
	OriginalInstructions *string `json:"indicacionesOriginales"`
	CreatedAt            string  `json:"creadaEn"`
	Employee             string  `json:"empleado"`
	Lines                []Line  `json:"lineas"`
}

type Table struct {
	ID     int64 `json:"id"`
	Number int   `json:"numero"`
}

type Detail struct {
	ID            int64   `json:"id"`
	Table         Table   `json:"mesa"`
	ServiceType   string  `json:"tipoServicio"`
	ServiceNumber *int    `json:"numeroServicio"`
	CustomerName  *string `json:"clienteNombre"`
	State         string  `json:"estado"`
	PrivateNote   *string `json:"notaPrivada"`
	Orders        []Order `json:"ordenes"`
	TotalCents    int64   `json:"totalCentavos"`
}

type InProgress struct {
	ID            int64   `json:"id"`
	TableID       int64   `json:"mesaId"`
	Table         int     `json:"mesa"`
	ServiceType   string  `json:"tipoServicio"`
	ServiceNumber *int    `json:"numeroServicio"`
	CustomerName  *string `json:"clienteNombre"`
	Waiter        string  `json:"mesero"`
	State         string  `json:"estado"`
	OpenedAt      string  `json:"abiertaEn"`
	Since         string  `json:"hace"`
	TotalCents    int64   `json:"totalCentavos"`
	Orders        []Order `json:"ordenes"`
}

// Get devuelve una cuenta completa con la versión vigente de cada orden.
func Get(ctx context.Context, db *sql.DB, accountID int64) (Detail, error) {
	var detail Detail
	var serviceNumber sql.NullInt64
	var customer, privateNote sql.NullString
	err := db.QueryRowContext(ctx, `SELECT c.id, c.estado, c.nota_privada, c.tipo_servicio, c.numero_servicio, c.cliente_nombre, m.id, m.numero
		FROM cuentas c JOIN mesas m ON m.id = c.mesa_id WHERE c.id = ?`, accountID).
		Scan(&detail.ID, &detail.State, &privateNote, &detail.ServiceType, &serviceNumber, &customer, &detail.Table.ID, &detail.Table.Number)
	if errors.Is(err, sql.ErrNoRows) {
		return Detail{}, &Error{Code: "cuenta_inexistente", Message: "Cuenta inexistente"}
	}
	if err != nil {
		return Detail{}, err
	}
	if serviceNumber.Valid {
		value := int(serviceNumber.Int64)
		detail.ServiceNumber = &value
	}
	if customer.Valid {
		value := customer.String
		detail.CustomerName = &value
	}
	if privateNote.Valid {
		value := privateNote.String
		detail.PrivateNote = &value
	}

	rows, err := db.QueryContext(ctx, `SELECT o.id, o.numero, o.estado, o.indicaciones, o.creada_en, e.nombre
		FROM ordenes o JOIN empleados e ON e.id = o.creada_por_empleado_id WHERE o.cuenta_id = ? ORDER BY o.numero`, accountID)
	if err != nil {
		return Detail{}, err
	}
	defer rows.Close()
	detail.Orders = []Order{}
	for rows.Next() {
		var order Order
		var original sql.NullString
		if err := rows.Scan(&order.ID, &order.Number, &order.State, &original, &order.CreatedAt, &order.Employee); err != nil {
			return Detail{}, err
		}
		if original.Valid {
			value := original.String
			order.OriginalInstructions = &value
		}
		var err error
		order.Instructions, err = instructions(ctx, db, order.ID)
		if err != nil {
			return Detail{}, err
		}
		order.Stage, err = stage(ctx, db, order.ID)
		if err != nil {
			return Detail{}, err
		}
		order.Lines, err = currentLines(ctx, db, order.ID)
		if err != nil {
			return Detail{}, err
		}
		detail.Orders = append(detail.Orders, order)
	}
	if err := rows.Err(); err != nil {
		return Detail{}, err
	}
	detail.TotalCents = total(detail.Orders)
	return detail, nil
}

// ListInProgress es el origen de la pantalla Órdenes. Filtra estrictamente la
// jornada abierta, para que una comanda del día anterior no vuelva a aparecer.
func ListInProgress(ctx context.Context, db *sql.DB, now time.Time) ([]InProgress, error) {
	rows, err := db.QueryContext(ctx, `SELECT c.id, c.abierta_en, e.nombre FROM cuentas c
		LEFT JOIN empleados e ON e.id = c.abierta_por_empleado_id
		JOIN jornadas_operativas j ON j.id = c.jornada_id AND j.estado = 'abierta'
		WHERE c.estado IN ('abierta', 'precuenta_emitida') ORDER BY c.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []InProgress{}
	for rows.Next() {
		var id int64
		var opened string
		var waiter sql.NullString
		if err := rows.Scan(&id, &opened, &waiter); err != nil {
			return nil, err
		}
		detail, err := Get(ctx, db, id)
		if err != nil {
			return nil, err
		}
		name := "—"
		if waiter.Valid {
			name = waiter.String
		}
		items = append(items, InProgress{ID: detail.ID, TableID: detail.Table.ID, Table: detail.Table.Number, ServiceType: detail.ServiceType,
			ServiceNumber: detail.ServiceNumber, CustomerName: detail.CustomerName, Waiter: name, State: detail.State,
			OpenedAt: opened, Since: since(opened, now), TotalCents: detail.TotalCents, Orders: detail.Orders})
	}
	return items, rows.Err()
}

func currentLines(ctx context.Context, db *sql.DB, orderID int64) ([]Line, error) {
	rows, err := db.QueryContext(ctx, `SELECT ol.id, ol.producto_id, ol.cantidad, ol.precio_centavos, ol.nota, ol.linea_clave, p.nombre
		FROM orden_lineas ol JOIN productos p ON p.id = ol.producto_id WHERE ol.orden_id = ? ORDER BY ol.id`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byKey := map[string]Line{}
	orderKeys := []string{}
	for rows.Next() {
		var line Line
		var note sql.NullString
		if err := rows.Scan(&line.OrderLineID, &line.ProductID, &line.Quantity, &line.PriceCents, &note, &line.LineKey, &line.Name); err != nil {
			return nil, err
		}
		if note.Valid {
			value := note.String
			line.Note = &value
		}
		line.Contours = []string{}
		byKey[line.LineKey] = line
		orderKeys = append(orderKeys, line.LineKey)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	contours, err := db.QueryContext(ctx, `SELECT olc.orden_linea_id, olc.slot_nombre, olc.variante_nombre, olc.es_extra
		FROM orden_linea_contornos olc JOIN orden_lineas ol ON ol.id = olc.orden_linea_id WHERE ol.orden_id = ? ORDER BY olc.id`, orderID)
	if err != nil {
		return nil, err
	}
	for contours.Next() {
		var lineID int64
		var slot, variant string
		var extra int
		if err := contours.Scan(&lineID, &slot, &variant, &extra); err != nil {
			contours.Close()
			return nil, err
		}
		for key, line := range byKey {
			if line.OrderLineID != nil && *line.OrderLineID == lineID {
				if extra == 1 {
					line.Contours = append(line.Contours, "EXTRA: "+variant)
				} else {
					line.Contours = append(line.Contours, slot+": "+variant)
				}
				byKey[key] = line
				break
			}
		}
	}
	if err := contours.Err(); err != nil {
		contours.Close()
		return nil, err
	}
	contours.Close()

	changes, err := db.QueryContext(ctx, `SELECT ocl.producto_id, ocl.cantidad_nueva, ocl.nota_nueva, ocl.linea_clave, ocl.precio_centavos, p.nombre
		FROM orden_correcciones oc JOIN orden_correccion_lineas ocl ON ocl.correccion_id = oc.id JOIN productos p ON p.id = ocl.producto_id
		WHERE oc.orden_id = ? ORDER BY oc.numero_version, ocl.id`, orderID)
	if err != nil {
		return nil, err
	}
	defer changes.Close()
	for changes.Next() {
		var productID, price int64
		var quantity float64
		var note sql.NullString
		var key, name string
		if err := changes.Scan(&productID, &quantity, &note, &key, &price, &name); err != nil {
			return nil, err
		}
		if previous, found := byKey[key]; found {
			previous.Quantity = quantity
			previous.Note = nil
			if note.Valid {
				value := note.String
				previous.Note = &value
			}
			byKey[key] = previous
			continue
		}
		line := Line{LineKey: key, ProductID: productID, Name: name, Quantity: quantity, PriceCents: price, Contours: []string{}}
		if note.Valid {
			value := note.String
			line.Note = &value
		}
		byKey[key] = line
		orderKeys = append(orderKeys, key)
	}
	if err := changes.Err(); err != nil {
		return nil, err
	}
	result := make([]Line, 0, len(orderKeys))
	for _, key := range orderKeys {
		result = append(result, byKey[key])
	}
	return result, nil
}

func instructions(ctx context.Context, db *sql.DB, orderID int64) (*string, error) {
	var text sql.NullString
	err := db.QueryRowContext(ctx, `SELECT indicaciones FROM orden_correcciones WHERE orden_id = ? AND indicaciones IS NOT NULL ORDER BY numero_version DESC LIMIT 1`, orderID).Scan(&text)
	if errors.Is(err, sql.ErrNoRows) {
		err = db.QueryRowContext(ctx, "SELECT indicaciones FROM ordenes WHERE id = ?", orderID).Scan(&text)
	}
	if err != nil {
		return nil, err
	}
	if !text.Valid || strings.TrimSpace(text.String) == "" {
		return nil, nil
	}
	value := text.String
	return &value, nil
}

func stage(ctx context.Context, db *sql.DB, orderID int64) (string, error) {
	rows, err := db.QueryContext(ctx, `SELECT cl.etapa FROM comanda_lineas cl JOIN comandas c ON c.id = cl.comanda_id
		WHERE c.orden_id = ? AND cl.etapa NOT IN ('aviso', 'cancelado')`, orderID)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	stages := []string{}
	for rows.Next() {
		var value string
		if err := rows.Scan(&value); err != nil {
			return "", err
		}
		stages = append(stages, value)
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	if len(stages) == 0 {
		return "enviado", nil
	}
	all := func(allowed ...string) bool {
		for _, value := range stages {
			found := false
			for _, candidate := range allowed {
				if value == candidate {
					found = true
					break
				}
			}
			if !found {
				return false
			}
		}
		return true
	}
	if all("servido") {
		return "entregado", nil
	}
	if all("listo", "servido") {
		return "listo", nil
	}
	for _, value := range stages {
		if value == "en_proceso" || value == "listo" || value == "servido" {
			return "en_preparacion", nil
		}
	}
	return "enviado", nil
}

func total(orders []Order) int64 {
	var sum int64
	for _, order := range orders {
		for _, line := range order.Lines {
			if line.Quantity > 0 {
				sum += int64(math.Round(line.Quantity * float64(line.PriceCents)))
			}
		}
	}
	return sum
}

func since(iso string, now time.Time) string {
	then, err := time.Parse(time.RFC3339, iso)
	if err != nil {
		return "Hace un momento"
	}
	minutes := int(now.Sub(then).Minutes())
	if minutes <= 0 {
		return "Hace un momento"
	}
	if minutes == 1 {
		return "Hace un minuto"
	}
	if minutes == 2 {
		return "Hace dos minutos"
	}
	if minutes < 60 {
		return "Hace " + strconv.Itoa(minutes) + " minutos"
	}
	hours := minutes / 60
	if hours == 1 {
		return "Hace una hora"
	}
	if hours < 48 {
		return "Hace " + strconv.Itoa(hours) + " horas"
	}
	days := hours / 24
	if days == 1 {
		return "Hace un día"
	}
	if days < 60 {
		return "Hace " + strconv.Itoa(days) + " días"
	}
	months := days / 30
	if months == 1 {
		return "Hace un mes"
	}
	return "Hace " + strconv.Itoa(months) + " meses"
}
