package reports

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
	"github.com/luizgnz/restaurante/go/internal/accounts"
	"github.com/luizgnz/restaurante/go/internal/inventory"
)

type Error struct{ Code, Message string }

func (err *Error) Error() string { return err.Message }

type Period struct {
	From string
	To   string
}

type SalesProduct struct {
	Name       string
	Quantity   float64
	TotalCents int64
}

type ShiftSales struct {
	Date       string
	Name       string
	Accounts   int
	TotalCents int64
}

type ServiceSales struct {
	ServiceType string
	Accounts    int
	TotalCents  int64
}

type CancelledProduct struct {
	Name     string
	Quantity float64
}

type SalesData struct {
	Products             []SalesProduct
	Shifts               []ShiftSales
	Services             []ServiceSales
	CancelledProducts    []CancelledProduct
	ClosedAccounts       int
	TotalCents           int64
	OpenAccounts         int
	OpenProvisionalCents int64
}

type InventoryRow struct {
	Name, Unit, State                                 string
	OnHand, Reserved, Available, Entries, Consumption float64
	Returns, Losses                                   float64
}

type InventoryLoss struct {
	Reason   string
	Unit     string
	Quantity float64
}

type InventoryData struct {
	Rows   []InventoryRow
	Losses []InventoryLoss
}

func ParsePeriod(from, to string) (Period, error) {
	start, errStart := time.Parse("2006-01-02", strings.TrimSpace(from))
	end, errEnd := time.Parse("2006-01-02", strings.TrimSpace(to))
	if errStart != nil || errEnd != nil || end.Before(start) {
		return Period{}, &Error{"periodo_invalido", "El período del reporte no es válido"}
	}
	if end.Sub(start) > 3660*24*time.Hour {
		return Period{}, &Error{"periodo_muy_amplio", "El período no puede superar diez años"}
	}
	return Period{From: start.Format("2006-01-02"), To: end.Format("2006-01-02")}, nil
}

