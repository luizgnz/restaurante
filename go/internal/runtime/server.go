package runtime

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/luizgnz/restaurante/go/internal/accounts"
	"github.com/luizgnz/restaurante/go/internal/auth"
	"github.com/luizgnz/restaurante/go/internal/billing"
	"github.com/luizgnz/restaurante/go/internal/catalog"
	"github.com/luizgnz/restaurante/go/internal/config"
	"github.com/luizgnz/restaurante/go/internal/delivery"
	"github.com/luizgnz/restaurante/go/internal/incidents"
	"github.com/luizgnz/restaurante/go/internal/inventory"
	"github.com/luizgnz/restaurante/go/internal/journey"
	"github.com/luizgnz/restaurante/go/internal/kds"
	"github.com/luizgnz/restaurante/go/internal/orders"
	"github.com/luizgnz/restaurante/go/internal/printing"
	"github.com/luizgnz/restaurante/go/internal/salon"
)

// NewHandler construye el servidor HTTP de producción y conserva el contrato
// que consume la interfaz React.
func NewHandler(db *sql.DB, uiDir string, appConfig config.App, dataDirs ...string) http.Handler {
	var configState atomic.Pointer[config.App]
	configState.Store(&appConfig)
	dataDir := ""
	if len(dataDirs) > 0 {
		dataDir = dataDirs[0]
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/salud", func(w http.ResponseWriter, r *http.Request) {
		if err := db.PingContext(r.Context()); err != nil {
			http.Error(w, "base de datos no disponible", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(map[string]any{"ok": true, "runtime": "go"})
	})
	mux.HandleFunc("GET /api/sesion", func(w http.ResponseWriter, r *http.Request) {
		session, err := auth.ByToken(r.Context(), db, sessionToken(r))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "sesion_invalida", "No se pudo leer la sesión")
			return
		}
		if session == nil {
			writeJSON(w, http.StatusOK, map[string]any{"abierta": false, "usuario": nil, "administrador": nil})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"abierta": true, "usuario": session.Usuario, "administrador": session.Usuario})
	})
	mux.HandleFunc("POST /api/sesion/abrir", func(w http.ResponseWriter, r *http.Request) {
		defer r.Body.Close()
		var input struct {
			Usuario  string `json:"usuario"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&input); err != nil {
			writeError(w, http.StatusBadRequest, "credenciales_invalidas", "Usuario o contraseña incorrectos")
			return
		}
		token, session, err := auth.Open(r.Context(), db, input.Usuario, input.Password)
		if err == auth.ErrCredentials {
			writeError(w, http.StatusUnauthorized, "credenciales_invalidas", "Usuario o contraseña incorrectos")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "sesion_no_disponible", "No se pudo abrir la sesión")
			return
		}
		http.SetCookie(w, &http.Cookie{Name: auth.CookieName, Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: 12 * 60 * 60})
		writeJSON(w, http.StatusOK, map[string]any{"abierta": true, "usuario": session.Usuario, "administrador": session.Usuario})
	})
	mux.HandleFunc("POST /api/sesion/cerrar", func(w http.ResponseWriter, r *http.Request) {
		if err := auth.Close(r.Context(), db, sessionToken(r)); err != nil {
			writeError(w, http.StatusInternalServerError, "sesion_no_disponible", "No se pudo cerrar la sesión")
			return
		}
		deleteSessionCookie(w)
		writeJSON(w, http.StatusOK, map[string]any{"abierta": false, "usuario": nil, "administrador": nil})
	})
	mux.HandleFunc("POST /api/sesion/cerrar-turno", func(w http.ResponseWriter, r *http.Request) {
		session, err := auth.ByToken(r.Context(), db, sessionToken(r))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "sesion_no_disponible", "No se pudo leer la sesión")
			return
		}
		if err := auth.CloseTurn(r.Context(), db, session); err == auth.ErrForbidden {
			writeError(w, http.StatusForbidden, "sin_derecho", "Solo un administrador puede cerrar el turno")
			return
		} else if err != nil {
			writeError(w, http.StatusInternalServerError, "sesion_no_disponible", "No se pudo cerrar el turno")
			return
		}
		deleteSessionCookie(w)
		writeJSON(w, http.StatusOK, map[string]any{"abierta": false, "usuario": nil, "administrador": nil})
	})
	mux.HandleFunc("GET /api/complementos", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireSession(w, r, db); !ok {
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"plugins": []any{}, "mensajes": []any{}})
	})
	mux.HandleFunc("GET /api/config", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireSession(w, r, db); !ok {
			return
		}
		writeJSON(w, http.StatusOK, publicConfig(*configState.Load()))
	})
	mux.HandleFunc("POST /api/config", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "administrador") {
			return
		}
		var patch map[string]json.RawMessage
		if !decodeJSON(w, r, &patch, 1<<20) {
			return
		}
		updated, err := applyConfigPatch(*configState.Load(), patch)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Code, err.Message)
			return
		}
		if dataDir != "" {
			if err := config.Save(dataDir, updated); err != nil {
				writeError(w, http.StatusInternalServerError, "config_no_disponible", "No se pudo guardar la configuración")
				return
			}
		}
		configState.Store(&updated)
		writeJSON(w, http.StatusOK, publicConfig(updated))
	})
	mux.HandleFunc("GET /api/empleados", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "administrador") {
			return
		}
		employees, err := auth.ListEmployees(r.Context(), db)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "empleados_no_disponibles", "No se pudo consultar el equipo")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"empleados": employees})
	})
	mux.HandleFunc("GET /api/usuarios", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "administrador") {
			return
		}
		users, err := auth.ListUsers(r.Context(), db)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "usuarios_no_disponibles", "No se pudo consultar los usuarios")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"usuarios": users, "roles": auth.Roles})
	})
	mux.HandleFunc("POST /api/usuarios", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "administrador") {
			return
		}
		input, ok := userInputFromRequest(w, r, true)
		if !ok {
			return
		}
		user, err := auth.CreateUser(r.Context(), db, input)
		if !writeUserError(w, err) {
			writeJSON(w, http.StatusCreated, map[string]any{"usuario": user})
		}
	})
	mux.HandleFunc("PUT /api/usuarios/{id}", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "administrador") {
			return
		}
		id, ok := routeID(w, r)
		if !ok {
			return
		}
		input, ok := userInputFromRequest(w, r, false)
		if !ok {
			return
		}
		user, err := auth.UpdateUser(r.Context(), db, id, input)
		if !writeUserError(w, err) {
			writeJSON(w, http.StatusOK, map[string]any{"usuario": user})
		}
	})
	mux.HandleFunc("GET /api/jornadas/actual", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "administrador") {
			return
		}
		state, err := journey.Current(r.Context(), db)
		if !writeJourneyError(w, err, "jornada_no_disponible") {
			writeJSON(w, http.StatusOK, state)
		}
	})
	mux.HandleFunc("POST /api/jornadas/abrir", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireSession(w, r, db)
		if !ok {
			return
		}
		if !userHasAnyRole(session.Usuario, "administrador") {
			writeError(w, http.StatusForbidden, "sin_derecho", "Solo Administración puede abrir la jornada")
			return
		}
		employeeID := session.Usuario.ID
		item, err := journey.Open(r.Context(), db, &employeeID)
		if writeJourneyError(w, err, "jornada_no_disponible") {
			return
		}
		state, err := journey.Current(r.Context(), db)
		if !writeJourneyError(w, err, "jornada_no_disponible") {
			writeJSON(w, http.StatusCreated, map[string]any{"jornada": item, "resumen": state.Resumen})
		}
	})
	mux.HandleFunc("POST /api/jornadas/cerrar", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireSession(w, r, db)
		if !ok {
			return
		}
		if !userHasAnyRole(session.Usuario, "administrador") {
			writeError(w, http.StatusForbidden, "sin_derecho", "Solo Administración puede cerrar la jornada")
			return
		}
		employeeID := session.Usuario.ID
		result, err := journey.Close(r.Context(), db, &employeeID, dataDir)
		if !writeJourneyError(w, err, "jornada_no_disponible") {
			writeJSON(w, http.StatusOK, result)
		}
	})
	mux.HandleFunc("POST /api/jornadas/demo/reiniciar", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireSession(w, r, db)
		if !ok {
			return
		}
		if !userHasAnyRole(session.Usuario, "administrador") {
			writeError(w, http.StatusForbidden, "sin_derecho", "Solo Administración puede reiniciar el día de demostración")
			return
		}
		employeeID := session.Usuario.ID
		result, err := journey.ResetDemo(r.Context(), db, &employeeID, dataDir)
		if writeJourneyError(w, err, "demo_no_disponible") {
			return
		}
		state, err := journey.Current(r.Context(), db)
		if !writeJourneyError(w, err, "jornada_no_disponible") {
			writeJSON(w, http.StatusOK, map[string]any{"jornadaId": result.JornadaID, "cuentas": result.Cuentas, "respaldoRuta": result.RespaldoRuta, "estado": state})
		}
	})
	mux.HandleFunc("GET /api/inventario", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireSession(w, r, db); !ok {
			return
		}
		materials, err := inventory.List(r.Context(), db)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "inventario_no_disponible", "No se pudo consultar el inventario")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"materiales": materials})
	})
	mux.HandleFunc("POST /api/inventario/{id}/entradas", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireSession(w, r, db); !ok {
			return
		}
		id, ok := routeID(w, r)
		if !ok {
			return
		}
		amount, pin, _, ok := inventoryInput(w, r, false)
		if !ok {
			return
		}
		result, err := inventory.RegisterEntry(r.Context(), db, id, amount, pin)
		if !writeInventoryError(w, err) {
			writeJSON(w, http.StatusCreated, result)
		}
	})
	mux.HandleFunc("POST /api/inventario/{id}/perdidas", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireSession(w, r, db); !ok {
			return
		}
		id, ok := routeID(w, r)
		if !ok {
			return
		}
		amount, pin, reason, ok := inventoryInput(w, r, true)
		if !ok {
			return
		}
		result, err := inventory.RegisterLoss(r.Context(), db, id, amount, reason, pin)
		if !writeInventoryError(w, err) {
			writeJSON(w, http.StatusCreated, result)
		}
	})
	mux.HandleFunc("GET /api/mesas", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "mesero", "encargado_turno") {
			return
		}
		view, err := salon.List(r.Context(), db)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "salon_no_disponible", "No se pudo consultar el salón")
			return
		}
		writeJSON(w, http.StatusOK, view)
	})
	mux.HandleFunc("PUT /api/plano", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "administrador") {
			return
		}
		var input salon.PlanInput
		if !decodeJSON(w, r, &input, 10<<20) {
			return
		}
		floors, err := salon.SavePlan(r.Context(), db, input)
		if !writeSalonError(w, err, "plano_no_disponible") {
			writeJSON(w, http.StatusOK, map[string]any{"pisos": floors})
		}
	})
	mux.HandleFunc("GET /api/pisos/{id}/fondo", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "mesero", "encargado_turno") {
			return
		}
		id, ok := routeID(w, r)
		if !ok {
			return
		}
		mime, data, err := salon.GetBackground(r.Context(), db, id)
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "fondo_no_disponible", "No se pudo consultar el fondo")
			return
		}
		w.Header().Set("Content-Type", mime)
		w.Header().Set("Cache-Control", "private, max-age=60")
		_, _ = w.Write(data)
	})
	mux.HandleFunc("POST /api/pisos/{id}/fondo", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "administrador") {
			return
		}
		id, ok := routeID(w, r)
		if !ok {
			return
		}
		var input struct {
			DataURL string `json:"dataUrl"`
		}
		if !decodeJSON(w, r, &input, 10<<20) {
			return
		}
		err := salon.SaveBackground(r.Context(), db, id, input.DataURL)
		if !writeSalonError(w, err, "fondo_no_disponible") {
			writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		}
	})
	mux.HandleFunc("GET /api/carta", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "mesero", "encargado_turno", "cocina") {
			return
		}
		products, err := catalog.List(r.Context(), db)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "carta_no_disponible", "No se pudo consultar la carta")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"productos": products})
	})
	mux.HandleFunc("GET /api/categorias", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "mesero", "encargado_turno") {
			return
		}
		items, err := catalog.ListCategories(r.Context(), db)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "categorias_no_disponibles", "No se pudieron consultar las categorías")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"categorias": items})
	})
	mux.HandleFunc("POST /api/categorias", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "administrador") {
			return
		}
		var input struct {
			Nombre string `json:"nombre"`
		}
		if !decodeJSON(w, r, &input, 16<<10) {
			return
		}
		item, err := catalog.CreateCategory(r.Context(), db, input.Nombre)
		if !writeCatalogError(w, err, "categoria_no_disponible") {
			writeJSON(w, http.StatusCreated, item)
		}
	})
	mux.HandleFunc("GET /api/productos", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "administrador") {
			return
		}
		items, err := catalog.ListProducts(r.Context(), db)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "productos_no_disponibles", "No se pudieron consultar los productos")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"productos": items})
	})
	mux.HandleFunc("POST /api/productos", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "administrador") {
			return
		}
		var input catalog.ProductInput
		if !decodeJSON(w, r, &input, 2<<20) {
			return
		}
		id, err := catalog.CreateProduct(r.Context(), db, input)
		if !writeCatalogError(w, err, "producto_no_disponible") {
			writeJSON(w, http.StatusCreated, map[string]any{"id": id})
		}
	})
	mux.HandleFunc("GET /api/productos/{id}/receta", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "administrador") {
			return
		}
		id, ok := routeID(w, r)
		if !ok {
			return
		}
		items, err := catalog.GetRecipe(r.Context(), db, id)
		if !writeCatalogError(w, err, "receta_no_disponible") {
			writeJSON(w, http.StatusOK, map[string]any{"receta": items})
		}
	})
	mux.HandleFunc("PUT /api/productos/{id}/receta", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "administrador") {
			return
		}
		id, ok := routeID(w, r)
		if !ok {
			return
		}
		var input struct {
			Receta []catalog.RecipeLine `json:"receta"`
		}
		if !decodeJSON(w, r, &input, 1<<20) {
			return
		}
		err := catalog.SaveRecipe(r.Context(), db, id, input.Receta)
		if writeCatalogError(w, err, "receta_no_disponible") {
			return
		}
		items, err := catalog.GetRecipe(r.Context(), db, id)
		if !writeCatalogError(w, err, "receta_no_disponible") {
			writeJSON(w, http.StatusOK, map[string]any{"receta": items})
		}
	})
	mux.HandleFunc("GET /api/contornos", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "mesero", "encargado_turno") {
			return
		}
		groups, err := catalog.ListContours(r.Context(), db)
		if !writeCatalogError(w, err, "contornos_no_disponibles") {
			writeJSON(w, http.StatusOK, map[string]any{"grupos": groups})
		}
	})
	mux.HandleFunc("POST /api/contornos/grupos", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "administrador") {
			return
		}
		var input struct {
			Nombre string `json:"nombre"`
		}
		if !decodeJSON(w, r, &input, 16<<10) {
			return
		}
		item, err := catalog.CreateContourGroup(r.Context(), db, input.Nombre)
		if !writeCatalogError(w, err, "contorno_no_disponible") {
			writeJSON(w, http.StatusCreated, item)
		}
	})
	mux.HandleFunc("POST /api/contornos/variantes", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "administrador") {
			return
		}
		var input struct {
			GrupoID            int64   `json:"grupoId"`
			Nombre             string  `json:"nombre"`
			SuplementoCentavos float64 `json:"suplementoCentavos"`
			ExtraCentavos      float64 `json:"extraCentavos"`
		}
		if !decodeJSON(w, r, &input, 16<<10) {
			return
		}
		id, err := catalog.CreateContourVariant(r.Context(), db, input.GrupoID, input.Nombre, input.SuplementoCentavos, input.ExtraCentavos)
		if !writeCatalogError(w, err, "contorno_no_disponible") {
			writeJSON(w, http.StatusCreated, map[string]any{"id": id})
		}
	})
	mux.HandleFunc("GET /api/productos/{id}/slots", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "mesero", "encargado_turno") {
			return
		}
		id, ok := routeID(w, r)
		if !ok {
			return
		}
		items, err := catalog.GetSlots(r.Context(), db, id)
		if !writeCatalogError(w, err, "slots_no_disponibles") {
			writeJSON(w, http.StatusOK, map[string]any{"slots": items})
		}
	})
	mux.HandleFunc("PUT /api/productos/{id}/slots", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "administrador") {
			return
		}
		id, ok := routeID(w, r)
		if !ok {
			return
		}
		var input struct {
			Slots []catalog.SlotInput `json:"slots"`
		}
		if !decodeJSON(w, r, &input, 1<<20) {
			return
		}
		err := catalog.SaveSlots(r.Context(), db, id, input.Slots)
		if writeCatalogError(w, err, "slots_no_disponibles") {
			return
		}
		items, err := catalog.GetSlots(r.Context(), db, id)
		if !writeCatalogError(w, err, "slots_no_disponibles") {
			writeJSON(w, http.StatusOK, map[string]any{"slots": items})
		}
	})
	mux.HandleFunc("GET /api/red/estado", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "administrador") {
			return
		}
		current := *configState.Load()
		port := requestPort(r)
		writeJSON(w, http.StatusOK, map[string]any{
			"habilitado": current.ServidorRedHabilitado, "nombre": current.NombreServidor,
			"puerto": port, "urls": printing.NetworkURLs(port, current.ServidorRedHabilitado, localIPv4()),
			"salud": "operativo", "requiereReinicio": false,
		})
	})
	mux.HandleFunc("POST /api/impresoras/diagnosticar", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "administrador") {
			return
		}
		var input struct {
			Impresora config.Printer `json:"impresora"`
		}
		if !decodeJSON(w, r, &input, 32<<10) {
			return
		}
		if err := validatePrinter(&input.Impresora); err != nil {
			writeError(w, http.StatusBadRequest, err.Code, err.Message)
			return
		}
		writeJSON(w, http.StatusOK, printing.Diagnose(r.Context(), input.Impresora))
	})
	mux.HandleFunc("POST /api/impresoras/prueba", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "administrador") {
			return
		}
		var input struct {
			Tipo string `json:"tipo"`
		}
		if !decodeJSON(w, r, &input, 16<<10) {
			return
		}
		latency, err := printing.TestPage(r.Context(), input.Tipo, *configState.Load())
		if writePrintingError(w, err, "impresion_no_disponible") {
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "latenciaMs": latency, "mensaje": "Página de prueba enviada"})
	})
	mux.HandleFunc("GET /api/impresion/trabajos", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "administrador") {
			return
		}
		jobs, err := printing.ListJobs(r.Context(), db)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "impresion_no_disponible", "No se pudo consultar la cola de impresión")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"trabajos": jobs})
	})
	mux.HandleFunc("POST /api/impresion/trabajos/{id}/reintentar", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "administrador") {
			return
		}
		id, ok := routeID(w, r)
		if !ok {
			return
		}
		job, err := printing.Retry(r.Context(), db, id, *configState.Load())
		if !writePrintingError(w, err, "impresion_no_disponible") {
			writeJSON(w, http.StatusOK, map[string]any{"trabajo": job})
		}
	})
	mux.HandleFunc("GET /api/cuentas", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireSession(w, r, db); !ok {
			return
		}
		if _, err := delivery.ApplyAutomatic(r.Context(), db, configState.Load().EntregaAutomaticaSiNoConfirma, configState.Load().EntregaAutomaticaMinutos); err != nil {
			writeError(w, http.StatusInternalServerError, "entrega_no_disponible", "No se pudo actualizar la entrega automática")
			return
		}
		items, err := accounts.ListInProgress(r.Context(), db, time.Now())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "cuentas_no_disponibles", "No se pudieron consultar las cuentas")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"cuentas": items})
	})
	mux.HandleFunc("GET /api/cuentas/{id}", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireSession(w, r, db); !ok {
			return
		}
		id, ok := routeID(w, r)
		if !ok {
			return
		}
		if _, err := delivery.ApplyAutomatic(r.Context(), db, configState.Load().EntregaAutomaticaSiNoConfirma, configState.Load().EntregaAutomaticaMinutos); err != nil {
			writeError(w, http.StatusInternalServerError, "entrega_no_disponible", "No se pudo actualizar la entrega automática")
			return
		}
		detail, err := accounts.Get(r.Context(), db, id)
		if !writeAccountError(w, err) {
			writeJSON(w, http.StatusOK, detail)
		}
	})
	mux.HandleFunc("POST /api/cuentas/{id}/precuenta", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireSession(w, r, db)
		if !ok {
			return
		}
		accountID, ok := routeID(w, r)
		if !ok {
			return
		}
		pin, _, ok := pinReasonInput(w, r)
		if !ok {
			return
		}
		employeeID, ok := actionSigner(w, r, db, session, pin, configState.Load().PINAlEmitirPrecuenta, "mesero", "encargado_turno", "caja")
		if !ok {
			return
		}
		result, err := billing.EmitPrecount(r.Context(), db, accountID, employeeID, billing.Options{InventoryPolicy: configState.Load().PoliticaInventario})
		if !writeBillingError(w, err) {
			_ = printing.Dispatch(r.Context(), db, *configState.Load())
			writeJSON(w, http.StatusCreated, result)
		}
	})
	mux.HandleFunc("POST /api/cuentas/{id}/precuenta/reimprimir", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "mesero", "encargado_turno", "caja") {
			return
		}
		accountID, ok := routeID(w, r)
		if !ok {
			return
		}
		number, snapshot, err := billing.ReprintPrecount(r.Context(), db, accountID)
		if !writeBillingError(w, err) {
			_ = printing.Dispatch(r.Context(), db, *configState.Load())
			writeJSON(w, http.StatusOK, map[string]any{"numero": number, "snapshot": snapshot})
		}
	})
	mux.HandleFunc("POST /api/cuentas/{id}/enviar-caja", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireSession(w, r, db)
		if !ok {
			return
		}
		accountID, ok := routeID(w, r)
		if !ok {
			return
		}
		pin, _, ok := pinReasonInput(w, r)
		if !ok {
			return
		}
		roles := []string{"mesero", "encargado_turno", "caja"}
		if configState.Load().EnviarCajaRequiereAvanzado {
			roles = []string{"caja"}
		}
		employeeID, ok := actionSigner(w, r, db, session, pin, configState.Load().PINAlEnviarCaja, roles...)
		if !ok {
			return
		}
		result, err := billing.SendToCash(r.Context(), db, accountID, employeeID, billing.Options{RequirePrecount: configState.Load().PrecuentaObligatoriaAntesCaja})
		if !writeBillingError(w, err) {
			writeJSON(w, http.StatusCreated, result)
		}
	})
	mux.HandleFunc("POST /api/cuentas/{id}/cancelar", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireSession(w, r, db)
		if !ok {
			return
		}
		accountID, ok := routeID(w, r)
		if !ok {
			return
		}
		pin, reason, ok := pinReasonInput(w, r)
		if !ok {
			return
		}
		employeeID, ok := actionSigner(w, r, db, session, pin, true, "encargado_turno")
		if !ok {
			return
		}
		result, err := billing.CancelAccount(r.Context(), db, accountID, employeeID, reason)
		if !writeBillingError(w, err) {
			writeJSON(w, http.StatusOK, result)
		}
	})
	mux.HandleFunc("GET /api/kds", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "cocina") {
			return
		}
		tarjetas, err := kds.List(r.Context(), db, configState.Load().PrioridadParaLlevar)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "kds_no_disponible", "No se pudo consultar el tablero de Cocina")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"tarjetas": tarjetas})
	})
	mux.HandleFunc("POST /api/ordenes", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireSession(w, r, db)
		if !ok {
			return
		}
		input, ok := orderInput(w, r)
		if !ok {
			return
		}
		employeeID, ok := orderSigner(w, r, db, session, input.PIN, configState.Load().PINHabilitado)
		if !ok {
			return
		}
		result, err := orders.Send(r.Context(), db, input, employeeID, orders.SendOptions{InventoryPolicy: configState.Load().PoliticaInventario})
		if !writeOrderError(w, err) {
			_ = printing.Dispatch(r.Context(), db, *configState.Load())
			status := http.StatusCreated
			if result.Repeated {
				status = http.StatusOK
			}
			writeJSON(w, status, result)
		}
	})
	mux.HandleFunc("POST /api/cuentas/{id}/ordenes", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireSession(w, r, db)
		if !ok {
			return
		}
		accountID, ok := routeID(w, r)
		if !ok {
			return
		}
		input, ok := orderInput(w, r)
		if !ok {
			return
		}
		employeeID, ok := orderSigner(w, r, db, session, input.PIN, configState.Load().PINHabilitado)
		if !ok {
			return
		}
		var tableID int64
		var state, service string
		err := db.QueryRowContext(r.Context(), "SELECT mesa_id, estado, tipo_servicio FROM cuentas WHERE id = ?", accountID).Scan(&tableID, &state, &service)
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "cuenta_inexistente", "Cuenta inexistente")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "orden_no_disponible", "No se pudo preparar la orden")
			return
		}
		if state != "abierta" && state != "precuenta_emitida" {
			writeError(w, http.StatusConflict, "cuenta_cerrada", "La cuenta ya está cerrada")
			return
		}
		if service != "mesa" {
			writeError(w, http.StatusConflict, "tipo_servicio_invalido", "Esa cuenta no admite nuevas órdenes de mesa")
			return
		}
		input.TableID = tableID
		input.ServiceType = "mesa"
		result, err := orders.Send(r.Context(), db, input, employeeID, orders.SendOptions{
			InventoryPolicy:   configState.Load().PoliticaInventario,
			ExpectedAccountID: accountID,
		})
		if !writeOrderError(w, err) {
			_ = printing.Dispatch(r.Context(), db, *configState.Load())
			status := http.StatusCreated
			if result.Repeated {
				status = http.StatusOK
			}
			writeJSON(w, status, result)
		}
	})
	mux.HandleFunc("POST /api/ordenes/{id}/correcciones", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireSession(w, r, db)
		if !ok {
			return
		}
		orderID, ok := routeID(w, r)
		if !ok {
			return
		}
		input, ok := correctionInput(w, r)
		if !ok {
			return
		}
		employeeID, ok := orderSigner(w, r, db, session, input.PIN, configState.Load().PINHabilitado)
		if !ok {
			return
		}
		input.OrderID = orderID
		result, err := orders.Correct(r.Context(), db, input, employeeID, orders.CorrectionOptions{InventoryPolicy: configState.Load().PoliticaInventario, Origin: "mesero"})
		if !writeOrderError(w, err) {
			_ = printing.Dispatch(r.Context(), db, *configState.Load())
			status := http.StatusCreated
			if result.Repeated {
				status = http.StatusOK
			}
			writeJSON(w, status, result)
		}
	})
	mux.HandleFunc("POST /api/ordenes/{id}/anular", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireSession(w, r, db)
		if !ok {
			return
		}
		orderID, ok := routeID(w, r)
		if !ok {
			return
		}
		input, ok := correctionInput(w, r)
		if !ok {
			return
		}
		employeeID, ok := orderSigner(w, r, db, session, input.PIN, configState.Load().PINHabilitado)
		if !ok {
			return
		}
		lines, err := orders.LinesForCancellation(r.Context(), db, orderID)
		if writeOrderError(w, err) {
			return
		}
		input.OrderID = orderID
		input.Lines = lines
		input.Instructions = nil
		result, err := orders.Correct(r.Context(), db, input, employeeID, orders.CorrectionOptions{InventoryPolicy: configState.Load().PoliticaInventario, Origin: "mesero"})
		if !writeOrderError(w, err) {
			_ = printing.Dispatch(r.Context(), db, *configState.Load())
			status := http.StatusCreated
			if result.Repeated {
				status = http.StatusOK
			}
			writeJSON(w, status, result)
		}
	})
	mux.HandleFunc("POST /api/kds/lineas/{id}/etapa", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "cocina") {
			return
		}
		id, stage, ok := kdsStageInput(w, r)
		if !ok {
			return
		}
		if err := kds.AdvanceLine(r.Context(), db, id, stage); !writeKDSError(w, err) {
			writeJSON(w, http.StatusOK, map[string]any{"ok": true, "etapa": stage})
		}
	})
	mux.HandleFunc("POST /api/kds/comandas/{id}/etapa", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "cocina") {
			return
		}
		id, stage, ok := kdsStageInput(w, r)
		if !ok {
			return
		}
		affected, err := kds.AdvanceCommand(r.Context(), db, id, stage)
		if !writeKDSError(w, err) {
			writeJSON(w, http.StatusOK, map[string]any{"ok": true, "etapa": stage, "afectadas": affected})
		}
	})
	mux.HandleFunc("POST /api/kds/lineas/{id}/cancelar", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireSession(w, r, db)
		if !ok {
			return
		}
		if !userHasAnyRole(session.Usuario, "cocina") {
			writeError(w, http.StatusForbidden, "sin_derecho", "Solo Cocina puede cancelar un producto iniciado")
			return
		}
		lineID, ok := routeID(w, r)
		if !ok {
			return
		}
		var body struct {
			Motivo string `json:"motivo"`
		}
		if !decodeJSON(w, r, &body, 32<<10) {
			return
		}
		result, err := incidents.CancelFromKitchen(r.Context(), db, lineID, session.Usuario.ID, body.Motivo, configState.Load().PoliticaInventario)
		if !writeIncidentError(w, err) {
			_ = printing.Dispatch(r.Context(), db, *configState.Load())
			writeJSON(w, http.StatusOK, map[string]any{"correccion": result})
		}
	})
	mux.HandleFunc("GET /api/cocina/incidencias", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "mesero", "encargado_turno") {
			return
		}
		items, err := incidents.ListPending(r.Context(), db)
		if !writeIncidentError(w, err) {
			writeJSON(w, http.StatusOK, map[string]any{"incidencias": items})
		}
	})
	mux.HandleFunc("POST /api/cocina/incidencias", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "cocina") {
			return
		}
		var input incidents.CreateInput
		if !decodeJSON(w, r, &input, 64<<10) {
			return
		}
		item, err := incidents.Create(r.Context(), db, input)
		if !writeIncidentError(w, err) {
			writeJSON(w, http.StatusCreated, item)
		}
	})
	mux.HandleFunc("POST /api/cocina/incidencias/{id}/aceptar", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireSession(w, r, db)
		if !ok {
			return
		}
		id, ok := routeID(w, r)
		if !ok {
			return
		}
		pin, _, ok := pinReasonInput(w, r)
		if !ok {
			return
		}
		employeeID, ok := actionSigner(w, r, db, session, pin, true, "mesero", "encargado_turno")
		if !ok {
			return
		}
		item, correction, err := incidents.AcceptReplacement(r.Context(), db, id, employeeID, configState.Load().PoliticaInventario)
		if !writeIncidentError(w, err) {
			_ = printing.Dispatch(r.Context(), db, *configState.Load())
			writeJSON(w, http.StatusOK, map[string]any{"incidencia": item, "correccion": correction})
		}
	})
	mux.HandleFunc("POST /api/cocina/incidencias/{id}/eliminar", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireSession(w, r, db)
		if !ok {
			return
		}
		id, ok := routeID(w, r)
		if !ok {
			return
		}
		pin, _, ok := pinReasonInput(w, r)
		if !ok {
			return
		}
		employeeID, ok := actionSigner(w, r, db, session, pin, true, "mesero", "encargado_turno")
		if !ok {
			return
		}
		item, correction, err := incidents.Reject(r.Context(), db, id, employeeID, configState.Load().PoliticaInventario)
		if !writeIncidentError(w, err) {
			_ = printing.Dispatch(r.Context(), db, *configState.Load())
			writeJSON(w, http.StatusOK, map[string]any{"incidencia": item, "correccion": correction})
		}
	})
	mux.HandleFunc("GET /api/cocina/actualizaciones", func(w http.ResponseWriter, r *http.Request) {
		if !requireRole(w, r, db, "mesero", "encargado_turno") {
			return
		}
		updates, err := incidents.ListKitchenUpdates(r.Context(), db)
		if !writeIncidentError(w, err) {
			writeJSON(w, http.StatusOK, map[string]any{"actualizaciones": updates})
		}
	})
	mux.HandleFunc("POST /api/cocina/actualizaciones/{id}/reconocer", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireSession(w, r, db)
		if !ok {
			return
		}
		if !userHasAnyRole(session.Usuario, "mesero", "encargado_turno") {
			writeError(w, http.StatusForbidden, "sin_derecho", "Sin derecho para reconocer la actualización")
			return
		}
		id, ok := routeID(w, r)
		if !ok {
			return
		}
		update, err := incidents.RecognizeKitchenUpdate(r.Context(), db, id, session.Usuario.ID)
		if !writeIncidentError(w, err) {
			writeJSON(w, http.StatusOK, map[string]any{"actualizacion": update})
		}
	})
	mux.HandleFunc("POST /api/ordenes/{id}/entregar", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireSession(w, r, db)
		if !ok {
			return
		}
		id, ok := routeID(w, r)
		if !ok {
			return
		}
		var service string
		err := db.QueryRowContext(r.Context(), `SELECT c.tipo_servicio FROM ordenes o JOIN cuentas c ON c.id = o.cuenta_id WHERE o.id = ?`, id).Scan(&service)
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "orden_inexistente", "La orden no existe")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "entrega_no_disponible", "No se pudo preparar la entrega")
			return
		}
		origin := "manual"
		if service == "para_llevar" {
			origin = "retiro"
		}
		result, err := delivery.Mark(r.Context(), db, id, session.Usuario.ID, origin)
		if !writeDeliveryError(w, err) {
			writeJSON(w, http.StatusOK, result)
		}
	})

	index := filepath.Join(uiDir, "index.html")
	static := http.FileServer(http.Dir(uiDir))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" && !strings.HasPrefix(r.URL.Path, "/assets/") && r.URL.Path != "/index.html" {
			http.NotFound(w, r)
			return
		}
		if _, err := os.Stat(index); err != nil {
			http.Error(w, "UI no compilada: ejecuta npm run build", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			http.ServeFile(w, r, index)
			return
		}
		static.ServeHTTP(w, r)
	})
	return mux
}

type configPatchError struct{ Code, Message string }

func publicConfig(value config.App) map[string]any {
	return map[string]any{
		"tablet_cocina":                       value.TabletCocina,
		"nombre_local":                        value.NombreLocal,
		"logo_data":                           value.LogoData,
		"tipografia":                          value.Tipografia,
		"tamano_ui":                           value.TamanoUI,
		"pin_habilitado":                      value.PINHabilitado,
		"confirmar_comanda":                   value.ConfirmarComanda,
		"pin_al_anular":                       value.PINAlAnular,
		"auditoria_anulaciones":               value.AuditoriaAnulaciones,
		"justificacion_anulacion":             value.JustificacionAnulacion,
		"devolver_insumos_preparados":         true,
		"entrega_automatica_si_no_confirma":   value.EntregaAutomaticaSiNoConfirma,
		"entrega_automatica_minutos":          value.EntregaAutomaticaMinutos,
		"prioridad_para_llevar":               value.PrioridadParaLlevar,
		"pin_al_emitir_precuenta":             value.PINAlEmitirPrecuenta,
		"pin_al_enviar_caja":                  value.PINAlEnviarCaja,
		"precuenta_obligatoria_antes_de_caja": value.PrecuentaObligatoriaAntesCaja,
		"enviar_a_caja_requiere_avanzado":     value.EnviarCajaRequiereAvanzado,
		"impresora_comanda":                   value.ImpresoraComanda,
		"impresora_boleta":                    value.ImpresoraBoleta,
		"plantilla_comanda":                   value.PlantillaComanda,
		"plantilla_boleta":                    value.PlantillaBoleta,
		"servidor_red_habilitado":             value.ServidorRedHabilitado,
		"nombre_servidor":                     value.NombreServidor,
	}
}

func applyConfigPatch(current config.App, patch map[string]json.RawMessage) (config.App, *configPatchError) {
	allowed := map[string]bool{
		"tablet_cocina": true, "nombre_local": true, "logo_data": true, "tipografia": true,
		"tamano_ui": true, "pin_habilitado": true, "confirmar_comanda": true,
		"auditoria_anulaciones": true, "justificacion_anulacion": true,
		"devolver_insumos_preparados": true, "entrega_automatica_si_no_confirma": true,
		"entrega_automatica_minutos": true, "prioridad_para_llevar": true,
		"pin_al_emitir_precuenta": true, "pin_al_enviar_caja": true,
		"precuenta_obligatoria_antes_de_caja": true, "enviar_a_caja_requiere_avanzado": true,
		"impresora_comanda": true, "impresora_boleta": true, "plantilla_comanda": true,
		"plantilla_boleta": true, "servidor_red_habilitado": true, "nombre_servidor": true,
	}
	filtered := map[string]json.RawMessage{}
	for key, raw := range patch {
		if allowed[key] {
			filtered[key] = raw
		}
	}
	bytes, err := json.Marshal(filtered)
	if err != nil || json.Unmarshal(bytes, &current) != nil {
		return config.App{}, &configPatchError{"config_invalida", "La configuración no es válida"}
	}
	current.NombreLocal = truncate(strings.TrimSpace(current.NombreLocal), 40)
	if current.NombreLocal == "" {
		return config.App{}, &configPatchError{"nombre_vacio", "El restaurante necesita un nombre"}
	}
	if current.Tipografia != "sans" && current.Tipografia != "serif" && current.Tipografia != "redondeada" {
		return config.App{}, &configPatchError{"tipografia_invalida", "La tipografía no es válida"}
	}
	if current.TamanoUI != "compacto" && current.TamanoUI != "normal" && current.TamanoUI != "grande" {
		return config.App{}, &configPatchError{"tamano_invalido", "El tamaño de interfaz no es válido"}
	}
	if current.EntregaAutomaticaMinutos < 1 || current.EntregaAutomaticaMinutos > 240 {
		return config.App{}, &configPatchError{"tiempo_entrega_invalido", "El tiempo automático debe estar entre 1 y 240 minutos"}
	}
	if current.PrioridadParaLlevar != "igual" && current.PrioridadParaLlevar != "prioritaria" {
		return config.App{}, &configPatchError{"prioridad_invalida", "La prioridad para llevar no es válida"}
	}
	if err := validatePrinter(&current.ImpresoraComanda); err != nil {
		return config.App{}, err
	}
	if err := validatePrinter(&current.ImpresoraBoleta); err != nil {
		return config.App{}, err
	}
	current.PlantillaComanda = normalizeTemplate(current.PlantillaComanda, "COMANDA")
	current.PlantillaBoleta = normalizeTemplate(current.PlantillaBoleta, "COMPROBANTE")
	current.NombreServidor = truncate(strings.TrimSpace(current.NombreServidor), 60)
	if current.NombreServidor == "" {
		current.NombreServidor = "Restaurante"
	}
	if current.LogoData != nil {
		logo := *current.LogoData
		if logo == "" {
			current.LogoData = nil
		} else if err := validateLogo(logo); err != nil {
			return config.App{}, err
		}
	}
	current.DevolverInsumosPreparados = true
	current.JustificacionAnulacion = current.AuditoriaAnulaciones && current.JustificacionAnulacion
	return current, nil
}

func validatePrinter(printer *config.Printer) *configPatchError {
	if printer.Port < 1 || printer.Port > 65535 {
		return &configPatchError{"puerto_invalido", "El puerto de la impresora debe estar entre 1 y 65535"}
	}
	if printer.WidthMM != 58 && printer.WidthMM != 80 {
		return &configPatchError{"ancho_invalido", "El papel debe ser de 58 u 80 mm"}
	}
	printer.Name = truncate(strings.TrimSpace(printer.Name), 60)
	printer.Host = truncate(strings.TrimSpace(printer.Host), 255)
	return nil
}

func normalizeTemplate(template config.Template, fallback string) config.Template {
	template.Title = truncate(strings.TrimSpace(template.Title), 60)
	if template.Title == "" {
		template.Title = fallback
	}
	template.Header = truncate(strings.TrimSpace(template.Header), 300)
	template.Footer = truncate(strings.TrimSpace(template.Footer), 300)
	return template
}

func validateLogo(value string) *configPatchError {
	marker := ";base64,"
	index := strings.Index(value, marker)
	if !strings.HasPrefix(value, "data:image/") || index < 0 {
		return &configPatchError{"logo_invalido", "El logo no es una imagen válida"}
	}
	decoded, err := base64.StdEncoding.DecodeString(value[index+len(marker):])
	if err != nil {
		return &configPatchError{"logo_invalido", "El logo no es una imagen válida"}
	}
	if len(decoded) > 400*1024 {
		return &configPatchError{"logo_grande", "El logo supera 400 KB"}
	}
	return nil
}

func truncate(value string, limit int) string {
	runes := []rune(value)
	if len(runes) > limit {
		return string(runes[:limit])
	}
	return value
}

func sessionToken(r *http.Request) string {
	cookie, err := r.Cookie(auth.CookieName)
	if err != nil {
		return ""
	}
	return cookie.Value
}

func deleteSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: auth.CookieName, Value: "", Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: -1})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"error": message, "codigo": code})
}

func writeCatalogError(w http.ResponseWriter, err error, fallbackCode string) bool {
	if err == nil {
		return false
	}
	var domain *catalog.DomainError
	if errors.As(err, &domain) {
		writeError(w, http.StatusBadRequest, domain.Code, domain.Message)
		return true
	}
	writeError(w, http.StatusInternalServerError, fallbackCode, "No se pudo completar la operación de catálogo")
	return true
}

func writeSalonError(w http.ResponseWriter, err error, fallbackCode string) bool {
	if err == nil {
		return false
	}
	var domain *salon.DomainError
	if errors.As(err, &domain) {
		writeError(w, http.StatusBadRequest, domain.Code, domain.Message)
		return true
	}
	writeError(w, http.StatusInternalServerError, fallbackCode, "No se pudo completar la operación del salón")
	return true
}

func writePrintingError(w http.ResponseWriter, err error, fallbackCode string) bool {
	if err == nil {
		return false
	}
	var domain *printing.DomainError
	if errors.As(err, &domain) {
		writeError(w, http.StatusBadRequest, domain.Code, domain.Message)
		return true
	}
	writeError(w, http.StatusInternalServerError, fallbackCode, "No se pudo completar la operación de impresión")
	return true
}

func writeJourneyError(w http.ResponseWriter, err error, fallbackCode string) bool {
	if err == nil {
		return false
	}
	var domain *journey.DomainError
	if errors.As(err, &domain) {
		writeError(w, http.StatusConflict, domain.Code, domain.Message)
		return true
	}
	writeError(w, http.StatusInternalServerError, fallbackCode, "No se pudo completar la operación de jornada")
	return true
}

func requestPort(r *http.Request) int {
	_, rawPort, err := net.SplitHostPort(r.Host)
	if err == nil {
		if port, parseErr := strconv.Atoi(rawPort); parseErr == nil {
			return port
		}
	}
	if r.TLS != nil {
		return 443
	}
	return 80
}

func localIPv4() []string {
	interfaces, err := net.Interfaces()
	if err != nil {
		return []string{}
	}
	result := []string{}
	for _, item := range interfaces {
		if item.Flags&net.FlagUp == 0 || item.Flags&net.FlagLoopback != 0 {
			continue
		}
		addresses, err := item.Addrs()
		if err != nil {
			continue
		}
		for _, address := range addresses {
			var ip net.IP
			switch value := address.(type) {
			case *net.IPNet:
				ip = value.IP
			case *net.IPAddr:
				ip = value.IP
			}
			if value := ip.To4(); value != nil {
				result = append(result, value.String())
			}
		}
	}
	return result
}

func requireRole(w http.ResponseWriter, r *http.Request, db *sql.DB, roles ...string) bool {
	session, ok := requireSession(w, r, db)
	if !ok {
		return false
	}
	for _, userRole := range session.Usuario.Roles {
		if userRole == "administrador" {
			return true
		}
		for _, required := range roles {
			if userRole == required {
				return true
			}
		}
	}
	writeError(w, http.StatusForbidden, "sin_derecho", "Tu rol no permite realizar esta acción")
	return false
}

func requireSession(w http.ResponseWriter, r *http.Request, db *sql.DB) (*auth.Session, bool) {
	session, err := auth.ByToken(r.Context(), db, sessionToken(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "sesion_invalida", "No se pudo leer la sesión")
		return nil, false
	}
	if session == nil {
		writeError(w, http.StatusUnauthorized, "credenciales_invalidas", "Inicia sesión para continuar")
		return nil, false
	}
	return session, true
}

func orderInput(w http.ResponseWriter, r *http.Request) (orders.NewInput, bool) {
	defer r.Body.Close()
	var input orders.NewInput
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	if err := decoder.Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "json_invalido", "El cuerpo no es JSON válido")
		return orders.NewInput{}, false
	}
	return input, true
}

func correctionInput(w http.ResponseWriter, r *http.Request) (orders.CorrectionInput, bool) {
	defer r.Body.Close()
	var input orders.CorrectionInput
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	if err := decoder.Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "json_invalido", "El cuerpo no es JSON válido")
		return orders.CorrectionInput{}, false
	}
	return input, true
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any, limit int64) bool {
	defer r.Body.Close()
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, limit))
	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "json_invalido", "El cuerpo no es JSON válido")
		return false
	}
	return true
}

func orderSigner(
	w http.ResponseWriter,
	r *http.Request,
	db *sql.DB,
	session *auth.Session,
	pin *string,
	pinEnabled bool,
) (int64, bool) {
	if pinEnabled || pin != nil {
		if pin == nil {
			writeError(w, http.StatusBadRequest, "pin_invalido", "Hace falta el PIN del mesero")
			return 0, false
		}
		user, err := auth.VerifyPINForRoles(r.Context(), db, *pin, "mesero", "encargado_turno")
		if err == auth.ErrInvalidPIN {
			writeError(w, http.StatusBadRequest, "pin_invalido", "PIN incorrecto")
			return 0, false
		}
		if err == auth.ErrForbidden {
			writeError(w, http.StatusForbidden, "sin_derecho", "Sin derecho para enviar órdenes")
			return 0, false
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "orden_no_disponible", "No se pudo validar el PIN")
			return 0, false
		}
		return user.ID, true
	}
	if userHasAnyRole(session.Usuario, "mesero", "encargado_turno") {
		return session.Usuario.ID, true
	}
	writeError(w, http.StatusForbidden, "sin_derecho", "Sin derecho para enviar órdenes")
	return 0, false
}

func actionSigner(
	w http.ResponseWriter,
	r *http.Request,
	db *sql.DB,
	session *auth.Session,
	pin *string,
	requirePIN bool,
	roles ...string,
) (int64, bool) {
	if requirePIN || pin != nil {
		if pin == nil || strings.TrimSpace(*pin) == "" {
			writeError(w, http.StatusBadRequest, "pin_invalido", "Hace falta el PIN del responsable")
			return 0, false
		}
		user, err := auth.VerifyPINForRoles(r.Context(), db, *pin, roles...)
		if err == auth.ErrInvalidPIN {
			writeError(w, http.StatusBadRequest, "pin_invalido", "PIN incorrecto")
			return 0, false
		}
		if err == auth.ErrForbidden {
			writeError(w, http.StatusForbidden, "sin_derecho", "Sin derecho para esta acción")
			return 0, false
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "autorizacion_no_disponible", "No se pudo validar la autorización")
			return 0, false
		}
		return user.ID, true
	}
	if userHasAnyRole(session.Usuario, roles...) {
		return session.Usuario.ID, true
	}
	writeError(w, http.StatusForbidden, "sin_derecho", "Sin derecho para esta acción")
	return 0, false
}

func pinReasonInput(w http.ResponseWriter, r *http.Request) (*string, string, bool) {
	defer r.Body.Close()
	var body struct {
		PIN    *string `json:"pin"`
		Motivo *string `json:"motivo"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10))
	if err := decoder.Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "json_invalido", "El cuerpo no es JSON válido")
		return nil, "", false
	}
	reason := ""
	if body.Motivo != nil {
		reason = *body.Motivo
	}
	return body.PIN, reason, true
}

