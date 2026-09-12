package journey

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

type DemoResult struct {
	JornadaID    int64  `json:"jornadaId"`
	Cuentas      int    `json:"cuentas"`
	RespaldoRuta string `json:"respaldoRuta"`
}

type demoOrder struct {
	table, minutes int
	lines          []demoLine
}
type demoLine struct {
	name     string
	quantity float64
}
type demoProduct struct{ id, price int64 }

var demoOrders = []demoOrder{
	{3, 10, []demoLine{{"Empanada", 3}, {"Café", 2}}},
	{7, 20, []demoLine{{"Hamburguesa", 2}, {"Jugo", 1}}},
	{5, 30, []demoLine{{"Pizza margarita", 2}, {"Papas fritas", 1}}},
	{10, 45, []demoLine{{"Pizza margarita", 2}}},
	{6, 55, []demoLine{{"Cerveza", 4}, {"Completo", 2}}},
	{8, 80, []demoLine{{"Sopa del día", 2}}},
	{9, 100, []demoLine{{"Ensalada César", 1}, {"Agua con gas", 2}}},
	{4, 110, []demoLine{{"Flan", 2}, {"Café", 1}}},
}

var movementTables = []string{"cancelaciones_productos_cocina", "entregas_ordenes", "cocina_incidencias", "comanda_lineas", "comandas", "caja_handoffs", "precuentas", "cancelaciones_cuentas", "auditoria_anulaciones", "orden_linea_contornos", "orden_linea_inventario", "orden_correccion_lineas", "orden_correcciones", "orden_lineas", "ordenes", "cuentas", "pedido_lineas", "pedidos", "print_jobs"}