func Sales(ctx context.Context, db *sql.DB, period Period) (SalesData, error) {
	rows, err := db.QueryContext(ctx, `SELECT c.id,j.id,j.fecha_operativa,COALESCE(j.turno_nombre,'Jornada general')
		FROM cuentas c JOIN jornadas_operativas j ON j.id=c.jornada_id
		WHERE j.fecha_operativa BETWEEN ? AND ? AND c.estado='en_caja' ORDER BY j.fecha_operativa,j.id,c.id`, period.From, period.To)
	if err != nil {
		return SalesData{}, err
	}
	type accountRef struct {
		accountID, journeyID int64
		date, shift          string
	}
	refs := []accountRef{}
	for rows.Next() {
		var ref accountRef
		if err := rows.Scan(&ref.accountID, &ref.journeyID, &ref.date, &ref.shift); err != nil {
			rows.Close()
			return SalesData{}, err
		}
		refs = append(refs, ref)
	}
	if err := rows.Close(); err != nil {
		return SalesData{}, err
	}
	products := map[string]*SalesProduct{}
	shifts := map[int64]*ShiftSales{}
	services := map[string]*ServiceSales{}
	data := SalesData{Products: []SalesProduct{}, Shifts: []ShiftSales{}}
	for _, ref := range refs {
		detail, err := accounts.Get(ctx, db, ref.accountID)
		if err != nil {
			return SalesData{}, err
		}
		currentShift := shifts[ref.journeyID]
		if currentShift == nil {
			currentShift = &ShiftSales{Date: ref.date, Name: ref.shift}
			shifts[ref.journeyID] = currentShift
		}
		currentShift.Accounts++
		currentService := services[detail.ServiceType]
		if currentService == nil {
			currentService = &ServiceSales{ServiceType: detail.ServiceType}
			services[detail.ServiceType] = currentService
		}
		currentService.Accounts++
		data.ClosedAccounts++
		for _, order := range detail.Orders {
			for _, line := range order.Lines {
				if line.Quantity <= 0 {
					continue
				}
				item := products[line.Name]
				if item == nil {
					item = &SalesProduct{Name: line.Name}
					products[line.Name] = item
				}
				lineTotal := int64(math.Round(line.Quantity * float64(line.PriceCents)))
				item.Quantity += line.Quantity
				item.TotalCents += lineTotal
				currentShift.TotalCents += lineTotal
				currentService.TotalCents += lineTotal
				data.TotalCents += lineTotal
			}
		}
	}
	for _, value := range products {
		data.Products = append(data.Products, *value)
	}
	sort.Slice(data.Products, func(i, j int) bool { return data.Products[i].TotalCents > data.Products[j].TotalCents })
	for _, value := range shifts {
		data.Shifts = append(data.Shifts, *value)
	}
	sort.Slice(data.Shifts, func(i, j int) bool {
		if data.Shifts[i].Date == data.Shifts[j].Date {
			return data.Shifts[i].Name < data.Shifts[j].Name
		}
		return data.Shifts[i].Date < data.Shifts[j].Date
	})
	for _, value := range services {
		data.Services = append(data.Services, *value)
	}
	sort.Slice(data.Services, func(i, j int) bool { return data.Services[i].ServiceType < data.Services[j].ServiceType })
	cancelledRows, err := db.QueryContext(ctx, `SELECT p.nombre,SUM(ocl.cantidad_anterior-ocl.cantidad_nueva)
		FROM orden_correccion_lineas ocl
		JOIN orden_correcciones oc ON oc.id=ocl.correccion_id
		JOIN ordenes o ON o.id=oc.orden_id
		JOIN cuentas c ON c.id=o.cuenta_id
		JOIN jornadas_operativas j ON j.id=c.jornada_id
		JOIN productos p ON p.id=ocl.producto_id
		WHERE j.fecha_operativa BETWEEN ? AND ? AND ocl.cantidad_nueva<ocl.cantidad_anterior
		GROUP BY p.id,p.nombre ORDER BY SUM(ocl.cantidad_anterior-ocl.cantidad_nueva) DESC,p.nombre`, period.From, period.To)
	if err != nil {
		return SalesData{}, err
	}
	for cancelledRows.Next() {
		var item CancelledProduct
		if err := cancelledRows.Scan(&item.Name, &item.Quantity); err != nil {
			cancelledRows.Close()
			return SalesData{}, err
		}
		data.CancelledProducts = append(data.CancelledProducts, item)
	}
	if err := cancelledRows.Close(); err != nil {
		return SalesData{}, err
	}
	openRows, err := db.QueryContext(ctx, `SELECT c.id FROM cuentas c JOIN jornadas_operativas j ON j.id=c.jornada_id
		WHERE j.fecha_operativa BETWEEN ? AND ? AND c.estado IN ('abierta','precuenta_emitida')`, period.From, period.To)
	if err != nil {
		return SalesData{}, err
	}
	openIDs := []int64{}
	for openRows.Next() {
		var id int64
		if err := openRows.Scan(&id); err != nil {
			openRows.Close()
			return SalesData{}, err
		}
		openIDs = append(openIDs, id)
	}
	if err := openRows.Close(); err != nil {
		return SalesData{}, err
	}
	for _, id := range openIDs {
		detail, err := accounts.Get(ctx, db, id)
		if err != nil {
			return SalesData{}, err
		}
		data.OpenAccounts++
		data.OpenProvisionalCents += detail.TotalCents
	}
	return data, nil
}