func userHasAnyRole(user auth.User, roles ...string) bool {
	for _, current := range user.Roles {
		if current == "administrador" {
			return true
		}
		for _, allowed := range roles {
			if current == allowed {
				return true
			}
		}
	}
	return false
}

func writeOrderError(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	var domain *orders.Error
	if errors.As(err, &domain) {
		status := http.StatusBadRequest
		switch domain.Code {
		case "cuenta_inexistente", "orden_inexistente", "mesa_inexistente", "producto_inexistente", "empleado_inexistente", "variante_inexistente":
			status = http.StatusNotFound
		case "cuenta_cerrada", "cuenta_desactualizada", "stock_insuficiente", "jornada_cerrada", "orden_anulada", "orden_en_preparacion", "linea_preparada":
			status = http.StatusConflict
		case "sin_derecho":
			status = http.StatusForbidden
		}
		writeError(w, status, domain.Code, domain.Message)
		return true
	}
	writeError(w, http.StatusInternalServerError, "orden_no_disponible", "No se pudo enviar la orden")
	return true
}

func writeBillingError(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	var domain *billing.Error
	if errors.As(err, &domain) {
		status := http.StatusBadRequest
		switch domain.Code {
		case "cuenta_inexistente", "precuenta_inexistente", "empleado_inexistente":
			status = http.StatusNotFound
		case "cuenta_cerrada", "cuenta_desactualizada", "precuenta_requerida", "precuenta_desactualizada":
			status = http.StatusConflict
		case "sin_derecho":
			status = http.StatusForbidden
		}
		writeError(w, status, domain.Code, domain.Message)
		return true
	}
	writeError(w, http.StatusInternalServerError, "cuenta_no_disponible", "No se pudo completar la operación de la cuenta")
	return true
}

