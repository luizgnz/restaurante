package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

type Role struct {
	Clave       string `json:"clave"`
	Nombre      string `json:"nombre"`
	Descripcion string `json:"descripcion"`
}

var Roles = []Role{
	{Clave: "administrador", Nombre: "Administrador", Descripcion: "Configura el sistema, usuarios e inventario"},
	{Clave: "encargado_turno", Nombre: "Encargado de turno", Descripcion: "Autoriza excepciones operativas durante su turno"},
	{Clave: "mesero", Nombre: "Mesero", Descripcion: "Crea órdenes y atiende mesas"},
	{Clave: "cocina", Nombre: "Cocina", Descripcion: "Recibe y prepara comandas"},
	{Clave: "caja", Nombre: "Caja", Descripcion: "Emite comprobantes y cierra cuentas"},
	{Clave: "inventario", Nombre: "Inventario", Descripcion: "Consulta existencias y disponibilidad"},
}

var (
	ErrInvalidUser = errors.New("usuario inválido")
	ErrLastAdmin   = errors.New("último administrador")
	ErrDuplicate   = errors.New("usuario duplicado")
)

type ManagedUser struct {
	ID      int64    `json:"id"`
	Nombre  string   `json:"nombre"`
	Usuario *string  `json:"usuario"`
	Derecho string   `json:"derecho"`
	Activo  bool     `json:"activo"`
	Roles   []string `json:"roles"`
}

type UserInput struct {
	Nombre   string
	Usuario  *string
	PIN      *string
	Password *string
	Roles    []string
	Activo   bool
}

func hashArgon2ID(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	const memory, timeCost, parallelism, keyLength = 64 * 1024, 3, 4, 32
	key := argon2.IDKey([]byte(password), salt, timeCost, memory, parallelism, keyLength)
	return fmt.Sprintf("$argon2id$v=19$m=%d,p=%d,t=%d$%s$%s", memory, parallelism, timeCost,
		base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key)), nil
}

func validRoles(roles []string) ([]string, error) {
	known := map[string]bool{}
	for _, role := range Roles {
		known[role.Clave] = true
	}
	unique := make([]string, 0, len(roles))
	seen := map[string]bool{}
	for _, role := range roles {
		if !known[role] || seen[role] {
			continue
		}
		seen[role] = true
		unique = append(unique, role)
	}
	if len(unique) == 0 {
		return nil, ErrInvalidUser
	}
	return unique, nil
}

func rightForRoles(roles []string) string {
	for _, role := range roles {
		if role == "administrador" {
			return "avanzado"
		}
	}
	for _, role := range roles {
		if role != "cocina" {
			return "basico"
		}
	}
	return "minimo"
}

func username(input *string) *string {
	if input == nil {
		return nil
	}
	value := strings.ToLower(strings.TrimSpace(*input))
	if value == "" {
		return nil
	}
	return &value
}

func ListUsers(ctx context.Context, db *sql.DB) ([]ManagedUser, error) {
	rows, err := db.QueryContext(ctx, "SELECT id, nombre, usuario, derecho, activo FROM empleados ORDER BY activo DESC, nombre")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := []ManagedUser{}
	for rows.Next() {
		var user ManagedUser
		var value sql.NullString
		var active int
		if err := rows.Scan(&user.ID, &user.Nombre, &value, &user.Derecho, &active); err != nil {
			return nil, err
		}
		if value.Valid {
			user.Usuario = &value.String
		}
		user.Activo = active == 1
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	for index := range users {
		roles, err := rolesFor(ctx, db, users[index].ID)
		if err != nil {
			return nil, err
		}
		users[index].Roles = roles
	}
	return users, nil
}

func ListEmployees(ctx context.Context, db *sql.DB) ([]map[string]any, error) {
	rows, err := db.QueryContext(ctx, "SELECT id, nombre, derecho, activo FROM empleados WHERE activo = 1")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	employees := []map[string]any{}
	for rows.Next() {
		var id int64
		var name, right string
		var active int
		if err := rows.Scan(&id, &name, &right, &active); err != nil {
			return nil, err
		}
		employees = append(employees, map[string]any{"id": id, "nombre": name, "derecho": right, "activo": active})
	}
	return employees, rows.Err()
}

func CreateUser(ctx context.Context, db *sql.DB, input UserInput) (ManagedUser, error) {
	name := strings.TrimSpace(input.Nombre)
	user := username(input.Usuario)
	if name == "" || user == nil || input.PIN == nil || strings.TrimSpace(*input.PIN) == "" || input.Password == nil || strings.TrimSpace(*input.Password) == "" {
		return ManagedUser{}, ErrInvalidUser
	}
	roles, err := validRoles(input.Roles)
	if err != nil {
		return ManagedUser{}, err
	}
	pinHash, err := hashArgon2ID(*input.PIN)
	if err != nil {
		return ManagedUser{}, err
	}
	passwordHash, err := hashArgon2ID(*input.Password)
	if err != nil {
		return ManagedUser{}, err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return ManagedUser{}, err
	}
	result, err := tx.ExecContext(ctx, "INSERT INTO empleados (nombre, pin_hash, derecho, activo, usuario, password_hash) VALUES (?, ?, ?, 1, ?, ?)", name, pinHash, rightForRoles(roles), *user, passwordHash)
	if err == nil {
		id, idErr := result.LastInsertId()
		if idErr != nil {
			err = idErr
		} else {
			err = replaceRoles(ctx, tx, id, roles)
		}
	}
	if err != nil {
		tx.Rollback()
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return ManagedUser{}, ErrDuplicate
		}
		return ManagedUser{}, err
	}
	if err := tx.Commit(); err != nil {
		return ManagedUser{}, err
	}
	users, err := ListUsers(ctx, db)
	if err != nil {
		return ManagedUser{}, err
	}
	for _, item := range users {
		if item.Usuario != nil && *item.Usuario == *user {
			return item, nil
		}
	}
	return ManagedUser{}, errors.New("usuario creado sin poder leerlo")
}