func Inventory(ctx context.Context, db *sql.DB, period Period) (InventoryData, error) {
	materials, err := inventory.List(ctx, db)
	if err != nil {
		return InventoryData{}, err
	}
	type totals struct{ entries, losses, consumption, returns float64 }
	byID := map[int64]*totals{}
	for _, material := range materials {
		byID[material.ID] = &totals{}
	}
	moveRows, err := db.QueryContext(ctx, `SELECT producto_id,tipo,COALESCE(motivo,''),SUM(cantidad_real) FROM inventario_movimientos
		WHERE date(creado_en,'localtime') BETWEEN ? AND ? GROUP BY producto_id,tipo,COALESCE(motivo,'')`, period.From, period.To)
	if err != nil {
		return InventoryData{}, err
	}
	lossesByMaterial := map[int64]map[string]float64{}
	for moveRows.Next() {
		var id int64
		var kind, reason string
		var amount float64
		if err := moveRows.Scan(&id, &kind, &reason, &amount); err != nil {
			moveRows.Close()
			return InventoryData{}, err
		}
		if value := byID[id]; value != nil {
			if kind == "entrada" {
				value.entries += amount
			} else {
				value.losses += amount
				if lossesByMaterial[id] == nil {
					lossesByMaterial[id] = map[string]float64{}
				}
				lossesByMaterial[id][reason] += amount
			}
		}
	}
	if err := moveRows.Close(); err != nil {
		return InventoryData{}, err
	}
	consumedRows, err := db.QueryContext(ctx, `SELECT oli.producto_id,SUM(oli.firmada_real) FROM orden_linea_inventario oli
		JOIN ordenes o ON o.id=oli.orden_id JOIN cuentas c ON c.id=o.cuenta_id JOIN jornadas_operativas j ON j.id=c.jornada_id
		WHERE j.fecha_operativa BETWEEN ? AND ? AND c.estado<>'cancelada' GROUP BY oli.producto_id`, period.From, period.To)
	if err != nil {
		return InventoryData{}, err
	}
	for consumedRows.Next() {
		var id int64
		var amount float64
		if err := consumedRows.Scan(&id, &amount); err != nil {
			consumedRows.Close()
			return InventoryData{}, err
		}
		if value := byID[id]; value != nil {
			value.consumption += amount
		}
	}
	if err := consumedRows.Close(); err != nil {
		return InventoryData{}, err
	}
	returnRows, err := db.QueryContext(ctx, `SELECT oli.producto_id,SUM(cp.cantidad*oli.cantidad_por_unidad)
		FROM cancelaciones_productos_cocina cp JOIN orden_linea_inventario oli ON oli.orden_id=cp.orden_id AND oli.linea_clave=cp.linea_clave
		WHERE date(cp.creada_en,'localtime') BETWEEN ? AND ? GROUP BY oli.producto_id`, period.From, period.To)
	if err != nil {
		return InventoryData{}, err
	}
	for returnRows.Next() {
		var id int64
		var amount float64
		if err := returnRows.Scan(&id, &amount); err != nil {
			returnRows.Close()
			return InventoryData{}, err
		}
		if value := byID[id]; value != nil {
			value.returns += amount
		}
	}
	if err := returnRows.Close(); err != nil {
		return InventoryData{}, err
	}
	result := make([]InventoryRow, 0, len(materials))
	lossSummary := map[string]*InventoryLoss{}
	for _, material := range materials {
		factor := 1.0
		if material.UnidadInventario == "kg" || material.UnidadInventario == "l" {
			factor = 1000
		}
		value := byID[material.ID]
		threshold := math.Max(2, material.EnMano*0.2)
		if material.UmbralPocoStock != nil {
			threshold = *material.UmbralPocoStock
		}
		state := "Disponible"
		if material.Disponible <= 0 {
			state = "Agotado"
		} else if material.Disponible <= threshold {
			state = "Poco stock"
		}
		result = append(result, InventoryRow{Name: material.Nombre, Unit: material.UnidadInventario, State: state, OnHand: material.EnMano, Reserved: material.Reservado, Available: material.Disponible, Entries: value.entries / factor, Consumption: value.consumption / factor, Returns: value.returns / factor, Losses: value.losses / factor})
		for reason, amount := range lossesByMaterial[material.ID] {
			key := reason + "|" + material.UnidadInventario
			item := lossSummary[key]
			if item == nil {
				item = &InventoryLoss{Reason: reasonLabel(reason), Unit: material.UnidadInventario}
				lossSummary[key] = item
			}
			item.Quantity += amount / factor
		}
	}
	data := InventoryData{Rows: result, Losses: []InventoryLoss{}}
	for _, item := range lossSummary {
		data.Losses = append(data.Losses, *item)
	}
	sort.Slice(data.Losses, func(i, j int) bool {
		if data.Losses[i].Reason == data.Losses[j].Reason {
			return data.Losses[i].Unit < data.Losses[j].Unit
		}
		return data.Losses[i].Reason < data.Losses[j].Reason
	})
	return data, nil
}

