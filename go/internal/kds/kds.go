// Package kds implementa el tablero y las transiciones operativas de Cocina.
package kds

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// Error es una condición de negocio que la capa HTTP puede convertir en una
// respuesta útil, sin revelar errores internos de SQLite.
type Error struct {
	Code    string
	Message string
}

func (err *Error) Error() string { return err.Message }

var validDestinations = map[string]bool{"en_proceso": true, "listo": true, "servido": true}

type Linea struct {
	ID               int64    `json:"id"`
	Etapa            string   `json:"etapa"`
	EsAviso          bool     `json:"esAviso"`
	Nombre           string   `json:"nombre"`
	Cantidad         float64  `json:"cantidad"`
	CantidadAnterior *float64 `json:"cantidadAnterior"`
	Delta            *float64 `json:"delta"`
	Nota             *string  `json:"nota"`
	NotaAnterior     *string  `json:"notaAnterior"`
	Contornos        []string `json:"contornos"`
}

type Incidencia struct {
	ID                  int64   `json:"id"`
	ComandaID           int64   `json:"comandaId"`
	OrdenID             int64   `json:"ordenId"`
	ComandaLineaID      *int64  `json:"comandaLineaId"`
	Tipo                string  `json:"tipo"`
	Alcance             string  `json:"alcance"`
	Motivo              string  `json:"motivo"`
	Propuesta           *string `json:"propuesta"`
	Estado              string  `json:"estado"`
	CreadaEn            string  `json:"creadaEn"`
	RespondidaEn        *string `json:"respondidaEn"`
	Mesa                int     `json:"mesa"`
	OrdenNumero         int     `json:"ordenNumero"`
	Producto            *string `json:"producto"`
	ProductoReemplazoID *int64  `json:"productoReemplazoId"`
	ProductoReemplazo   *string `json:"productoReemplazo"`
}

type Tarjeta struct {
	ID                    int64        `json:"id"`
	Tipo                  string       `json:"tipo"`
	Referencia            string       `json:"referencia"`
	Mesa                  *int         `json:"mesa"`
	TipoServicio          string       `json:"tipoServicio"`
	NumeroServicio        *int         `json:"numeroServicio"`
	ClienteNombre         *string      `json:"clienteNombre"`
	Mesero                string       `json:"mesero"`
	EnvioN                int          `json:"envioN"`
	CreadaEn              string       `json:"creadaEn"`
	OrdenID               *int64       `json:"ordenId"`
	OrdenNumero           *int         `json:"ordenNumero"`
	CorreccionID          *int64       `json:"correccionId"`
	NumeroVersion         *int         `json:"numeroVersion"`
	EsAnulacion           bool         `json:"esAnulacion"`
	Indicaciones          *string      `json:"indicaciones"`
	IndicacionesCambiadas bool         `json:"indicacionesCambiadas"`
	Lineas                []Linea      `json:"lineas"`
	Incidencias           []Incidencia `json:"incidencias"`
}

type commandRow struct {
	id                     int64
	tipo                   string
	envioN                 int
	creadaEn               string
	pedidoID               sql.NullInt64
	ordenID                sql.NullInt64
	correccionID           sql.NullInt64
	mesero                 string
	mesa                   sql.NullInt64
	tipoServicio           sql.NullString
	numeroServicio         sql.NullInt64
	clienteNombre          sql.NullString
	ordenNumero            sql.NullInt64
	numeroVersion          sql.NullInt64
	esAnulacion            sql.NullInt64
	correccionIndicaciones sql.NullString
	pedidoIndicaciones     sql.NullString
}

