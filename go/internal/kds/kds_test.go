package kds

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

func TestListReturnsKitchenCardForCurrentShift(t *testing.T) {
	// List hace consultas anidadas para obtener las líneas de cada tarjeta. Un
	// :memory: puro crea una base aislada por conexión; la caché compartida
	// reproduce el comportamiento de SQLite en archivo que usa la aplicación.
	db, err := sql.Open("sqlite", "file:kds-lista?mode=memory&cache=shared")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`
		CREATE TABLE empleados (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL);
		CREATE TABLE pisos (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL);
		CREATE TABLE mesas (id INTEGER PRIMARY KEY, piso_id INTEGER, numero INTEGER NOT NULL);
		CREATE TABLE pedidos (id INTEGER PRIMARY KEY, mesa_id INTEGER, indicaciones TEXT);
		CREATE TABLE productos (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL);
		CREATE TABLE jornadas_operativas (id INTEGER PRIMARY KEY, estado TEXT NOT NULL);
		CREATE TABLE cuentas (id INTEGER PRIMARY KEY, mesa_id INTEGER, tipo_servicio TEXT, numero_servicio INTEGER, cliente_nombre TEXT);
		CREATE TABLE ordenes (id INTEGER PRIMARY KEY, cuenta_id INTEGER, numero INTEGER, indicaciones TEXT);
		CREATE TABLE orden_correcciones (id INTEGER PRIMARY KEY, orden_id INTEGER, numero_version INTEGER, es_anulacion INTEGER, indicaciones TEXT);
		CREATE TABLE orden_lineas (id INTEGER PRIMARY KEY, orden_id INTEGER, producto_id INTEGER, cantidad REAL, nota TEXT);
		CREATE TABLE orden_linea_contornos (id INTEGER PRIMARY KEY, orden_linea_id INTEGER, slot_nombre TEXT, variante_nombre TEXT, es_extra INTEGER);
		CREATE TABLE pedido_lineas (id INTEGER PRIMARY KEY, pedido_id INTEGER, producto_id INTEGER, cantidad REAL, nota TEXT);
		CREATE TABLE orden_correccion_lineas (id INTEGER PRIMARY KEY, producto_id INTEGER, cantidad_nueva REAL, cantidad_anterior REAL, nota_nueva TEXT, nota_anterior TEXT);
		CREATE TABLE comandas (id INTEGER PRIMARY KEY, tipo TEXT, envio_n INTEGER, creada_en TEXT, pedido_id INTEGER, orden_id INTEGER, correccion_id INTEGER, mesero_id INTEGER, jornada_id INTEGER);
		CREATE TABLE comanda_lineas (id INTEGER PRIMARY KEY, comanda_id INTEGER, pedido_linea_id INTEGER, orden_linea_id INTEGER, orden_correccion_linea_id INTEGER, etapa TEXT, etapa_actualizada_en TEXT);
		CREATE TABLE cocina_incidencias (id INTEGER PRIMARY KEY, comanda_id INTEGER, orden_id INTEGER, comanda_linea_id INTEGER, tipo TEXT, alcance TEXT, motivo TEXT, propuesta TEXT, estado TEXT, creada_en TEXT, respondida_en TEXT, producto_reemplazo_id INTEGER);
		INSERT INTO empleados VALUES (1, 'Ana');
		INSERT INTO pisos VALUES (1, 'Salón'); INSERT INTO mesas VALUES (1, 1, 7);
		INSERT INTO jornadas_operativas VALUES (1, 'abierta');
		INSERT INTO cuentas VALUES (1, 1, 'mesa', NULL, NULL);
		INSERT INTO ordenes VALUES (10, 1, 2, 'Sin cebolla');
		INSERT INTO productos VALUES (5, 'Hamburguesa');
		INSERT INTO orden_lineas VALUES (20, 10, 5, 2, 'Bien cocida');
		INSERT INTO orden_linea_contornos VALUES (1, 20, 'Acompañamiento', 'Papas fritas', 0);
		INSERT INTO comandas VALUES (30, 'orden', 2, '2026-09-10T14:00:00.000Z', NULL, 10, NULL, 1, 1);
		INSERT INTO comanda_lineas (id, comanda_id, pedido_linea_id, orden_linea_id, orden_correccion_linea_id, etapa) VALUES (40, 30, NULL, 20, NULL, 'por_preparar');`)
	if err != nil {
		t.Fatal(err)
	}

	tarjetas, err := List(context.Background(), db, "igual")
	if err != nil {
		t.Fatal(err)
	}
	if len(tarjetas) != 1 {
		t.Fatalf("tarjetas: %#v", tarjetas)
	}
	tarjeta := tarjetas[0]
	if tarjeta.Referencia != "Mesa #7 · Orden #2" || tarjeta.TipoServicio != "mesa" || tarjeta.OrdenID == nil || *tarjeta.OrdenID != 10 {
		t.Fatalf("cabecera inesperada: %#v", tarjeta)
	}
	if len(tarjeta.Lineas) != 1 || tarjeta.Lineas[0].Nombre != "Hamburguesa" || tarjeta.Lineas[0].Nota == nil || *tarjeta.Lineas[0].Nota != "Bien cocida" {
		t.Fatalf("líneas inesperadas: %#v", tarjeta.Lineas)
	}
	if len(tarjeta.Lineas[0].Contornos) != 1 || tarjeta.Lineas[0].Contornos[0] != "Acompañamiento: Papas fritas" {
		t.Fatalf("contornos inesperados: %#v", tarjeta.Lineas[0].Contornos)
	}
	if tarjeta.Indicaciones == nil || *tarjeta.Indicaciones != "Sin cebolla" {
		t.Fatalf("indicaciones inesperadas: %#v", tarjeta.Indicaciones)
	}

	affected, err := AdvanceCommand(context.Background(), db, 30, "en_proceso")
	if err != nil || affected != 1 {
		t.Fatalf("avance inesperado: afectadas=%d err=%v", affected, err)
	}
	var stage string
	if err := db.QueryRow("SELECT etapa FROM comanda_lineas WHERE id = 40").Scan(&stage); err != nil || stage != "en_proceso" {
		t.Fatalf("etapa después del avance: %q, %v", stage, err)
	}
	if _, err := db.Exec(`INSERT INTO cocina_incidencias (id, comanda_id, orden_id, comanda_linea_id, tipo, alcance, motivo, estado, creada_en) VALUES (1, 30, 10, 40, 'rechazo', 'linea', 'Sin stock', 'pendiente', '2026-09-10T14:01:00Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := AdvanceCommand(context.Background(), db, 30, "listo"); err == nil {
		t.Fatal("se esperaba que la incidencia bloqueara la orden")
	} else if domain, ok := err.(*Error); !ok || domain.Code != "incidencia_pendiente" {
		t.Fatalf("error inesperado: %v", err)
	}
	if err := db.QueryRow("SELECT etapa FROM comanda_lineas WHERE id = 40").Scan(&stage); err != nil || stage != "en_proceso" {
		t.Fatalf("la transacción no preservó la etapa: %q, %v", stage, err)
	}
}

func TestListPrioritizesTakeawayWithoutChangingOrderInsideGroup(t *testing.T) {
	db, err := sql.Open("sqlite", "file:kds-prioridad?mode=memory&cache=shared")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`
		CREATE TABLE empleados (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL); INSERT INTO empleados VALUES (1, 'Ana');
		CREATE TABLE pedidos (id INTEGER PRIMARY KEY, mesa_id INTEGER, indicaciones TEXT);
		CREATE TABLE mesas (id INTEGER PRIMARY KEY, numero INTEGER NOT NULL); INSERT INTO mesas VALUES (1, 1);
		CREATE TABLE jornadas_operativas (id INTEGER PRIMARY KEY, estado TEXT NOT NULL); INSERT INTO jornadas_operativas VALUES (1, 'abierta');
		CREATE TABLE cuentas (id INTEGER PRIMARY KEY, mesa_id INTEGER, tipo_servicio TEXT, numero_servicio INTEGER, cliente_nombre TEXT); INSERT INTO cuentas VALUES (1, 1, 'mesa', NULL, NULL), (2, 1, 'para_llevar', 9, 'Luis');
		CREATE TABLE ordenes (id INTEGER PRIMARY KEY, cuenta_id INTEGER, numero INTEGER, indicaciones TEXT); INSERT INTO ordenes VALUES (1, 1, 1, NULL), (2, 2, 1, NULL);
		CREATE TABLE orden_correcciones (id INTEGER PRIMARY KEY, orden_id INTEGER, numero_version INTEGER, es_anulacion INTEGER, indicaciones TEXT);
		CREATE TABLE productos (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL); INSERT INTO productos VALUES (1, 'Café');
		CREATE TABLE orden_lineas (id INTEGER PRIMARY KEY, orden_id INTEGER, producto_id INTEGER, cantidad REAL, nota TEXT); INSERT INTO orden_lineas VALUES (1, 1, 1, 1, NULL), (2, 2, 1, 1, NULL);
		CREATE TABLE orden_linea_contornos (id INTEGER PRIMARY KEY, orden_linea_id INTEGER, slot_nombre TEXT, variante_nombre TEXT, es_extra INTEGER);
		CREATE TABLE pedido_lineas (id INTEGER PRIMARY KEY, pedido_id INTEGER, producto_id INTEGER, cantidad REAL, nota TEXT);
		CREATE TABLE orden_correccion_lineas (id INTEGER PRIMARY KEY, producto_id INTEGER, cantidad_nueva REAL, cantidad_anterior REAL, nota_nueva TEXT, nota_anterior TEXT);
		CREATE TABLE comandas (id INTEGER PRIMARY KEY, tipo TEXT, envio_n INTEGER, creada_en TEXT, pedido_id INTEGER, orden_id INTEGER, correccion_id INTEGER, mesero_id INTEGER, jornada_id INTEGER); INSERT INTO comandas VALUES (1, 'orden', 1, '2026-09-10T14:00:00Z', NULL, 1, NULL, 1, 1), (2, 'orden', 1, '2026-09-10T14:01:00Z', NULL, 2, NULL, 1, 1);
		CREATE TABLE comanda_lineas (id INTEGER PRIMARY KEY, comanda_id INTEGER, pedido_linea_id INTEGER, orden_linea_id INTEGER, orden_correccion_linea_id INTEGER, etapa TEXT, etapa_actualizada_en TEXT); INSERT INTO comanda_lineas (id, comanda_id, pedido_linea_id, orden_linea_id, orden_correccion_linea_id, etapa) VALUES (1, 1, NULL, 1, NULL, 'por_preparar'), (2, 2, NULL, 2, NULL, 'por_preparar');
		CREATE TABLE cocina_incidencias (id INTEGER PRIMARY KEY, comanda_id INTEGER, orden_id INTEGER, comanda_linea_id INTEGER, tipo TEXT, alcance TEXT, motivo TEXT, propuesta TEXT, estado TEXT, creada_en TEXT, respondida_en TEXT, producto_reemplazo_id INTEGER);`)
	if err != nil {
		t.Fatal(err)
	}

	tarjetas, err := List(context.Background(), db, "prioritaria")
	if err != nil {
		t.Fatal(err)
	}
	if len(tarjetas) != 2 || tarjetas[0].TipoServicio != "para_llevar" || tarjetas[0].NumeroServicio == nil || *tarjetas[0].NumeroServicio != 9 {
		t.Fatalf("prioridad inesperada: %#v", tarjetas)
	}
}