func SalesPDF(restaurant string, period Period, data SalesData) ([]byte, error) {
	pdf, tr := newPDF("P", restaurant, "Reporte de ventas", period)
	summaryBox(pdf, tr("Cuentas cerradas"), fmt.Sprintf("%d", data.ClosedAccounts), 20)
	summaryBox(pdf, tr("Total registrado"), money(data.TotalCents), 75)
	average := int64(0)
	if data.ClosedAccounts > 0 {
		average = data.TotalCents / int64(data.ClosedAccounts)
	}
	summaryBox(pdf, tr("Promedio por cuenta"), money(average), 130)
	if data.OpenAccounts > 0 {
		// summaryBox deja el cursor debajo de las tarjetas, con margen.
		pdf.SetFillColor(252, 245, 229)
		pdf.SetTextColor(112, 72, 20)
		pdf.SetFont("Helvetica", "", 9)
		pdf.MultiCell(0, 6, tr(fmt.Sprintf("Advertencia: %d cuentas siguen abiertas por %s provisionales. No forman parte del total.", data.OpenAccounts, money(data.OpenProvisionalCents))), "1", "L", true)
	}
	section(pdf, tr("Desglose por turno"))
	tableHeader(pdf, []float64{34, 64, 28, 44}, []string{tr("Fecha"), tr("Turno"), tr("Cuentas"), tr("Total")})
	for _, row := range data.Shifts {
		if ensurePage(pdf, restaurant, "Reporte de ventas", period, 12) {
			tableHeader(pdf, []float64{34, 64, 28, 44}, []string{tr("Fecha"), tr("Turno"), tr("Cuentas"), tr("Total")})
		}
		tableRow(pdf, []float64{34, 64, 28, 44}, []string{row.Date, tr(row.Name), fmt.Sprint(row.Accounts), money(row.TotalCents)}, []string{"L", "L", "R", "R"})
	}
	section(pdf, tr("Mesa y para llevar"))
	tableHeader(pdf, []float64{78, 42, 50}, []string{tr("Tipo de servicio"), tr("Cuentas"), tr("Total")})
	for _, row := range data.Services {
		label := "Mesa"
		if row.ServiceType == "para_llevar" {
			label = "Para llevar"
		}
		tableRow(pdf, []float64{78, 42, 50}, []string{tr(label), fmt.Sprint(row.Accounts), money(row.TotalCents)}, []string{"L", "R", "R"})
	}
	section(pdf, tr("Productos registrados"))
	tableHeader(pdf, []float64{92, 34, 44}, []string{tr("Producto"), tr("Cantidad"), tr("Total")})
	for _, row := range data.Products {
		if ensurePage(pdf, restaurant, "Reporte de ventas", period, 12) {
			tableHeader(pdf, []float64{92, 34, 44}, []string{tr("Producto"), tr("Cantidad"), tr("Total")})
		}
		tableRow(pdf, []float64{92, 34, 44}, []string{tr(row.Name), quantity(row.Quantity), money(row.TotalCents)}, []string{"L", "R", "R"})
	}
	section(pdf, tr("Productos cancelados o reducidos"))
	if len(data.CancelledProducts) == 0 {
		pdf.SetFont("Helvetica", "", 8)
		pdf.SetTextColor(100, 100, 100)
		pdf.CellFormat(0, 6, tr("No hay productos cancelados o reducidos en el período."), "", 1, "L", false, 0, "")
	} else {
		tableHeader(pdf, []float64{126, 44}, []string{tr("Producto"), tr("Cantidad")})
		for _, row := range data.CancelledProducts {
			if ensurePage(pdf, restaurant, "Reporte de ventas", period, 12) {
				tableHeader(pdf, []float64{126, 44}, []string{tr("Producto"), tr("Cantidad")})
			}
			tableRow(pdf, []float64{126, 44}, []string{tr(row.Name), quantity(row.Quantity)}, []string{"L", "R"})
		}
	}
	return output(pdf)
}

