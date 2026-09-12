package printing

import (
	"context"
	"database/sql"
	"net"
	"strings"
	"testing"
	"time"

	"github.com/luizgnz/restaurante/go/internal/config"
	_ "modernc.org/sqlite"
)

func TestRenderKeepsReprintLabelWithSnapshot(t *testing.T) {
	result := render("precuenta", `{"reimpresion":true,"snapshot":{"mesaNumero":3,"lineas":[]}}`)
	if !strings.Contains(result, "PRECUENTA (reimpresión)") {
		t.Fatalf("impresión=%q", result)
	}
}

func TestDispatchMarksDisabledPrinterJobSent(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE print_jobs (id INTEGER PRIMARY KEY,kind TEXT,payload TEXT,status TEXT,attempts INTEGER,last_error TEXT,created_en TEXT);
		INSERT INTO print_jobs(kind,payload,status,attempts,created_en) VALUES ('comanda','{"mesaNumero":4,"lineas":[]}','queued',0,'ahora')`); err != nil {
		t.Fatal(err)
	}
	if err := Dispatch(context.Background(), db, config.Defaults()); err != nil {
		t.Fatal(err)
	}
	var status string
	var attempts int
	if err := db.QueryRow("SELECT status,attempts FROM print_jobs").Scan(&status, &attempts); err != nil {
		t.Fatal(err)
	}
	if status != "sent" || attempts != 1 {
		t.Fatalf("estado=%s intentos=%d", status, attempts)
	}
}

func TestDiagnoseConnectsToTCPPrinter(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	go func() {
		connection, err := listener.Accept()
		if err == nil {
			connection.Close()
		}
	}()
	port := listener.Addr().(*net.TCPAddr).Port
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	result := Diagnose(ctx, config.Printer{Host: "127.0.0.1", Port: port})
	if !result.Conectado {
		t.Fatalf("diagnóstico=%#v", result)
	}
}