// List entrega el mismo contrato de GET /api/kds. Se conserva una tarjeta por
// evento (orden, corrección o anulación), no una por producto.
func List(ctx context.Context, db *sql.DB, prioridadParaLlevar string) ([]Tarjeta, error) {
	rows, err := db.QueryContext(ctx, `SELECT c.id, c.tipo, c.envio_n, c.creada_en, c.pedido_id, c.orden_id, c.correccion_id,
		e.nombre AS mesero, COALESCE(mp.numero, mc.numero) AS mesa,
		cu.tipo_servicio, cu.numero_servicio, cu.cliente_nombre, o.numero AS orden_numero,
		oc.numero_version, oc.es_anulacion, oc.indicaciones AS correccion_indicaciones,
		p.indicaciones AS pedido_indicaciones
		FROM comandas c
		JOIN empleados e ON e.id = c.mesero_id
		LEFT JOIN pedidos p ON p.id = c.pedido_id
		LEFT JOIN mesas mp ON mp.id = p.mesa_id
		LEFT JOIN ordenes o ON o.id = c.orden_id
		LEFT JOIN cuentas cu ON cu.id = o.cuenta_id
		LEFT JOIN mesas mc ON mc.id = cu.mesa_id
		LEFT JOIN orden_correcciones oc ON oc.id = c.correccion_id
		JOIN jornadas_operativas jo ON jo.id = c.jornada_id AND jo.estado = 'abierta'
		ORDER BY c.id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tarjetas := []Tarjeta{}
	for rows.Next() {
		var row commandRow
		if err := rows.Scan(&row.id, &row.tipo, &row.envioN, &row.creadaEn, &row.pedidoID, &row.ordenID, &row.correccionID,
			&row.mesero, &row.mesa, &row.tipoServicio, &row.numeroServicio, &row.clienteNombre, &row.ordenNumero,
			&row.numeroVersion, &row.esAnulacion, &row.correccionIndicaciones, &row.pedidoIndicaciones); err != nil {
			return nil, err
		}
		tarjeta, err := tarjetaDeFila(ctx, db, row)
		if err != nil {
			return nil, err
		}
		tarjetas = append(tarjetas, tarjeta)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if prioridadParaLlevar == "prioritaria" {
		// La consulta ya es descendente por id. Una pasada estable deja arriba
		// solo los pedidos para llevar, como lo hace el runtime Node.
		prioritarias := make([]Tarjeta, 0, len(tarjetas))
		normales := make([]Tarjeta, 0, len(tarjetas))
		for _, tarjeta := range tarjetas {
			if tarjeta.TipoServicio == "para_llevar" {
				prioritarias = append(prioritarias, tarjeta)
			} else {
				normales = append(normales, tarjeta)
			}
		}
		tarjetas = append(prioritarias, normales...)
	}
	return tarjetas, nil
}

func tarjetaDeFila(ctx context.Context, db *sql.DB, row commandRow) (Tarjeta, error) {
	tipoServicio := "mesa"
	if row.tipoServicio.Valid {
		tipoServicio = row.tipoServicio.String
	}
	tarjeta := Tarjeta{ID: row.id, Tipo: row.tipo, TipoServicio: tipoServicio, Mesero: row.mesero, EnvioN: row.envioN, CreadaEn: row.creadaEn, Lineas: []Linea{}, Incidencias: []Incidencia{}}
	if row.mesa.Valid {
		value := int(row.mesa.Int64)
		tarjeta.Mesa = &value
	}
	if row.numeroServicio.Valid {
		value := int(row.numeroServicio.Int64)
		tarjeta.NumeroServicio = &value
	}
	if row.clienteNombre.Valid {
		value := row.clienteNombre.String
		tarjeta.ClienteNombre = &value
	}
	if row.ordenID.Valid {
		value := row.ordenID.Int64
		tarjeta.OrdenID = &value
	}
	if row.ordenNumero.Valid {
		value := int(row.ordenNumero.Int64)
		tarjeta.OrdenNumero = &value
	}
	if row.correccionID.Valid {
		value := row.correccionID.Int64
		tarjeta.CorreccionID = &value
	}
	if row.numeroVersion.Valid {
		value := int(row.numeroVersion.Int64)
		tarjeta.NumeroVersion = &value
	}
	tarjeta.EsAnulacion = row.esAnulacion.Valid && row.esAnulacion.Int64 == 1
	tarjeta.Referencia = referencia(row, tipoServicio)

	var err error
	if row.correccionID.Valid {
		tarjeta.Lineas, err = lineasCorreccion(ctx, db, row.id)
		if row.correccionIndicaciones.Valid {
			value := row.correccionIndicaciones.String
			tarjeta.Indicaciones = &value
			tarjeta.IndicacionesCambiadas = true
		}
	} else if row.ordenID.Valid {
		tarjeta.Lineas, err = lineasOrden(ctx, db, row.id)
		tarjeta.Indicaciones, err = indicacionesVigentes(ctx, db, row.ordenID.Int64)
	} else {
		tarjeta.Lineas, err = lineasLegacy(ctx, db, row.id)
		if row.pedidoIndicaciones.Valid {
			value := row.pedidoIndicaciones.String
			tarjeta.Indicaciones = &value
		}
	}
	if err != nil {
		return Tarjeta{}, err
	}
	tarjeta.Incidencias, err = incidencias(ctx, db, row.id)
	if err != nil {
		return Tarjeta{}, err
	}
	return tarjeta, nil
}

func referencia(row commandRow, tipoServicio string) string {
	servicio := "Sin mesa"
	if tipoServicio == "para_llevar" && row.numeroServicio.Valid {
		servicio = fmt.Sprintf("Para llevar #%d", row.numeroServicio.Int64)
	} else if row.mesa.Valid {
		servicio = fmt.Sprintf("Mesa #%d", row.mesa.Int64)
	}
	numero := row.envioN
	if row.ordenNumero.Valid {
		numero = int(row.ordenNumero.Int64)
	}
	referencia := fmt.Sprintf("%s · Orden #%d", servicio, numero)
	if row.correccionID.Valid {
		evento := "Corrección"
		if row.esAnulacion.Valid && row.esAnulacion.Int64 == 1 {
			evento = "Anulación"
		}
		referencia += fmt.Sprintf(" · %s #%d", evento, row.numeroVersion.Int64)
	}
	return referencia
}

func lineasLegacy(ctx context.Context, db *sql.DB, comandaID int64) ([]Linea, error) {
	return lineasSimples(ctx, db, `SELECT cl.id, cl.etapa, pr.nombre, pl.cantidad, pl.nota FROM comanda_lineas cl JOIN pedido_lineas pl ON pl.id = cl.pedido_linea_id JOIN productos pr ON pr.id = pl.producto_id WHERE cl.comanda_id = ? ORDER BY cl.id`, comandaID, false)
}

func lineasOrden(ctx context.Context, db *sql.DB, comandaID int64) ([]Linea, error) {
	lineas, err := lineasSimples(ctx, db, `SELECT cl.id, cl.etapa, pr.nombre, ol.cantidad, ol.nota FROM comanda_lineas cl JOIN orden_lineas ol ON ol.id = cl.orden_linea_id JOIN productos pr ON pr.id = ol.producto_id WHERE cl.comanda_id = ? ORDER BY cl.id`, comandaID, true)
	if err != nil {
		return nil, err
	}
	for index := range lineas {
		rows, err := db.QueryContext(ctx, `SELECT olc.slot_nombre, olc.variante_nombre, olc.es_extra FROM orden_linea_contornos olc JOIN comanda_lineas cl ON cl.orden_linea_id = olc.orden_linea_id WHERE cl.id = ? ORDER BY olc.id`, lineas[index].ID)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var slot, variante string
			var extra int
			if err := rows.Scan(&slot, &variante, &extra); err != nil {
				rows.Close()
				return nil, err
			}
			if extra == 1 {
				lineas[index].Contornos = append(lineas[index].Contornos, "EXTRA: "+variante)
			} else {
				lineas[index].Contornos = append(lineas[index].Contornos, slot+": "+variante)
			}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}
	return lineas, nil
}

func lineasSimples(ctx context.Context, db *sql.DB, query string, comandaID int64, _ bool) ([]Linea, error) {
	rows, err := db.QueryContext(ctx, query, comandaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	lineas := []Linea{}
	for rows.Next() {
		var linea Linea
		var nota sql.NullString
		if err := rows.Scan(&linea.ID, &linea.Etapa, &linea.Nombre, &linea.Cantidad, &nota); err != nil {
			return nil, err
		}
		linea.EsAviso = linea.Etapa == "aviso"
		linea.Contornos = []string{}
		if nota.Valid {
			value := nota.String
			linea.Nota = &value
		}
		lineas = append(lineas, linea)
	}
	return lineas, rows.Err()
}

func lineasCorreccion(ctx context.Context, db *sql.DB, comandaID int64) ([]Linea, error) {
	rows, err := db.QueryContext(ctx, `SELECT cl.id, cl.etapa, p.nombre, ocl.cantidad_nueva, ocl.cantidad_anterior, ocl.nota_nueva, ocl.nota_anterior FROM comanda_lineas cl JOIN orden_correccion_lineas ocl ON ocl.id = cl.orden_correccion_linea_id JOIN productos p ON p.id = ocl.producto_id WHERE cl.comanda_id = ? ORDER BY cl.id`, comandaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	lineas := []Linea{}
	for rows.Next() {
		var linea Linea
		var anterior float64
		var nota, notaAnterior sql.NullString
		if err := rows.Scan(&linea.ID, &linea.Etapa, &linea.Nombre, &linea.Cantidad, &anterior, &nota, &notaAnterior); err != nil {
			return nil, err
		}
		linea.EsAviso, linea.Contornos = linea.Etapa == "aviso", []string{}
		linea.CantidadAnterior = &anterior
		delta := linea.Cantidad - anterior
		linea.Delta = &delta
		if nota.Valid {
			value := nota.String
			linea.Nota = &value
		}
		if notaAnterior.Valid {
			value := notaAnterior.String
			linea.NotaAnterior = &value
		}
		lineas = append(lineas, linea)
	}
	return lineas, rows.Err()
}

func indicacionesVigentes(ctx context.Context, db *sql.DB, ordenID int64) (*string, error) {
	var indicaciones sql.NullString
	var existe int
	err := db.QueryRowContext(ctx, `SELECT 1, indicaciones FROM orden_correcciones WHERE orden_id = ? AND indicaciones IS NOT NULL ORDER BY numero_version DESC LIMIT 1`, ordenID).Scan(&existe, &indicaciones)
	if err == nil {
		value := indicaciones.String
		return &value, nil
	}
	if err != sql.ErrNoRows {
		return nil, err
	}
	err = db.QueryRowContext(ctx, "SELECT indicaciones FROM ordenes WHERE id = ?", ordenID).Scan(&indicaciones)
	if err != nil {
		return nil, err
	}
	if !indicaciones.Valid {
		return nil, nil
	}
	value := indicaciones.String
	return &value, nil
}

func incidencias(ctx context.Context, db *sql.DB, comandaID int64) ([]Incidencia, error) {
	rows, err := db.QueryContext(ctx, `SELECT i.id, i.comanda_id, i.orden_id, i.comanda_linea_id, i.tipo, i.alcance, i.motivo, i.propuesta, i.estado, i.creada_en, i.respondida_en, m.numero, o.numero, p.nombre, i.producto_reemplazo_id, pr.nombre FROM cocina_incidencias i JOIN ordenes o ON o.id = i.orden_id JOIN cuentas cu ON cu.id = o.cuenta_id JOIN mesas m ON m.id = cu.mesa_id LEFT JOIN comanda_lineas cl ON cl.id = i.comanda_linea_id LEFT JOIN orden_lineas ol ON ol.id = cl.orden_linea_id LEFT JOIN productos p ON p.id = ol.producto_id LEFT JOIN productos pr ON pr.id = i.producto_reemplazo_id WHERE i.comanda_id = ? AND i.estado IN ('pendiente', 'aceptada') ORDER BY i.id`, comandaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Incidencia{}
	for rows.Next() {
		var item Incidencia
		var lineID, replacementID sql.NullInt64
		var proposal, answered, product, replacement sql.NullString
		if err := rows.Scan(&item.ID, &item.ComandaID, &item.OrdenID, &lineID, &item.Tipo, &item.Alcance, &item.Motivo, &proposal, &item.Estado, &item.CreadaEn, &answered, &item.Mesa, &item.OrdenNumero, &product, &replacementID, &replacement); err != nil {
			return nil, err
		}
		if lineID.Valid {
			value := lineID.Int64
			item.ComandaLineaID = &value
		}
		if proposal.Valid {
			value := proposal.String
			item.Propuesta = &value
		}
		if answered.Valid {
			value := answered.String
			item.RespondidaEn = &value
		}
		if product.Valid {
			value := product.String
			item.Producto = &value
		}
		if replacementID.Valid {
			value := replacementID.Int64
			item.ProductoReemplazoID = &value
		}
		if replacement.Valid {
			value := replacement.String
			item.ProductoReemplazo = &value
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// AdvanceLine mueve una única tarea de Cocina. No permite regresar etapas ni
// modificar historia cerrada; una incidencia pendiente bloquea el avance.
func AdvanceLine(ctx context.Context, db *sql.DB, lineID int64, stage string) error {
	if !validDestinations[stage] {
		return &Error{Code: "etapa_invalida", Message: "Etapa desconocida"}
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := advanceLineTx(ctx, tx, lineID, stage); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

// AdvanceCommand aplica el gesto principal de Cocina a todas las tareas de la
// tarjeta. La transacción evita que una incidencia bloquee una sola línea y
// deje el resto de la orden adelantada.
func AdvanceCommand(ctx context.Context, db *sql.DB, commandID int64, stage string) (int, error) {
	if !validDestinations[stage] {
		return 0, &Error{Code: "etapa_invalida", Message: "Etapa desconocida"}
	}
	origins := "('por_preparar','en_proceso')"
	if stage == "en_proceso" {
		origins = "('por_preparar')"
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT cl.id FROM comanda_lineas cl
		JOIN comandas c ON c.id = cl.comanda_id
		JOIN jornadas_operativas j ON j.id = c.jornada_id AND j.estado = 'abierta'
		WHERE cl.comanda_id = ? AND cl.etapa IN `+origins+` ORDER BY cl.id`, commandID)
	if err != nil {
		_ = tx.Rollback()
		return 0, err
	}
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			_ = tx.Rollback()
			return 0, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		_ = tx.Rollback()
		return 0, err
	}
	if err := rows.Close(); err != nil {
		_ = tx.Rollback()
		return 0, err
	}
	if len(ids) == 0 {
		_ = tx.Rollback()
		return 0, &Error{Code: "nada_que_avanzar", Message: "La orden no tiene líneas por avanzar"}
	}
	for _, id := range ids {
		if err := advanceLineTx(ctx, tx, id, stage); err != nil {
			_ = tx.Rollback()
			return 0, err
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return len(ids), nil
}

func advanceLineTx(ctx context.Context, tx *sql.Tx, lineID int64, stage string) error {
	var current string
	var commandID int64
	err := tx.QueryRowContext(ctx, `SELECT cl.etapa, cl.comanda_id FROM comanda_lineas cl
		JOIN comandas c ON c.id = cl.comanda_id
		JOIN jornadas_operativas j ON j.id = c.jornada_id AND j.estado = 'abierta'
		WHERE cl.id = ?`, lineID).Scan(&current, &commandID)
	if errors.Is(err, sql.ErrNoRows) {
		return &Error{Code: "linea_inexistente", Message: "Línea de comanda inexistente"}
	}
	if err != nil {
		return err
	}
	if current != "por_preparar" && current != "en_proceso" {
		return &Error{Code: "etapa_no_avanzable", Message: "Esta línea ya no puede avanzar"}
	}
	var incidenceID int64
	err = tx.QueryRowContext(ctx, `SELECT id FROM cocina_incidencias
		WHERE comanda_id = ? AND estado = 'pendiente'
		AND (comanda_linea_id IS NULL OR comanda_linea_id = ?) LIMIT 1`, commandID, lineID).Scan(&incidenceID)
	if err == nil {
		return &Error{Code: "incidencia_pendiente", Message: "El mesero debe responder la solicitud antes de preparar"}
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	_, err = tx.ExecContext(ctx, "UPDATE comanda_lineas SET etapa = ?, etapa_actualizada_en = ? WHERE id = ?", stage, time.Now().UTC().Format(time.RFC3339Nano), lineID)
	return err
}