func InventoryPDF(restaurant string, period Period, data InventoryData) ([]byte, error) {
	pdf, tr := newPDF("L", restaurant, "Reporte de inventario", period)
	widths := []float64{58, 14, 24, 24, 24, 24, 28, 28, 22, 23}
	head := []string{"Material", "Unidad", "Existencia", "Reservado", "Disponible", "Entradas", "Consumo neto", "Devoluciones", "Pérdidas", "Estado"}
	for i := range head {
		head[i] = tr(head[i])
	}
	tableHeader(pdf, widths, head)
	for _, row := range data.Rows {
		if ensurePage(pdf, restaurant, "Reporte de inventario", period, 10) {
			tableHeader(pdf, widths, head)
		}
		tableRow(pdf, widths, []string{tr(row.Name), row.Unit, quantity(row.OnHand), quantity(row.Reserved), quantity(row.Available), quantity(row.Entries), quantity(row.Consumption), quantity(row.Returns), quantity(row.Losses), tr(row.State)}, []string{"L", "C", "R", "R", "R", "R", "R", "R", "R", "L"})
	}
	section(pdf, tr("Resumen de pérdidas registradas"))
	if len(data.Losses) == 0 {
		pdf.SetFont("Helvetica", "", 8)
		pdf.SetTextColor(100, 100, 100)
		pdf.CellFormat(0, 6, tr("No hay pérdidas registradas en el período."), "", 1, "L", false, 0, "")
	} else {
		tableHeader(pdf, []float64{110, 40, 40}, []string{tr("Motivo"), tr("Unidad"), tr("Cantidad")})
		for _, item := range data.Losses {
			tableRow(pdf, []float64{110, 40, 40}, []string{tr(item.Reason), item.Unit, quantity(item.Quantity)}, []string{"L", "C", "R"})
		}
	}
	pdf.Ln(3)
	pdf.SetFont("Helvetica", "", 8)
	pdf.SetTextColor(100, 100, 100)
	pdf.MultiCell(0, 5, tr("Las devoluciones corresponden a productos cancelados por Cocina; las existencias actuales ya reflejan todos los ajustes aplicados."), "", "L", false)
	return output(pdf)
}

func reasonLabel(reason string) string {
	switch reason {
	case "producto_danado":
		return "Producto dañado"
	case "consumo_interno":
		return "Consumo interno"
	case "anulacion_preparacion":
		return "Preparación cancelada"
	default:
		return "Otro"
	}
}

func newPDF(orientation, restaurant, title string, period Period) (*fpdf.Fpdf, func(string) string) {
	pdf := fpdf.New(orientation, "mm", "A4", "")
	tr := pdf.UnicodeTranslatorFromDescriptor("")
	pdf.SetMargins(14, 18, 14)
	pdf.SetAutoPageBreak(true, 16)
	pdf.SetHeaderFunc(func() {
		pdf.SetY(10)
		pdf.SetTextColor(150, 72, 44)
		pdf.SetFont("Helvetica", "B", 13)
		pdf.CellFormat(0, 6, tr(restaurant), "", 1, "L", false, 0, "")
		pdf.SetTextColor(30, 30, 30)
		pdf.SetFont("Helvetica", "B", 18)
		pdf.CellFormat(0, 9, tr(title), "", 1, "L", false, 0, "")
		pdf.SetFont("Helvetica", "", 9)
		pdf.SetTextColor(105, 105, 105)
		pdf.CellFormat(0, 5, tr(fmt.Sprintf("Período: %s al %s · Generado: %s", period.From, period.To, time.Now().Format("02-01-2006 15:04"))), "", 1, "L", false, 0, "")
		pdf.Ln(3)
	})
	pdf.SetFooterFunc(func() {
		pdf.SetY(-12)
		pdf.SetFont("Helvetica", "", 8)
		pdf.SetTextColor(120, 120, 120)
		pdf.CellFormat(0, 5, tr(fmt.Sprintf("Página %d", pdf.PageNo())), "", 0, "C", false, 0, "")
	})
	pdf.AddPage()
	return pdf, tr
}

