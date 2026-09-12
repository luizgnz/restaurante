package auth

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

const nodeArgon2Hash = "$argon2id$v=19$m=65536,p=4,t=3$/7FsKEDwvV6V6vjLO+yHmQ$e0h9jyFrmVBQpkMmDXu/FMsbAc5MwV0hUXMzYX3byWk"

func testDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })
	_, err = db.Exec(`
		CREATE TABLE empleados (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, pin_hash TEXT NOT NULL, derecho TEXT NOT NULL, activo INTEGER NOT NULL, usuario TEXT, password_hash TEXT);
		CREATE TABLE empleado_roles (empleado_id INTEGER NOT NULL, rol_clave TEXT NOT NULL);
		CREATE TABLE sesiones_pos (id INTEGER PRIMARY KEY, administrador_id INTEGER NOT NULL, abierta_en TEXT NOT NULL, cerrada_en TEXT);
		CREATE TABLE sesiones_usuario (id INTEGER PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, empleado_id INTEGER NOT NULL, abierta_en TEXT NOT NULL, cerrada_en TEXT);
		INSERT INTO empleados (id, nombre, pin_hash, derecho, activo, usuario, password_hash) VALUES (1, 'Jefa', '` + nodeArgon2Hash + `', 'avanzado', 1, 'admin', '` + nodeArgon2Hash + `');
		INSERT INTO empleado_roles (empleado_id, rol_clave) VALUES (1, 'administrador');`)
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func TestOpenAcceptsArgon2HashGeneratedByNode(t *testing.T) {
	db := testDB(t)
	token, opened, err := Open(context.Background(), db, "ADMIN", "secreto")
	if err != nil {
		t.Fatal(err)
	}
	if token == "" || opened.Usuario.Nombre != "Jefa" || !hasRole(opened.Usuario, "administrador") {
		t.Fatalf("sesión inesperada: %#v", opened)
	}
	recovered, err := ByToken(context.Background(), db, token)
	if err != nil || recovered == nil || recovered.ID != opened.ID {
		t.Fatalf("no recuperó sesión: %#v, %v", recovered, err)
	}
}

func TestCloseTurnRequiresAdministrator(t *testing.T) {
	db := testDB(t)
	if err := CloseTurn(context.Background(), db, &Session{Usuario: User{Roles: []string{"mesero"}}}); err != ErrForbidden {
		t.Fatalf("error = %v, se esperaba sin derecho", err)
	}
}

func TestCreateUserUsesArgon2IDCompatibleWithSession(t *testing.T) {
	db := testDB(t)
	username := "ana"
	pin := "1234"
	password := "clave-segura"
	created, err := CreateUser(context.Background(), db, UserInput{
		Nombre: "Ana", Usuario: &username, PIN: &pin, Password: &password, Roles: []string{"mesero"}, Activo: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.Derecho != "basico" || !hasRole(User{Roles: created.Roles}, "mesero") {
		t.Fatalf("usuario creado inesperado: %#v", created)
	}
	if _, _, err := Open(context.Background(), db, username, password); err != nil {
		t.Fatalf("Go no pudo abrir sesión con la contraseña que generó: %v", err)
	}
}
