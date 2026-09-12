package orders

import "testing"

func TestValidateNewOrder(t *testing.T) {
	valid := NewInput{TableID: 1, ServiceType: "mesa", Key: "k-1", Lines: []Line{{ProductID: 2, Quantity: 1}}}
	if err := Validate(valid); err != nil {
		t.Fatal(err)
	}
	valid.Key = ""
	if err := Validate(valid); err == nil {
		t.Fatal("debía exigir idempotencia")
	}
}
