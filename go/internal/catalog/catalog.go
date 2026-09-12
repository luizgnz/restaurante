package catalog

import (
	"context"
	"database/sql"
)

type Product struct {
	ID                 int64   `json:"id"`
	Nombre             string  `json:"nombre"`
	PrecioCentavos     int64   `json:"precio_centavos"`
	CategoriaID        *int64  `json:"categoria_id"`
	CategoriaNombre    *string `json:"categoria_nombre"`
	TipoConsumo        string  `json:"tipo_consumo"`
	Codigo             *string `json:"codigo"`
	Color              *string `json:"color"`
	FotoData           *string `json:"foto_data"`
	RastrearInventario int     `json:"rastrear_inventario"`
	Disponible         bool    `json:"disponible"`
	Armable            *int64  `json:"armable"`
	Configurable       bool    `json:"configurable"`
}

func List(ctx context.Context, db *sql.DB) ([]Product, error) {
	rows, err := db.QueryContext(ctx, `SELECT p.id, p.nombre, p.precio_centavos, p.categoria_id, c.nombre, p.tipo_consumo, p.codigo, p.color, p.foto_data, p.rastrear_inventario
		FROM productos p LEFT JOIN categorias_pos c ON c.id = p.categoria_id
		WHERE p.activo = 1 AND p.disponible_en_pos = 1
		ORDER BY COALESCE(lower(c.nombre), ''), lower(p.nombre)`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	products := []Product{}
	for rows.Next() {
		var product Product
		var categoryID sql.NullInt64
		var categoryName, code, color, photo sql.NullString
		if err := rows.Scan(&product.ID, &product.Nombre, &product.PrecioCentavos, &categoryID, &categoryName, &product.TipoConsumo, &code, &color, &photo, &product.RastrearInventario); err != nil {
			return nil, err
		}
		if categoryID.Valid {
			product.CategoriaID = &categoryID.Int64
		}
		if categoryName.Valid {
			product.CategoriaNombre = &categoryName.String
		}
		if code.Valid {
			product.Codigo = &code.String
		}
		if color.Valid {
			product.Color = &color.String
		}
		if photo.Valid {
			product.FotoData = &photo.String
		}
		products = append(products, product)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	for index := range products {
		available, buildable, err := availability(ctx, db, products[index].ID, products[index].TipoConsumo, products[index].RastrearInventario == 1)
		if err != nil {
			return nil, err
		}
		products[index].Disponible = available
		products[index].Armable = buildable
		var slots int
		if err := db.QueryRowContext(ctx, "SELECT count(*) FROM plato_slots WHERE producto_id = ?", products[index].ID).Scan(&slots); err != nil {
			return nil, err
		}
		products[index].Configurable = slots > 0
	}
	return products, nil
}

func availability(ctx context.Context, db *sql.DB, productID int64, kind string, tracksInventory bool) (bool, *int64, error) {
	if kind == "receta_kit" {
		rows, err := db.QueryContext(ctx, `SELECT rl.cantidad_real, COALESCE(s.on_hand_real, 0), COALESCE(s.reserved_real, 0)
			FROM receta_lineas rl LEFT JOIN stock s ON s.producto_id = rl.ingrediente_id WHERE rl.producto_id = ?`, productID)
		if err != nil {
			return false, nil, err
		}
		defer rows.Close()
		var minimum *int64
		components := 0
		for rows.Next() {
			var perUnit, onHand, reserved float64
			if err := rows.Scan(&perUnit, &onHand, &reserved); err != nil {
				return false, nil, err
			}
			components++
			available := int64((onHand - reserved) / perUnit)
			if minimum == nil || available < *minimum {
				minimum = &available
			}
		}
		if err := rows.Err(); err != nil {
			return false, nil, err
		}
		if components == 0 {
			return true, nil, nil
		}
		return *minimum > 0, minimum, nil
	}
	if kind == "almacenable_unitario" || tracksInventory {
		var onHand, reserved float64
		err := db.QueryRowContext(ctx, "SELECT on_hand_real, reserved_real FROM stock WHERE producto_id = ?", productID).Scan(&onHand, &reserved)
		if err == sql.ErrNoRows {
			zero := int64(0)
			return false, &zero, nil
		}
		if err != nil {
			return false, nil, err
		}
		available := int64(onHand - reserved)
		return available > 0, &available, nil
	}
	return true, nil, nil
}