func writeIncidentError(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	var domain *incidents.Error
	if errors.As(err, &domain) {
		status := http.StatusBadRequest
		switch domain.Code {
		case "incidencia_inexistente", "linea_inexistente", "producto_inexistente":
			status = http.StatusNotFound
		case "incidencia_pendiente", "incidencia_resuelta", "producto_ya_iniciado", "orden_ya_iniciada", "etapa_no_avanzable", "orden_en_preparacion", "linea_preparada", "stock_insuficiente":
			status = http.StatusConflict
		case "sin_derecho":
			status = http.StatusForbidden
		}
		writeError(w, status, domain.Code, domain.Message)
		return true
	}
	writeError(w, http.StatusInternalServerError, "incidencia_no_disponible", "No se pudo completar la incidencia de Cocina")
	return true
}

func userInputFromRequest(w http.ResponseWriter, r *http.Request, creating bool) (auth.UserInput, bool) {
	defer r.Body.Close()
	var body struct {
		Nombre   string   `json:"nombre"`
		Usuario  *string  `json:"usuario"`
		PIN      *string  `json:"pin"`
		Password *string  `json:"password"`
		Roles    []string `json:"roles"`
		Activo   *bool    `json:"activo"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10)).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "usuario_invalido", "Completa nombre, usuario, contraseña, PIN y al menos un rol")
		return auth.UserInput{}, false
	}
	if !creating && body.Activo == nil {
		writeError(w, http.StatusBadRequest, "usuario_invalido", "Completa nombre, estado y al menos un rol")
		return auth.UserInput{}, false
	}
	active := true
	if body.Activo != nil {
		active = *body.Activo
	}
	return auth.UserInput{Nombre: body.Nombre, Usuario: body.Usuario, PIN: body.PIN, Password: body.Password, Roles: body.Roles, Activo: active}, true
}

func writeUserError(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	switch err {
	case auth.ErrInvalidUser:
		writeError(w, http.StatusBadRequest, "usuario_invalido", "Completa nombre, usuario, contraseña, PIN y al menos un rol")
	case auth.ErrDuplicate:
		writeError(w, http.StatusConflict, "usuario_duplicado", "Ese nombre de usuario ya está en uso")
	case auth.ErrLastAdmin:
		writeError(w, http.StatusBadRequest, "ultimo_administrador", "Debe quedar al menos un administrador activo")
	case sql.ErrNoRows:
		writeError(w, http.StatusNotFound, "empleado_inexistente", "El usuario no existe")
	default:
		writeError(w, http.StatusInternalServerError, "usuarios_no_disponibles", "No se pudo guardar el usuario")
	}
	return true
}

func routeID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	value := r.PathValue("id")
	id, err := strconv.ParseInt(value, 10, 64)
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "id_invalido", "Identificador inválido")
		return 0, false
	}
	return id, true
}

func inventoryInput(w http.ResponseWriter, r *http.Request, loss bool) (float64, string, string, bool) {
	defer r.Body.Close()
	var body struct {
		Cantidad *float64 `json:"cantidad"`
		PIN      string   `json:"pin"`
		Motivo   string   `json:"motivo"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&body); err != nil || body.Cantidad == nil {
		writeError(w, http.StatusBadRequest, "cantidad_invalida", "Cantidad inválida")
		return 0, "", "", false
	}
	if strings.TrimSpace(body.PIN) == "" {
		writeError(w, http.StatusBadRequest, "pin_invalido", "Hace falta el PIN de administrador")
		return 0, "", "", false
	}
	if loss && body.Motivo != "producto_danado" && body.Motivo != "consumo_interno" {
		writeError(w, http.StatusBadRequest, "motivo_invalido", "Selecciona un motivo válido para la pérdida")
		return 0, "", "", false
	}
	return *body.Cantidad, body.PIN, body.Motivo, true
}

