package reports

import "testing"

func TestMoneyPreservesCLPPesos(t *testing.T) {
	for _, test := range []struct {
		pesos int64
		want  string
	}{
		{0, "$0"}, {99, "$99"}, {1500, "$1.500"},
		{32000, "$32.000"}, {19000, "$19.000"}, {3000, "$3.000"},
		{54000, "$54.000"}, {27000, "$27.000"}, {53000, "$53.000"},
	} {
		if got := money(test.pesos); got != test.want {
			t.Errorf("money(%d) = %q; esperado %q", test.pesos, got, test.want)
		}
	}
}