func ResetDemo(ctx context.Context, db *sql.DB, employeeID *int64, dataDir string) (DemoResult, error) {
	state, err := Current(ctx, db)
	if err != nil {
		return DemoResult{}, err
	}
	base := state.Jornada
	if base == nil {
		base = state.UltimaCerrada
	}
	if base == nil {
		return DemoResult{}, &DomainError{"jornada_inexistente", "No existe una jornada que se pueda respaldar"}
	}
	backup, err := Backup(ctx, db, *base, dataDir)
	if err != nil {
		return DemoResult{}, err
	}
	var previousSummary *Summary
	if state.Jornada != nil {
		value, err := GetSummary(ctx, db, state.Jornada.ID)
		if err != nil {
			return DemoResult{}, err
		}
		previousSummary = &value
	}
	actorID, actorName, err := activeActor(ctx, db, employeeID)
	if err != nil {
		return DemoResult{}, err
	}
	products := map[string]demoProduct{}
	for _, order := range demoOrders {
		for _, line := range order.lines {
			if _, ok := products[line.name]; ok {
				continue
			}
			var item demoProduct
			if err := db.QueryRowContext(ctx, "SELECT id, precio_centavos FROM productos WHERE nombre=? AND activo=1 AND disponible_en_pos=1", line.name).Scan(&item.id, &item.price); errors.Is(err, sql.ErrNoRows) {
				return DemoResult{}, &DomainError{"demo_incompleta", "Falta el producto demo: " + line.name}
			} else if err != nil {
				return DemoResult{}, err
			}
			products[line.name] = item
		}
	}
	tables := map[int]int64{}
	for _, order := range demoOrders {
		if _, ok := tables[order.table]; ok {
			continue
		}
		var id int64
		if err := db.QueryRowContext(ctx, "SELECT id FROM mesas WHERE numero=? AND activa=1 ORDER BY id LIMIT 1", order.table).Scan(&id); errors.Is(err, sql.ErrNoRows) {
			return DemoResult{}, &DomainError{"demo_incompleta", fmt.Sprintf("Falta la mesa demo #%d", order.table)}
		} else if err != nil {
			return DemoResult{}, err
		}
		tables[order.table] = id
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return DemoResult{}, err
	}
	defer tx.Rollback()
	for _, table := range movementTables {
		if _, err := tx.ExecContext(ctx, "DELETE FROM "+table); err != nil {
			return DemoResult{}, err
		}
	}
	now := time.Now()
	if state.Jornada != nil {
		summaryJSON, _ := json.Marshal(previousSummary)
		closedAt := now.UTC().Format(time.RFC3339Nano)
		if _, err := tx.ExecContext(ctx, `UPDATE jornadas_operativas SET estado='cerrada', cerrada_en=?, cerrada_por_empleado_id=?, respaldo_ruta=?, resumen_json=? WHERE id=?`, closedAt, actorID, backup, string(summaryJSON), state.Jornada.ID); err != nil {
			return DemoResult{}, err
		}
		detail, _ := json.Marshal(map[string]any{"motivo": "reinicio_demo", "resumen": previousSummary, "respaldoRuta": backup})
		if _, err := tx.ExecContext(ctx, `INSERT INTO jornada_eventos (jornada_id,tipo,empleado_id,detalle_json,creado_en) VALUES (?,'cierre',?,?,?)`, state.Jornada.ID, actorID, string(detail), closedAt); err != nil {
			return DemoResult{}, err
		}
	}
	openedAt := now.UTC().Format(time.RFC3339Nano)
	result, err := tx.ExecContext(ctx, `INSERT INTO jornadas_operativas (fecha_operativa,estado,abierta_en,abierta_por_empleado_id) VALUES (?,'abierta',?,?)`, now.Format("2006-01-02"), openedAt, actorID)
	if err != nil {
		return DemoResult{}, err
	}
	journeyID, err := result.LastInsertId()
	if err != nil {
		return DemoResult{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO jornada_eventos (jornada_id,tipo,empleado_id,detalle_json,creado_en) VALUES (?,'apertura',?,'{"origen":"reinicio_demo"}',?)`, journeyID, actorID, openedAt); err != nil {
		return DemoResult{}, err
	}
	var precountAccount, precountOrderID int64
	for _, order := range demoOrders {
		createdAt := now.Add(-time.Duration(order.minutes) * time.Minute).UTC().Format(time.RFC3339Nano)
		accountResult, err := tx.ExecContext(ctx, `INSERT INTO cuentas (mesa_id,estado,abierta_por_empleado_id,abierta_en,jornada_id,tipo_servicio) VALUES (?,'abierta',?,?,?,'mesa')`, tables[order.table], actorID, createdAt, journeyID)
		if err != nil {
			return DemoResult{}, err
		}
		accountID, _ := accountResult.LastInsertId()
		orderResult, err := tx.ExecContext(ctx, `INSERT INTO ordenes (cuenta_id,numero,estado,indicaciones,creada_por_empleado_id,creada_en,clave_idempotencia) VALUES (?,1,'enviada',NULL,?,?,?)`, accountID, actorID, createdAt, "demo-"+uuid.NewString())
		if err != nil {
			return DemoResult{}, err
		}
		orderID, _ := orderResult.LastInsertId()
		commandResult, err := tx.ExecContext(ctx, `INSERT INTO comandas (pedido_id,envio_n,mesero_id,creada_en,orden_id,correccion_id,tipo,jornada_id) VALUES (NULL,1,?,?,?,NULL,'orden',?)`, actorID, createdAt, orderID, journeyID)
		if err != nil {
			return DemoResult{}, err
		}
		commandID, _ := commandResult.LastInsertId()
		stage := "por_preparar"
		if order.table == 5 {
			stage = "en_proceso"
		}
		if order.table == 6 || order.table == 9 {
			stage = "listo"
		}
		for _, line := range order.lines {
			product := products[line.name]
			lineResult, err := tx.ExecContext(ctx, `INSERT INTO orden_lineas (orden_id,producto_id,cantidad,precio_centavos,nota,linea_clave) VALUES (?,?,?,?,NULL,?)`, orderID, product.id, line.quantity, product.price, uuid.NewString())
			if err != nil {
				return DemoResult{}, err
			}
			lineID, _ := lineResult.LastInsertId()
			if _, err := tx.ExecContext(ctx, `INSERT INTO comanda_lineas (comanda_id,pedido_linea_id,orden_linea_id,orden_correccion_linea_id,etapa) VALUES (?,NULL,?,NULL,?)`, commandID, lineID, stage); err != nil {
				return DemoResult{}, err
			}
		}
		if order.table == 10 {
			precountAccount = accountID
			precountOrderID = orderID
		}
	}
	if precountAccount != 0 {
		pizza := products["Pizza margarita"]
		snapshot := map[string]any{
			"cuentaId": precountAccount, "mesaNumero": 10, "mesero": actorName,
			"ordenes": []any{map[string]any{"numero": 1, "indicaciones": nil, "lineas": []any{map[string]any{
				"productoId": pizza.id, "nombre": "Pizza margarita", "cantidad": 2, "precioCentavos": pizza.price, "nota": nil,
			}}}},
			"totalCentavos": pizza.price * 2, "sello": fmt.Sprintf("o:1:%d/c:0:0", precountOrderID),
			"leyenda": "Esto no es boleta ni factura. El documento tributario lo emite caja.",
		}
		snapshotJSON, _ := json.Marshal(snapshot)
		if _, err := tx.ExecContext(ctx, `INSERT INTO precuentas (pedido_id,cuenta_id,numero,vigente,mesero_id,snapshot_json,emitida_en) VALUES (NULL,?,1,1,?,?,?)`, precountAccount, actorID, string(snapshotJSON), openedAt); err != nil {
			return DemoResult{}, err
		}
		if _, err := tx.ExecContext(ctx, "UPDATE cuentas SET estado='precuenta_emitida' WHERE id=?", precountAccount); err != nil {
			return DemoResult{}, err
		}
	}
	detail, _ := json.Marshal(map[string]any{"cuentas": len(demoOrders), "respaldoRuta": backup})
	if _, err := tx.ExecContext(ctx, `INSERT INTO jornada_eventos (jornada_id,tipo,empleado_id,detalle_json,creado_en) VALUES (?,'reinicio_demo',?,?,?)`, journeyID, actorID, string(detail), openedAt); err != nil {
		return DemoResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return DemoResult{}, err
	}
	return DemoResult{JornadaID: journeyID, Cuentas: len(demoOrders), RespaldoRuta: backup}, nil
}

func activeActor(ctx context.Context, db *sql.DB, requested *int64) (int64, string, error) {
	var id int64
	var name string
	if requested != nil {
		if err := db.QueryRowContext(ctx, "SELECT id,nombre FROM empleados WHERE id=? AND activo=1", *requested).Scan(&id, &name); err == nil {
			return id, name, nil
		}
	}
	if err := db.QueryRowContext(ctx, "SELECT id,nombre FROM empleados WHERE activo=1 ORDER BY id LIMIT 1").Scan(&id, &name); err != nil {
		return 0, "", &DomainError{"empleado_inexistente", "No hay un empleado activo para crear el día de demostración"}
	}
	return id, name, nil
}