func UpdateUser(ctx context.Context, db *sql.DB, id int64, input UserInput) (ManagedUser, error) {
	name := strings.TrimSpace(input.Nombre)
	if name == "" {
		return ManagedUser{}, ErrInvalidUser
	}
	roles, err := validRoles(input.Roles)
	if err != nil {
		return ManagedUser{}, err
	}
	var exists int
	if err := db.QueryRowContext(ctx, "SELECT count(*) FROM empleados WHERE id = ?", id).Scan(&exists); err != nil {
		return ManagedUser{}, err
	}
	if exists == 0 {
		return ManagedUser{}, sql.ErrNoRows
	}
	users, err := ListUsers(ctx, db)
	if err != nil {
		return ManagedUser{}, err
	}
	var current ManagedUser
	for _, candidate := range users {
		if candidate.ID == id {
			current = candidate
			break
		}
	}
	if hasRole(User{Roles: current.Roles}, "administrador") && (!input.Activo || !hasRole(User{Roles: roles}, "administrador")) {
		admins := 0
		for _, candidate := range users {
			if candidate.ID != id && candidate.Activo && hasRole(User{Roles: candidate.Roles}, "administrador") {
				admins++
			}
		}
		if admins == 0 {
			return ManagedUser{}, ErrLastAdmin
		}
	}

	user := username(input.Usuario)
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return ManagedUser{}, err
	}
	pinHash, passwordHash := any(nil), any(nil)
	if input.PIN != nil && strings.TrimSpace(*input.PIN) != "" {
		pinHash, err = hashArgon2ID(*input.PIN)
	}
	if err == nil && input.Password != nil && strings.TrimSpace(*input.Password) != "" {
		passwordHash, err = hashArgon2ID(*input.Password)
	}
	if err == nil {
		_, err = tx.ExecContext(ctx, `UPDATE empleados SET nombre = ?, usuario = ?, derecho = ?, activo = ?, pin_hash = COALESCE(?, pin_hash), password_hash = COALESCE(?, password_hash) WHERE id = ?`, name, user, rightForRoles(roles), boolToInt(input.Activo), pinHash, passwordHash, id)
	}
	if err == nil {
		err = replaceRoles(ctx, tx, id, roles)
	}
	if err != nil {
		tx.Rollback()
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return ManagedUser{}, ErrDuplicate
		}
		return ManagedUser{}, err
	}
	if err := tx.Commit(); err != nil {
		return ManagedUser{}, err
	}
	users, err = ListUsers(ctx, db)
	if err != nil {
		return ManagedUser{}, err
	}
	for _, candidate := range users {
		if candidate.ID == id {
			return candidate, nil
		}
	}
	return ManagedUser{}, sql.ErrNoRows
}

func replaceRoles(ctx context.Context, tx *sql.Tx, id int64, roles []string) error {
	if _, err := tx.ExecContext(ctx, "DELETE FROM empleado_roles WHERE empleado_id = ?", id); err != nil {
		return err
	}
	for _, role := range roles {
		if _, err := tx.ExecContext(ctx, "INSERT INTO empleado_roles (empleado_id, rol_clave) VALUES (?, ?)", id, role); err != nil {
			return err
		}
	}
	return nil
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
