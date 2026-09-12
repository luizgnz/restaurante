package orders

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

type SendOptions struct {
	InventoryPolicy   string
	ExpectedAccountID int64
}
type Result struct {
	AccountID     int64    `json:"cuentaId"`
	OrderID       int64    `json:"ordenId"`
	OrderNumber   int      `json:"ordenNumero"`
	CommandID     int64    `json:"comandaId"`
	Repeated      bool     `json:"repetida"`
	Warnings      []string `json:"avisos"`
	Waiter        string   `json:"mesero"`
	ServiceType   string   `json:"tipoServicio"`
	ServiceNumber *int     `json:"numeroServicio"`
	CustomerName  *string  `json:"clienteNombre"`
}
type validatedContour struct {
	position      int64
	slot, variant string
	price         int64
	extra         int
	order         int
}
type component struct {
	productID int64
	perUnit   float64
	name      string
}
type consumption struct {
	key        string
	productID  int64
	quantity   float64
	components []component
}

func Send(ctx context.Context, db *sql.DB, input NewInput, employeeID int64, options SendOptions) (Result, error) {
	if input.ServiceType == "" {
		input.ServiceType = "mesa"
	}
	if err := Validate(input); err != nil {
		return Result{}, err
	}
	if options.InventoryPolicy != "descuento_al_enviar" && options.InventoryPolicy != "reserva_al_enviar_firme_al_precuenta" && options.InventoryPolicy != "reserva_al_enviar_firme_al_enviar_caja" {
		options.InventoryPolicy = "reserva_al_enviar_firme_al_enviar_caja"
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Result{}, err
	}
	defer tx.Rollback()
	var journeyID int64
	if err := tx.QueryRowContext(ctx, "SELECT id FROM jornadas_operativas WHERE estado = 'abierta' ORDER BY id DESC LIMIT 1").Scan(&journeyID); errors.Is(err, sql.ErrNoRows) {
		return Result{}, &Error{"jornada_cerrada", "No hay una jornada operativa abierta"}
	} else if err != nil {
		return Result{}, err
	}
	var waiter string
	if err := tx.QueryRowContext(ctx, "SELECT nombre FROM empleados WHERE id = ? AND activo = 1", employeeID).Scan(&waiter); errors.Is(err, sql.ErrNoRows) {
		return Result{}, &Error{"empleado_inexistente", "Empleado inexistente"}
	} else if err != nil {
		return Result{}, err
	}
	var existingOrder, existingAccount int64
	err = tx.QueryRowContext(ctx, "SELECT id, cuenta_id FROM ordenes WHERE clave_idempotencia = ?", strings.TrimSpace(input.Key)).Scan(&existingOrder, &existingAccount)
	if err == nil {
		result, err := repeatedResult(ctx, tx, existingOrder, existingAccount)
		if err != nil {
			return Result{}, err
		}
		if options.ExpectedAccountID != 0 && result.AccountID != options.ExpectedAccountID {
			return Result{}, &Error{"cuenta_desactualizada", "La clave de idempotencia pertenece a otra cuenta"}
		}
		if err := tx.Commit(); err != nil {
			return Result{}, err
		}
		return result, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return Result{}, err
	}

	accountID, accountState, serviceNumber, customer, err := resolveAccount(ctx, tx, input, journeyID, employeeID)
	if err != nil {
		return Result{}, err
	}
	if options.ExpectedAccountID != 0 && accountID != options.ExpectedAccountID {
		return Result{}, &Error{"cuenta_desactualizada", "La cuenta cambió; vuelve a abrirla"}
	}
	now := timestamp()
	var number int
	if err := tx.QueryRowContext(ctx, "SELECT COALESCE(MAX(numero), 0) + 1 FROM ordenes WHERE cuenta_id = ?", accountID).Scan(&number); err != nil {
		return Result{}, err
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO ordenes (cuenta_id, numero, estado, indicaciones, creada_por_empleado_id, creada_en, clave_idempotencia) VALUES (?, ?, 'enviada', ?, ?, ?, ?)`, accountID, number, clean(input.Instructions), employeeID, now, strings.TrimSpace(input.Key))
	if err != nil {
		return Result{}, err
	}
	orderID, err := res.LastInsertId()
	if err != nil {
		return Result{}, err
	}
	lineIDs := []int64{}
	ticketLines := []map[string]any{}
	consumptions := []consumption{}
	for _, line := range input.Lines {
		var name string
		var basePrice int64
		if err := tx.QueryRowContext(ctx, "SELECT nombre, precio_centavos FROM productos WHERE id = ?", line.ProductID).Scan(&name, &basePrice); errors.Is(err, sql.ErrNoRows) {
			return Result{}, &Error{"producto_inexistente", "Producto inexistente"}
		} else if err != nil {
			return Result{}, err
		}
		contours, err := validateContours(ctx, tx, line.ProductID, line.Contours)
		if err != nil {
			return Result{}, err
		}
		price := basePrice
		contourText := []string{}
		for _, contour := range contours {
			price += contour.price
			if contour.extra == 1 {
				contourText = append(contourText, "EXTRA: "+contour.variant)
			} else {
				contourText = append(contourText, contour.slot+": "+contour.variant)
			}
		}
		key, err := randomKey()
		if err != nil {
			return Result{}, err
		}
		lineRes, err := tx.ExecContext(ctx, "INSERT INTO orden_lineas (orden_id, producto_id, cantidad, precio_centavos, nota, linea_clave) VALUES (?, ?, ?, ?, ?, ?)", orderID, line.ProductID, line.Quantity, price, clean(line.Note), key)
		if err != nil {
			return Result{}, err
		}
		lineID, err := lineRes.LastInsertId()
		if err != nil {
			return Result{}, err
		}
		lineIDs = append(lineIDs, lineID)
		for _, contour := range contours {
			if _, err := tx.ExecContext(ctx, `INSERT INTO orden_linea_contornos (orden_linea_id, slot_posicion, slot_nombre, variante_nombre, precio_centavos, es_extra, orden_extra) VALUES (?, ?, ?, ?, ?, ?, ?)`, lineID, contour.position, contour.slot, contour.variant, contour.price, contour.extra, contour.order); err != nil {
				return Result{}, err
			}
		}
		parts, err := componentsFor(ctx, tx, line.ProductID)
		if err != nil {
			return Result{}, err
		}
		consumptions = append(consumptions, consumption{key, line.ProductID, line.Quantity, parts})
		ticket := map[string]any{"nombre": name, "cantidad": line.Quantity, "nota": clean(line.Note)}
		if len(contourText) > 0 {
			ticket["contornos"] = contourText
		}
		ticketLines = append(ticketLines, ticket)
	}
	if err := ensureStock(ctx, tx, consumptions); err != nil {
		return Result{}, err
	}
	for _, item := range consumptions {
		for _, part := range item.components {
			amount := part.perUnit * item.quantity
			if amount == 0 {
				continue
			}
			if _, err := tx.ExecContext(ctx, "INSERT INTO stock (producto_id, on_hand_real, reserved_real) VALUES (?, 0, 0) ON CONFLICT(producto_id) DO NOTHING", part.productID); err != nil {
				return Result{}, err
			}
			reserved, firm := amount, float64(0)
			if options.InventoryPolicy == "descuento_al_enviar" {
				reserved, firm = 0, amount
				if _, err := tx.ExecContext(ctx, "UPDATE stock SET on_hand_real = on_hand_real - ? WHERE producto_id = ?", amount, part.productID); err != nil {
					return Result{}, err
				}
			} else if _, err := tx.ExecContext(ctx, "UPDATE stock SET reserved_real = reserved_real + ? WHERE producto_id = ?", amount, part.productID); err != nil {
				return Result{}, err
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO orden_linea_inventario (orden_id, linea_clave, producto_id, cantidad_por_unidad, reservada_real, firmada_real) VALUES (?, ?, ?, ?, ?, ?)`, orderID, item.key, part.productID, part.perUnit, reserved, firm); err != nil {
				return Result{}, err
			}
		}
	}
	if _, err := tx.ExecContext(ctx, "UPDATE precuentas SET vigente = 0 WHERE cuenta_id = ?", accountID); err != nil {
		return Result{}, err
	}
	if accountState == "precuenta_emitida" {
		if _, err := tx.ExecContext(ctx, "UPDATE cuentas SET estado = 'abierta' WHERE id = ?", accountID); err != nil {
			return Result{}, err
		}
	}
	commandRes, err := tx.ExecContext(ctx, `INSERT INTO comandas (pedido_id, envio_n, mesero_id, creada_en, orden_id, correccion_id, tipo, jornada_id) VALUES (NULL, ?, ?, ?, ?, NULL, 'orden', ?)`, number, employeeID, now, orderID, journeyID)
	if err != nil {
		return Result{}, err
	}
	commandID, _ := commandRes.LastInsertId()
	for _, lineID := range lineIDs {
		if _, err := tx.ExecContext(ctx, "INSERT INTO comanda_lineas (comanda_id, pedido_linea_id, orden_linea_id, orden_correccion_linea_id, etapa, etapa_actualizada_en) VALUES (?, NULL, ?, NULL, 'por_preparar', ?)", commandID, lineID, now); err != nil {
			return Result{}, err
		}
	}
	indications := clean(input.Instructions)
	if input.ServiceType == "para_llevar" {
		prefix := fmt.Sprintf("PARA LLEVAR #%d", *serviceNumber)
		if customer != nil {
			prefix += " · " + *customer
		}
		if indications != nil {
			prefix += " · " + *indications
		}
		indications = &prefix
	}
	payload, _ := json.Marshal(map[string]any{"mesaNumero": func() any {
		if input.ServiceType == "mesa" {
			var n int
			_ = tx.QueryRowContext(ctx, "SELECT numero FROM mesas WHERE id = ?", input.TableID).Scan(&n)
			return n
		}
		return nil
	}(), "ordenNumero": number, "mesero": waiter, "indicaciones": indications, "lineas": ticketLines})
	if _, err := tx.ExecContext(ctx, "INSERT INTO print_jobs (kind, payload, status, attempts, created_en) VALUES ('comanda', ?, 'queued', 0, ?)", string(payload), now); err != nil {
		return Result{}, err
	}
	if err := tx.Commit(); err != nil {
		return Result{}, err
	}
	return Result{accountID, orderID, number, commandID, false, []string{}, waiter, input.ServiceType, serviceNumber, customer}, nil
}

