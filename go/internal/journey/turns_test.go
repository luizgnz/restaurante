package journey_test

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/luizgnz/restaurante/go/internal/journey"
	appRuntime "github.com/luizgnz/restaurante/go/internal/runtime"
)

func TestTurnTemplatesSelectDefaultAndNamedTurn(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	migrations, _ := filepath.Abs(filepath.Join("..", "..", "..", "src", "db", "migrations"))
	db, err := appRuntime.OpenAndMigrate(ctx, filepath.Join(root, "data", "turnos.sqlite"), migrations)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })

	start, end := "18:00", "23:30"
	night, err := journey.SaveTemplate(ctx, db, journey.Template{
		Nombre: "Turno noche", HoraInicio: &start, HoraFin: &end, EsPredeterminada: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := journey.Close(ctx, db, nil, root); err != nil {
		t.Fatal(err)
	}
	opened, err := journey.OpenWithTemplate(ctx, db, nil, night.ID)
	if err != nil {
		t.Fatal(err)
	}
	if opened.TurnoNombre != "Turno noche" || opened.TurnoPlantillaID == nil || *opened.TurnoPlantillaID != night.ID {
		t.Fatalf("turno abierto inesperado: %#v", opened)
	}
	templates, err := journey.ListTemplates(ctx, db, false)
	if err != nil || len(templates) != 2 || templates[0].ID != night.ID {
		t.Fatalf("plantillas inesperadas: %#v, %v", templates, err)
	}
}

func TestBulkCloseCancelsEmptyAccountsAndRecordsEffectiveTime(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	migrations, _ := filepath.Abs(filepath.Join("..", "..", "..", "src", "db", "migrations"))
	db, err := appRuntime.OpenAndMigrate(ctx, filepath.Join(root, "data", "cierre.sqlite"), migrations)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	db.SetMaxOpenConns(1)

	state, err := journey.Current(ctx, db)
	if err != nil || state.Jornada == nil {
		t.Fatalf("jornada inicial: %#v, %v", state, err)
	}
	if _, err := db.Exec("UPDATE jornadas_operativas SET abierta_en=? WHERE id=?", time.Now().UTC().Add(-2*time.Minute).Format(time.RFC3339Nano), state.Jornada.ID); err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`
		INSERT INTO empleados (id,nombre,pin_hash,derecho,activo) VALUES (700,'Encargada','x','avanzado',1);
		INSERT INTO pisos (id,nombre,activo) VALUES (701,'Prueba cierre',1);
		INSERT INTO mesas (id,piso_id,numero,asientos,activa) VALUES (702,701,99,4,1);
		INSERT INTO cuentas (id,mesa_id,estado,abierta_por_empleado_id,abierta_en,jornada_id,tipo_servicio)
		VALUES (703,702,'abierta',700,datetime('now'),?,'mesa')`, state.Jornada.ID)
	if err != nil {
		t.Fatal(err)
	}
	summary, err := journey.GetSummary(ctx, db, state.Jornada.ID)
	if err != nil || summary.CuentasActivas != 1 || summary.CuentasVacias != 1 {
		t.Fatalf("resumen inesperado: %#v, %v", summary, err)
	}
	effective := time.Now().UTC().Add(-time.Minute)
	closed, err := journey.CloseBulk(ctx, db, 700, root, &effective)
	if err != nil {
		t.Fatal(err)
	}
	if closed.CierreMasivo == nil || len(closed.CierreMasivo.CancelledAccountIDs) != 1 || closed.CierreMasivo.CancelledAccountIDs[0] != 703 {
		t.Fatalf("cierre masivo inesperado: %#v", closed)
	}
	var accountState string
	if err := db.QueryRow("SELECT estado FROM cuentas WHERE id=703").Scan(&accountState); err != nil || accountState != "cancelada" {
		t.Fatalf("cuenta=%q, err=%v", accountState, err)
	}
	if closed.Jornada.CierreRegistradoEn == nil || closed.Jornada.CerradaEn == nil || *closed.Jornada.CierreRegistradoEn == *closed.Jornada.CerradaEn {
		t.Fatalf("no distinguió cierre efectivo y registro: %#v", closed.Jornada)
	}
}
