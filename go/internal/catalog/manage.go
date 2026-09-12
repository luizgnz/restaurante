package catalog

import (
	"context"
	"database/sql"
	"errors"
	"math"
	"strings"
)

type DomainError struct {
	Code    string
	Message string
}

func (e *DomainError) Error() string { return e.Message }

type Category struct {
	ID       int64  `json:"id"`
	Nombre   string `json:"nombre"`
	Estacion string `json:"estacion"`
}

type ManagedProduct struct {
	ID                 int64  `json:"id"`
	Nombre             string `json:"nombre"`
	PrecioCentavos     int64  `json:"precio_centavos"`
	TipoConsumo        string `json:"tipo_consumo"`
	RastrearInventario int    `json:"rastrear_inventario"`
	DisponibleEnPOS    int    `json:"disponible_en_pos"`
	Activo             int    `json:"activo"`
}

type RecipeLine struct {
	IngredienteID int64   `json:"ingredienteId"`
	Nombre        string  `json:"nombre,omitempty"`
	Cantidad      float64 `json:"cantidad"`
}

type ProductInput struct {
	Nombre             string       `json:"nombre"`
	PrecioCentavos     int64        `json:"precio_centavos"`
	CategoriaID        *int64       `json:"categoria_id"`
	TipoConsumo        string       `json:"tipo_consumo"`
	DisponibleEnPOS    *bool        `json:"disponible_en_pos"`
	RastrearInventario *bool        `json:"rastrear_inventario"`
	Codigo             *string      `json:"codigo"`
	Color              *string      `json:"color"`
	FotoData           *string      `json:"foto_data"`
	Receta             []RecipeLine `json:"receta"`
}