func repeatedResult(ctx context.Context, tx *sql.Tx, orderID, accountID int64) (Result, error) {
	var commandID int64
	var waiter, service string
	var num sql.NullInt64
	var customer sql.NullString
	err := tx.QueryRowContext(ctx, `SELECT c.id, e.nombre, cu.tipo_servicio, cu.numero_servicio, cu.cliente_nombre FROM comandas c JOIN empleados e ON e.id=c.mesero_id JOIN ordenes o ON o.id=c.orden_id JOIN cuentas cu ON cu.id=o.cuenta_id WHERE c.orden_id=? AND c.tipo='orden'`, orderID).Scan(&commandID, &waiter, &service, &num, &customer)
	if err != nil {
		return Result{}, &Error{"comanda_inexistente", "La orden idempotente no tiene comanda"}
	}
	var sn *int
	if num.Valid {
		v := int(num.Int64)
		sn = &v
	}
	var cn *string
	if customer.Valid {
		v := customer.String
		cn = &v
	}
	var orderNumber int
	if err := tx.QueryRowContext(ctx, "SELECT numero FROM ordenes WHERE id = ?", orderID).Scan(&orderNumber); err != nil {
		return Result{}, err
	}
	return Result{accountID, orderID, orderNumber, commandID, true, []string{}, waiter, service, sn, cn}, nil
}
func resolveAccount(ctx context.Context, tx *sql.Tx, input NewInput, journeyID, employeeID int64) (int64, string, *int, *string, error) {
	if input.ServiceType == "mesa" {
		var id int64
		var state string
		err := tx.QueryRowContext(ctx, `SELECT c.id,c.estado FROM cuentas c LEFT JOIN jornadas_operativas j ON j.id=c.jornada_id WHERE c.mesa_id=? AND c.estado IN ('abierta','precuenta_emitida') AND (j.estado='abierta' OR c.jornada_id IS NULL)`, input.TableID).Scan(&id, &state)
		if err == nil {
			return id, state, nil, nil, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return 0, "", nil, nil, err
		}
		var exists int
		if err := tx.QueryRowContext(ctx, "SELECT 1 FROM mesas WHERE id=? AND activa=1", input.TableID).Scan(&exists); err != nil {
			return 0, "", nil, nil, &Error{"mesa_inexistente", "Mesa inexistente"}
		}
		res, err := tx.ExecContext(ctx, `INSERT INTO cuentas (mesa_id,estado,abierta_por_empleado_id,abierta_en,jornada_id,tipo_servicio) VALUES (?,'abierta',?,?,?,'mesa')`, input.TableID, employeeID, timestamp(), journeyID)
		if err != nil {
			return 0, "", nil, nil, err
		}
		id, _ = res.LastInsertId()
		return id, "abierta", nil, nil, nil
	}
	var max int
	if err := tx.QueryRowContext(ctx, "SELECT COALESCE(MAX(numero_servicio),0)+1 FROM cuentas WHERE jornada_id=? AND tipo_servicio='para_llevar'", journeyID).Scan(&max); err != nil {
		return 0, "", nil, nil, err
	}
	var floorID int64
	err := tx.QueryRowContext(ctx, "SELECT id FROM pisos WHERE nombre='__sistema_para_llevar__' AND activo=0 ORDER BY id LIMIT 1").Scan(&floorID)
	if errors.Is(err, sql.ErrNoRows) {
		r, e := tx.ExecContext(ctx, "INSERT INTO pisos (nombre,activo) VALUES ('__sistema_para_llevar__',0)")
		if e != nil {
			return 0, "", nil, nil, e
		}
		floorID, _ = r.LastInsertId()
	} else if err != nil {
		return 0, "", nil, nil, err
	}
	r, e := tx.ExecContext(ctx, `INSERT INTO mesas (piso_id,numero,asientos,activa,pos_x,pos_y,forma,ancho,alto) VALUES (?, ?,1,0,0,0,'square',88,88)`, floorID, -max)
	if e != nil {
		return 0, "", nil, nil, e
	}
	tableID, _ := r.LastInsertId()
	customer := clean(input.CustomerName)
	r, e = tx.ExecContext(ctx, `INSERT INTO cuentas (mesa_id,estado,abierta_por_empleado_id,abierta_en,jornada_id,tipo_servicio,numero_servicio,cliente_nombre) VALUES (?,'abierta',?,?,?,?,?,?)`, tableID, employeeID, timestamp(), journeyID, "para_llevar", max, customer)
	if e != nil {
		return 0, "", nil, nil, e
	}
	id, _ := r.LastInsertId()
	return id, "abierta", &max, customer, nil
}
func clean(value *string) *string {
	if value == nil {
		return nil
	}
	v := strings.TrimSpace(*value)
	if v == "" {
		return nil
	}
	return &v
}
func timestamp() string { return time.Now().UTC().Format("2006-01-02T15:04:05.000Z") }
func randomKey() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
