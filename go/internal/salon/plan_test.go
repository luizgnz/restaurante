package salon_test

import (
	"context"
	"path/filepath"
	"testing"

	appRuntime "github.com/luizgnz/restaurante/go/internal/runtime"
	"github.com/luizgnz/restaurante/go/internal/salon"
)

func TestSavePlanPersistsAndProtectsOccupiedTable(t *testing.T) {
	ctx := context.Background()
	migrations, _ := filepath.Abs(filepath.Join("..", "..", "..", "src", "db", "migrations"))
	db, err := appRuntime.OpenAndMigrate(ctx, filepath.Join(t.TempDir(), "salon.sqlite"), migrations)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	floors, err := salon.SavePlan(ctx, db, salon.PlanInput{Pisos: []salon.FloorInput{{Nombre: "Terraza", Mesas: []salon.TableInput{{Numero: 21, Asientos: 4, PosX: 12, PosY: 18, Forma: "round", Ancho: 96, Alto: 96}}}}})
	if err != nil || len(floors) != 1 {
		t.Fatalf("pisos=%#v err=%v", floors, err)
	}
	view, err := salon.List(ctx, db)
	if err != nil || len(view.Mesas) != 1 || view.Mesas[0].Forma != "round" {
		t.Fatalf("vista=%#v err=%v", view, err)
	}
	var employeeID int64
	if err := db.QueryRow("INSERT INTO empleados (nombre,pin_hash,derecho,activo) VALUES ('Ana','x','basico',1) RETURNING id").Scan(&employeeID); err != nil {
		t.Fatal(err)
	}
	journeyID := int64(1)
	tableID := view.Mesas[0].ID
	if _, err := db.Exec("INSERT INTO cuentas (mesa_id,estado,abierta_por_empleado_id,abierta_en,jornada_id,tipo_servicio) VALUES (?,'abierta',?,datetime('now'),?,'mesa')", tableID, employeeID, journeyID); err != nil {
		t.Fatal(err)
	}
	_, err = salon.SavePlan(ctx, db, salon.PlanInput{QuitarMesaIDs: []int64{tableID}})
	if err == nil {
		t.Fatal("se permitió quitar una mesa ocupada")
	}
}