func summaryBox(pdf *fpdf.Fpdf, label, value string, x float64) {
	pdf.SetXY(x, 42)
	pdf.SetFillColor(248, 245, 239)
	pdf.SetDrawColor(220, 213, 202)
	pdf.Rect(x, 42, 50, 22, "DF")
	pdf.SetXY(x+4, 46)
	pdf.SetFont("Helvetica", "", 8)
	pdf.SetTextColor(105, 105, 105)
	pdf.CellFormat(42, 4, label, "", 1, "L", false, 0, "")
	pdf.SetX(x + 4)
	pdf.SetFont("Helvetica", "B", 13)
	pdf.SetTextColor(30, 30, 30)
	pdf.CellFormat(42, 7, value, "", 0, "L", false, 0, "")
	pdf.SetY(69)
}
func section(pdf *fpdf.Fpdf, title string) {
	if pdf.GetY() > 180 {
		pdf.AddPage()
	}
	pdf.Ln(4)
	pdf.SetFont("Helvetica", "B", 11)
	pdf.SetTextColor(30, 30, 30)
	pdf.CellFormat(0, 7, title, "", 1, "L", false, 0, "")
}
func tableHeader(pdf *fpdf.Fpdf, widths []float64, values []string) {
	pdf.SetFont("Helvetica", "B", 8)
	pdf.SetFillColor(46, 42, 38)
	pdf.SetTextColor(255, 255, 255)
	for i, value := range values {
		pdf.CellFormat(widths[i], 7, value, "1", 0, "L", true, 0, "")
	}
	pdf.Ln(-1)
}
func tableRow(pdf *fpdf.Fpdf, widths []float64, values, align []string) {
	pdf.SetFont("Helvetica", "", 8)
	pdf.SetFillColor(255, 253, 249)
	pdf.SetTextColor(35, 35, 35)
	for i, value := range values {
		pdf.CellFormat(widths[i], 6, value, "1", 0, align[i], true, 0, "")
	}
	pdf.Ln(-1)
}
func ensurePage(pdf *fpdf.Fpdf, restaurant, title string, period Period, height float64) bool {
	_, pageH := pdf.GetPageSize()
	_, _, _, bottom := pdf.GetMargins()
	if pdf.GetY()+height > pageH-bottom {
		pdf.AddPage()
		return true
	}
	return false
}
func output(pdf *fpdf.Fpdf) ([]byte, error) {
	var buffer bytes.Buffer
	if err := pdf.Output(&buffer); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}
// Los campos históricos "centavos" guardan pesos enteros (CLP), igual que
// productos.precio_centavos y el formateador compartido de la interfaz.
func money(pesos int64) string { return fmt.Sprintf("$%s", groupThousands(pesos)) }
func groupThousands(value int64) string {
	raw := fmt.Sprint(value)
	for i := len(raw) - 3; i > 0; i -= 3 {
		raw = raw[:i] + "." + raw[i:]
	}
	return raw
}
func quantity(value float64) string {
	if math.Abs(value-math.Round(value)) < 0.0005 {
		return fmt.Sprintf("%.0f", value)
	}
	return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.3f", value), "0"), ".")
}