func writeInventoryError(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	switch err {
	case inventory.ErrInvalidAmount:
		writeError(w, http.StatusBadRequest, "cantidad_invalida", "La cantidad debe ser mayor que cero")
	case inventory.ErrInvalidReason:
		writeError(w, http.StatusBadRequest, "motivo_invalido", "Selecciona un motivo válido para la pérdida")
	case inventory.ErrNotFound:
		writeError(w, http.StatusNotFound, "material_inexistente", "El material no existe o no controla inventario")
	case inventory.ErrInsufficient:
		writeError(w, http.StatusBadRequest, "stock_insuficiente", "La pérdida no puede superar la existencia en mano")
	case auth.ErrInvalidPIN:
		writeError(w, http.StatusBadRequest, "pin_invalido", "PIN incorrecto")
	case auth.ErrForbidden:
		writeError(w, http.StatusForbidden, "sin_derecho", "Sin derecho para esta acción")
	default:
		writeError(w, http.StatusInternalServerError, "inventario_no_disponible", "No se pudo modificar el inventario")
	}
	return true
}

func kdsStageInput(w http.ResponseWriter, r *http.Request) (int64, string, bool) {
	id, ok := routeID(w, r)
	if !ok {
		return 0, "", false
	}
	defer r.Body.Close()
	var body struct {
		Etapa string `json:"etapa"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil || strings.TrimSpace(body.Etapa) == "" {
		writeError(w, http.StatusBadRequest, "etapa_invalida", "Hace falta la etapa")
		return 0, "", false
	}
	return id, body.Etapa, true
}

func writeKDSError(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	if domain, ok := err.(*kds.Error); ok {
		status := http.StatusConflict
		switch domain.Code {
		case "etapa_invalida":
			status = http.StatusBadRequest
		case "linea_inexistente":
			status = http.StatusNotFound
		}
		writeError(w, status, domain.Code, domain.Message)
		return true
	}
	writeError(w, http.StatusInternalServerError, "kds_no_disponible", "No se pudo actualizar el tablero de Cocina")
	return true
}

func writeAccountError(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	if domain, ok := err.(*accounts.Error); ok {
		status := http.StatusBadRequest
		if domain.Code == "cuenta_inexistente" {
			status = http.StatusNotFound
		}
		writeError(w, status, domain.Code, domain.Message)
		return true
	}
	writeError(w, http.StatusInternalServerError, "cuentas_no_disponibles", "No se pudo consultar la cuenta")
	return true
}

func writeDeliveryError(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	if domain, ok := err.(*delivery.Error); ok {
		status := http.StatusConflict
		if domain.Code == "orden_inexistente" {
			status = http.StatusNotFound
		}
		if domain.Code == "origen_invalido" {
			status = http.StatusBadRequest
		}
		writeError(w, status, domain.Code, domain.Message)
		return true
	}
	writeError(w, http.StatusInternalServerError, "entrega_no_disponible", "No se pudo registrar la entrega")
	return true
}
