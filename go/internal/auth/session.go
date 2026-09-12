package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/argon2"
)

const CookieName = "restaurante_sesion"

var (
	ErrCredentials = errors.New("credenciales inválidas")
	ErrForbidden   = errors.New("sin derecho")
	ErrInvalidPIN  = errors.New("PIN inválido")
)

type User struct {
	ID      int64    `json:"id"`
	Nombre  string   `json:"nombre"`
	Derecho string   `json:"derecho"`
	Roles   []string `json:"roles"`
}

// VerifyPINForAdmin conserva la firma rápida de inventario: la acción exige
// PIN de administrador incluso si quien inició la sesión tiene otro rol.
func VerifyPINForAdmin(ctx context.Context, db *sql.DB, pin string) (User, error) {
	return VerifyPINForRoles(ctx, db, pin, "administrador")
}

// VerifyPINForRoles valida una firma operativa contra los hashes Argon2id que
// ya existen y comprueba los roles explícitos del usuario.
func VerifyPINForRoles(ctx context.Context, db *sql.DB, pin string, allowed ...string) (User, error) {
	if strings.TrimSpace(pin) == "" {
		return User{}, ErrInvalidPIN
	}
	rows, err := db.QueryContext(ctx, "SELECT id, nombre, derecho, pin_hash FROM empleados WHERE activo = 1")
	if err != nil {
		return User{}, err
	}
	defer rows.Close()
	var matched *User
	for rows.Next() {
		var user User
		var hash string
		if err := rows.Scan(&user.ID, &user.Nombre, &user.Derecho, &hash); err != nil {
			return User{}, err
		}
		match, err := verifyArgon2ID(pin, hash)
		if err != nil || !match {
			continue
		}
		matched = &user
		break
	}
	if err := rows.Err(); err != nil {
		return User{}, err
	}
	if matched == nil {
		return User{}, ErrInvalidPIN
	}
	if err := rows.Close(); err != nil {
		return User{}, err
	}
	roles, err := rolesFor(ctx, db, matched.ID)
	if err != nil {
		return User{}, err
	}
	matched.Roles = roles
	permitted := hasRole(*matched, "administrador")
	for _, role := range allowed {
		permitted = permitted || hasRole(*matched, role)
	}
	if !permitted {
		return User{}, ErrForbidden
	}
	return *matched, nil
}

type Session struct {
	ID        int64  `json:"id"`
	AbiertaEn string `json:"abierta_en"`
	Usuario   User   `json:"usuario"`
}

