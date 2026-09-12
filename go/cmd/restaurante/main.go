package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	goRuntime "runtime"
	"strconv"
	"time"

	"github.com/luizgnz/restaurante/go/internal/bootstrap"
	"github.com/luizgnz/restaurante/go/internal/config"
	app "github.com/luizgnz/restaurante/go/internal/runtime"
)

func main() {
	dataDir, err := app.DataDir()
	if err != nil {
		log.Fatal(err)
	}
	listen := flag.String("listen", "", "dirección HTTP (vacía usa la configuración)")
	uiDir := flag.String("ui-dir", "ui/dist", "directorio de la UI compilada")
	migrationsDir := flag.String("migrations-dir", "src/db/migrations", "directorio de migraciones SQLite")
	data := flag.String("data-dir", dataDir, "directorio persistente de datos")
	flag.Parse()
	appConfig, err := config.Load(*data)
	if err != nil {
		log.Fatalf("cargar configuración: %v", err)
	}
	if *listen == "" {
		host := "127.0.0.1"
		if appConfig.ServidorRedHabilitado {
			host = "0.0.0.0"
		}
		*listen = fmt.Sprintf("%s:%d", host, portFromEnv(appConfig.Puerto))
	}

	db, err := app.OpenAndMigrate(context.Background(), app.DatabasePath(*data), *migrationsDir)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if err := bootstrap.Ensure(context.Background(), db); err != nil {
		log.Fatalf("preparar instalación: %v", err)
	}

	server := &http.Server{
		Addr:              *listen,
		Handler:           app.NewHandler(db, filepath.Clean(*uiDir), appConfig, *data),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("Restaurante Go en http://%s", *listen)
	log.Printf("Datos SQLite: %s", app.DatabasePath(*data))
	log.Printf("Inventario: %s · sin stock: %s", appConfig.PoliticaInventario, appConfig.BloqueoSinStock)
	openBrowser(*listen)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func openBrowser(listen string) {
	if os.Getenv("RESTAURANTE_NO_OPEN") == "1" {
		return
	}
	_, port, err := net.SplitHostPort(listen)
	if err != nil {
		return
	}
	url := "http://127.0.0.1:" + port
	go func() {
		time.Sleep(450 * time.Millisecond)
		var command *exec.Cmd
		switch goRuntime.GOOS {
		case "darwin":
			command = exec.Command("open", url)
		case "windows":
			command = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
		default:
			command = exec.Command("xdg-open", url)
		}
		_ = command.Start()
	}()
}

func portFromEnv(defaultPort int) int {
	port, err := strconv.Atoi(os.Getenv("PORT"))
	if err != nil || port < 1 || port > 65535 {
		return defaultPort
	}
	return port
}