type dbtx interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func ListCategories(ctx context.Context, db *sql.DB) ([]Category, error) {
	rows, err := db.QueryContext(ctx, "SELECT id, nombre, estacion FROM categorias_pos ORDER BY nombre")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Category{}
	for rows.Next() {
		var item Category
		if err := rows.Scan(&item.ID, &item.Nombre, &item.Estacion); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func CreateCategory(ctx context.Context, db *sql.DB, name string) (Category, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Category{}, &DomainError{"nombre_requerido", "La categoría necesita un nombre"}
	}
	if len([]rune(name)) > 40 {
		return Category{}, &DomainError{"nombre_invalido", "Nombre de categoría demasiado largo"}
	}
	var existing int64
	err := db.QueryRowContext(ctx, "SELECT id FROM categorias_pos WHERE lower(nombre) = lower(?)", name).Scan(&existing)
	if err == nil {
		return Category{}, &DomainError{"categoria_duplicada", "Esa categoría ya existe"}
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return Category{}, err
	}
	result, err := db.ExecContext(ctx, "INSERT INTO categorias_pos (nombre, estacion) VALUES (?, 'cocina')", name)
	if err != nil {
		return Category{}, err
	}
	id, err := result.LastInsertId()
	return Category{ID: id, Nombre: name, Estacion: "cocina"}, err
}

func ListProducts(ctx context.Context, db *sql.DB) ([]ManagedProduct, error) {
	rows, err := db.QueryContext(ctx, `SELECT p.id, p.nombre, p.precio_centavos, p.tipo_consumo,
		EXISTS(SELECT 1 FROM stock s WHERE s.producto_id = p.id), p.disponible_en_pos, p.activo
		FROM productos p WHERE p.activo = 1 ORDER BY p.nombre`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []ManagedProduct{}
	for rows.Next() {
		var item ManagedProduct
		if err := rows.Scan(&item.ID, &item.Nombre, &item.PrecioCentavos, &item.TipoConsumo, &item.RastrearInventario, &item.DisponibleEnPOS, &item.Activo); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func CreateProduct(ctx context.Context, db *sql.DB, input ProductInput) (int64, error) {
	input.Nombre = strings.TrimSpace(input.Nombre)
	if input.Nombre == "" {
		return 0, &DomainError{"nombre_requerido", "El producto necesita un nombre"}
	}
	if input.PrecioCentavos < 0 {
		return 0, &DomainError{"precio_invalido", "Precio inválido"}
	}
	if input.TipoConsumo == "" {
		input.TipoConsumo = "no_almacenable"
	}
	if input.TipoConsumo != "no_almacenable" && input.TipoConsumo != "almacenable_unitario" && input.TipoConsumo != "receta_kit" {
		return 0, &DomainError{"tipo_invalido", "Tipo de producto inválido"}
	}
	if input.CategoriaID != nil {
		var id int64
		if err := db.QueryRowContext(ctx, "SELECT id FROM categorias_pos WHERE id = ?", *input.CategoriaID).Scan(&id); errors.Is(err, sql.ErrNoRows) {
			return 0, &DomainError{"categoria_inexistente", "Categoría inexistente"}
		} else if err != nil {
			return 0, err
		}
	}
	code := nullableTrim(input.Codigo)
	if code != nil {
		var id int64
		if err := db.QueryRowContext(ctx, "SELECT id FROM productos WHERE codigo = ?", *code).Scan(&id); err == nil {
			return 0, &DomainError{"codigo_duplicado", "Ese código de producto ya existe"}
		} else if !errors.Is(err, sql.ErrNoRows) {
			return 0, err
		}
	}
	available := true
	if input.DisponibleEnPOS != nil {
		available = *input.DisponibleEnPOS
	}
	track := true
	if input.RastrearInventario != nil {
		track = *input.RastrearInventario
	}
	kind := input.TipoConsumo
	if kind != "receta_kit" {
		if track {
			kind = "almacenable_unitario"
		} else {
			kind = "no_almacenable"
		}
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `INSERT INTO productos
		(nombre, precio_centavos, categoria_id, tipo_consumo, disponible_en_pos, activo, codigo, color, foto_data, rastrear_inventario)
		VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`, input.Nombre, input.PrecioCentavos, input.CategoriaID, kind, boolInt(available), code, nullableTrim(input.Color), nullableTrim(input.FotoData), boolInt(track))
	if err != nil {
		return 0, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}
	if track || kind == "almacenable_unitario" {
		if _, err := tx.ExecContext(ctx, "INSERT INTO stock (producto_id, on_hand_real, reserved_real) VALUES (?, 0, 0)", id); err != nil {
			return 0, err
		}
	}
	if kind == "receta_kit" {
		if err := saveRecipe(ctx, tx, id, input.Receta); err != nil {
			return 0, err
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return id, nil
}

func GetRecipe(ctx context.Context, db *sql.DB, productID int64) ([]RecipeLine, error) {
	rows, err := db.QueryContext(ctx, `SELECT rl.ingrediente_id, p.nombre, rl.cantidad_real
		FROM receta_lineas rl JOIN productos p ON p.id = rl.ingrediente_id
		WHERE rl.producto_id = ? ORDER BY rl.id`, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []RecipeLine{}
	for rows.Next() {
		var item RecipeLine
		if err := rows.Scan(&item.IngredienteID, &item.Nombre, &item.Cantidad); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func SaveRecipe(ctx context.Context, db *sql.DB, productID int64, lines []RecipeLine) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := saveRecipe(ctx, tx, productID, lines); err != nil {
		return err
	}
	return tx.Commit()
}

func saveRecipe(ctx context.Context, q dbtx, productID int64, lines []RecipeLine) error {
	var kind string
	if err := q.QueryRowContext(ctx, "SELECT tipo_consumo FROM productos WHERE id = ? AND activo = 1", productID).Scan(&kind); errors.Is(err, sql.ErrNoRows) {
		return &DomainError{"producto_inexistente", "El producto no existe"}
	} else if err != nil {
		return err
	}
	if kind != "receta_kit" {
		return &DomainError{"producto_no_receta", "El producto no está configurado como receta"}
	}
	if len(lines) == 0 {
		return &DomainError{"receta_vacia", "La receta necesita al menos un ingrediente"}
	}
	seen := map[int64]bool{}
	for _, line := range lines {
		if line.IngredienteID <= 0 || line.IngredienteID == productID {
			return &DomainError{"ingrediente_invalido", "Selecciona un ingrediente válido"}
		}
		if math.IsNaN(line.Cantidad) || math.IsInf(line.Cantidad, 0) || line.Cantidad <= 0 || line.Cantidad > 1_000_000 {
			return &DomainError{"cantidad_receta_invalida", "La cantidad de cada ingrediente debe ser mayor que cero"}
		}
		if seen[line.IngredienteID] {
			return &DomainError{"ingrediente_duplicado", "Un ingrediente no puede repetirse"}
		}
		seen[line.IngredienteID] = true
		var id int64
		if err := q.QueryRowContext(ctx, `SELECT p.id FROM productos p JOIN stock s ON s.producto_id = p.id
			WHERE p.id = ? AND p.activo = 1 AND p.tipo_consumo != 'receta_kit'`, line.IngredienteID).Scan(&id); errors.Is(err, sql.ErrNoRows) {
			return &DomainError{"ingrediente_inexistente", "El ingrediente debe ser un material activo con control de inventario"}
		} else if err != nil {
			return err
		}
	}
	if _, err := q.ExecContext(ctx, "DELETE FROM receta_lineas WHERE producto_id = ?", productID); err != nil {
		return err
	}
	for _, line := range lines {
		if _, err := q.ExecContext(ctx, "INSERT INTO receta_lineas (producto_id, ingrediente_id, cantidad_real) VALUES (?, ?, ?)", productID, line.IngredienteID, line.Cantidad); err != nil {
			return err
		}
	}
	return nil
}

func nullableTrim(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
