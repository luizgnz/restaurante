package reports

import (
	"os"
	"testing"
)

// Reproduce los importes y las cuentas abiertas de la captura reportada.
// La exportación opcional permite inspeccionar visualmente el PDF real.
func TestSalesPDFWithOpenAccounts(t *testing.T) {
	data := SalesData{
		ClosedAccounts: 2, TotalCents: 54000,
		OpenAccounts: 2, OpenProvisionalCents: 53000,
		Shifts:   []ShiftSales{{Date: "2026-09-26", Name: "Jornada general", Accounts: 2, TotalCents: 54000}},
		Services: []ServiceSales{{ServiceType: "mesa", Accounts: 2, TotalCents: 54000}},
		Products: []SalesProduct{
			{Name: "Bistec de panita", Quantity: 4, TotalCents: 32000},
			{Name: "Carne a la cacerola", Quantity: 2, TotalCents: 19000},
			{Name: "Agua con gas", Quantity: 3, TotalCents: 3000},
		},
	}
	content, err := SalesPDF("Restaurante", Period{From: "2026-09-26", To: "2026-09-26"}, data)
	if err != nil {
		t.Fatal(err)
	}
	if path := os.Getenv("RESTAURANTE_REPORT_QA_PDF"); path != "" {
		if err := os.WriteFile(path, content, 0o600); err != nil {
			t.Fatal(err)
		}
	}
}
