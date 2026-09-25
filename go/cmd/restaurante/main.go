package main

import (
	"context"
	"flag"
	"fmt"
	"io"
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
	verifyInstall := flag.Bool("verify-install", false, "valida datos, migraciones y catálogo y termina")
	logFile := flag.String("log-file", "", "archivo para registrar errores y arranques")
	noBrowser := flag.Bool("no-browser", false, "no abre el navegador al iniciar el servidor")
	flag.Parse()
	if *logFile != "" {
		if err := os.MkdirAll(filepath.Dir(*logFile), 0o750); err != nil {
			log.Fatalf("crear directorio de registro: %v", err)
		}
		file, err := os.OpenFile(*logFile, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
		if err != nil {
			log.Fatalf("abrir registro: %v", err)
		}
		defer file.Close()
		log.SetOutput(io.MultiWriter(os.Stderr, file))
	}
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
	if *verifyInstall {
		if _, err := os.Stat(filepath.Join(*uiDir, "index.html")); err != nil {
			log.Fatalf("interfaz no disponible: %v", err)
		}
		if err := db.PingContext(context.Background()); err != nil {
			log.Fatalf("validar base de datos: %v", err)
		}
		log.Printf("Instalación verificada: %s", app.DatabasePath(*data))
		return
	}

	server := &http.Server{
		Addr:              *listen,
		Handler:           app.NewHandler(db, filepath.Clean(*uiDir), appConfig, *data),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("Restaurante Go en http://%s", *listen)
	log.Printf("Datos SQLite: %s", app.DatabasePath(*data))
	log.Printf("Inventario: %s · sin stock: %s", appConfig.PoliticaInventario, appConfig.BloqueoSinStock)
	if !*noBrowser {
		openBrowser(*listen)
	}
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
