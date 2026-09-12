package salon

import (
	"context"
	"database/sql"
)

type Mesa struct {
	ID         int64   `json:"id"`
	PisoID     int64   `json:"piso_id"`
	Numero     int     `json:"numero"`
	Asientos   int     `json:"asientos"`
	Activa     int     `json:"activa"`
	PosX       float64 `json:"pos_x"`
	PosY       float64 `json:"pos_y"`
	Forma      string  `json:"forma"`
	Ancho      float64 `json:"ancho"`
	Alto       float64 `json:"alto"`
	FondoColor *string `json:"fondo_color"`
	FondoData  *string `json:"fondo_data"`
	Estado     string  `json:"estado"`
	CuentaID   *int64  `json:"cuentaId"`
}

type Piso struct {
	ID         int64   `json:"id"`
	Nombre     string  `json:"nombre"`
	FondoColor *string `json:"fondo_color"`
	TieneFondo int     `json:"tiene_fondo"`
}

type Vista struct {
	Mesas []Mesa `json:"mesas"`
	Pisos []Piso `json:"pisos"`
}

func List(ctx context.Context, db *sql.DB) (Vista, error) {
	rows, err := db.QueryContext(ctx, `SELECT id, piso_id, numero, asientos, activa, pos_x, pos_y, forma, ancho, alto, fondo_color, fondo_data FROM mesas WHERE activa = 1`)
	if err != nil {
		return Vista{}, err
	}
	defer rows.Close()
	view := Vista{Mesas: []Mesa{}, Pisos: []Piso{}}
	for rows.Next() {
		var table Mesa
		var color, data sql.NullString
		if err := rows.Scan(&table.ID, &table.PisoID, &table.Numero, &table.Asientos, &table.Activa, &table.PosX, &table.PosY, &table.Forma, &table.Ancho, &table.Alto, &color, &data); err != nil {
			return Vista{}, err
		}
		if color.Valid {
			table.FondoColor = &color.String
		}
		if data.Valid {
			table.FondoData = &data.String
		}
		view.Mesas = append(view.Mesas, table)
	}
	if err := rows.Err(); err != nil {
		return Vista{}, err
	}
	if err := rows.Close(); err != nil {
		return Vista{}, err
	}
	for index := range view.Mesas {
		table := &view.Mesas[index]
		var accountID int64
		var accountState string
		err := db.QueryRowContext(ctx, `SELECT id, estado FROM cuentas WHERE mesa_id = ? AND estado IN ('abierta', 'precuenta_emitida') ORDER BY id DESC LIMIT 1`, table.ID).Scan(&accountID, &accountState)
		if err == nil {
			table.CuentaID = &accountID
			if accountState == "precuenta_emitida" {
				table.Estado = "precuenta"
			} else {
				table.Estado = "en_cocina"
			}
		} else if err == sql.ErrNoRows {
			table.Estado = "libre"
		} else {
			return Vista{}, err
		}
	}

	floors, err := db.QueryContext(ctx, `SELECT id, nombre, fondo_color, CASE WHEN fondo_blob IS NULL THEN 0 ELSE 1 END AS tiene_fondo FROM pisos WHERE COALESCE(activo, 1) = 1`)
	if err != nil {
		return Vista{}, err
	}
	defer floors.Close()
	for floors.Next() {
		var floor Piso
		var color sql.NullString
		if err := floors.Scan(&floor.ID, &floor.Nombre, &color, &floor.TieneFondo); err != nil {
			return Vista{}, err
		}
		if color.Valid {
			floor.FondoColor = &color.String
		}
		view.Pisos = append(view.Pisos, floor)
	}
	return view, floors.Err()
}