func timestamp() string {
	return time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
}

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func rolesFor(ctx context.Context, db *sql.DB, employeeID int64) ([]string, error) {
	rows, err := db.QueryContext(ctx, "SELECT rol_clave FROM empleado_roles WHERE empleado_id = ? ORDER BY rol_clave", employeeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	roles := []string{}
	for rows.Next() {
		var role string
		if err := rows.Scan(&role); err != nil {
			return nil, err
		}
		roles = append(roles, role)
	}
	return roles, rows.Err()
}

func hasRole(user User, role string) bool {
	for _, candidate := range user.Roles {
		if candidate == role {
			return true
		}
	}
	return false
}

// Open comprueba las mismas contraseñas Argon2id generadas por Node y crea un
// token opaco, almacenando solo su hash en SQLite.
func Open(ctx context.Context, db *sql.DB, username, password string) (string, Session, error) {
	username = strings.ToLower(strings.TrimSpace(username))
	if username == "" || password == "" {
		return "", Session{}, ErrCredentials
	}

	var user User
	var passwordHash string
	err := db.QueryRowContext(ctx, `SELECT id, nombre, derecho, password_hash
		FROM empleados WHERE activo = 1 AND usuario = ?`, username).Scan(&user.ID, &user.Nombre, &user.Derecho, &passwordHash)
	if err == sql.ErrNoRows || passwordHash == "" {
		return "", Session{}, ErrCredentials
	}
	if err != nil {
		return "", Session{}, fmt.Errorf("buscar usuario: %w", err)
	}
	match, err := verifyArgon2ID(password, passwordHash)
	if err != nil || !match {
		return "", Session{}, ErrCredentials
	}
	user.Roles, err = rolesFor(ctx, db, user.ID)
	if err != nil {
		return "", Session{}, fmt.Errorf("leer roles: %w", err)
	}

	if err := ensurePOSSession(ctx, db, user.ID); err != nil {
		return "", Session{}, err
	}
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", Session{}, fmt.Errorf("generar token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(bytes)
	openedAt := timestamp()
	result, err := db.ExecContext(ctx, "INSERT INTO sesiones_usuario (token_hash, empleado_id, abierta_en) VALUES (?, ?, ?)", tokenHash(token), user.ID, openedAt)
	if err != nil {
		return "", Session{}, fmt.Errorf("abrir sesión: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return "", Session{}, fmt.Errorf("identificar sesión: %w", err)
	}
	return token, Session{ID: id, AbiertaEn: openedAt, Usuario: user}, nil
}

// verifyArgon2ID entiende el formato PHC que ya emite el paquete `argon2` de
// Node. En particular, Node serializa los parámetros como m,p,t, mientras que
// algunos wrappers Go esperan estrictamente m,t,p.
func verifyArgon2ID(password, encoded string) (bool, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" || parts[2] != "v=19" {
		return false, errors.New("hash Argon2id inválido")
	}
	params := map[string]uint64{}
	for _, part := range strings.Split(parts[3], ",") {
		pair := strings.SplitN(part, "=", 2)
		if len(pair) != 2 {
			return false, errors.New("parámetros Argon2id inválidos")
		}
		value, err := strconv.ParseUint(pair[1], 10, 32)
		if err != nil {
			return false, errors.New("parámetros Argon2id inválidos")
		}
		params[pair[0]] = value
	}
	memory, timeCost, parallelism := params["m"], params["t"], params["p"]
	if memory < 8*1024 || memory > 1024*1024 || timeCost < 1 || timeCost > 10 || parallelism < 1 || parallelism > 32 {
		return false, errors.New("parámetros Argon2id fuera de rango")
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) < 8 {
		return false, errors.New("salt Argon2id inválido")
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(expected) < 16 {
		return false, errors.New("resultado Argon2id inválido")
	}
	actual := argon2.IDKey([]byte(password), salt, uint32(timeCost), uint32(memory), uint8(parallelism), uint32(len(expected)))
	return subtle.ConstantTimeCompare(actual, expected) == 1, nil
}

func ensurePOSSession(ctx context.Context, db *sql.DB, employeeID int64) error {
	var id int64
	err := db.QueryRowContext(ctx, "SELECT id FROM sesiones_pos WHERE cerrada_en IS NULL ORDER BY id DESC LIMIT 1").Scan(&id)
	if err == nil {
		return nil
	}
	if err != sql.ErrNoRows {
		return fmt.Errorf("consultar turno: %w", err)
	}
	_, err = db.ExecContext(ctx, "INSERT INTO sesiones_pos (administrador_id, abierta_en) VALUES (?, ?)", employeeID, timestamp())
	if err != nil {
		return fmt.Errorf("abrir turno: %w", err)
	}
	return nil
}

func ByToken(ctx context.Context, db *sql.DB, token string) (*Session, error) {
	if token == "" {
		return nil, nil
	}
	var session Session
	err := db.QueryRowContext(ctx, `SELECT su.id, su.abierta_en, e.id, e.nombre, e.derecho
		FROM sesiones_usuario su JOIN empleados e ON e.id = su.empleado_id
		WHERE su.token_hash = ? AND su.cerrada_en IS NULL AND e.activo = 1 LIMIT 1`, tokenHash(token)).
		Scan(&session.ID, &session.AbiertaEn, &session.Usuario.ID, &session.Usuario.Nombre, &session.Usuario.Derecho)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("buscar sesión: %w", err)
	}
	roles, err := rolesFor(ctx, db, session.Usuario.ID)
	if err != nil {
		return nil, fmt.Errorf("leer roles: %w", err)
	}
	session.Usuario.Roles = roles
	return &session, nil
}

func Close(ctx context.Context, db *sql.DB, token string) error {
	if token == "" {
		return nil
	}
	_, err := db.ExecContext(ctx, "UPDATE sesiones_usuario SET cerrada_en = ? WHERE token_hash = ? AND cerrada_en IS NULL", timestamp(), tokenHash(token))
	return err
}

func CloseTurn(ctx context.Context, db *sql.DB, session *Session) error {
	if session == nil || !hasRole(session.Usuario, "administrador") {
		return ErrForbidden
	}
	if _, err := db.ExecContext(ctx, "UPDATE sesiones_usuario SET cerrada_en = ? WHERE cerrada_en IS NULL", timestamp()); err != nil {
		return err
	}
	_, err := db.ExecContext(ctx, "UPDATE sesiones_pos SET cerrada_en = ? WHERE cerrada_en IS NULL", timestamp())
	return err
}
