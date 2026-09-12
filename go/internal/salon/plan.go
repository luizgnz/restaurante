package salon

import (
	"context"
	"database/sql"
	"encoding/base64"
	"strings"
)

type DomainError struct{ Code, Message string }

func (e *DomainError) Error() string { return e.Message }

type TableInput struct {
	ID         *int64  `json:"id"`
	PisoID     *int64  `json:"piso_id"`
	Numero     int     `json:"numero"`
	Asientos   int     `json:"asientos"`
	PosX       float64 `json:"pos_x"`
	PosY       float64 `json:"pos_y"`
	Forma      string  `json:"forma"`
	Ancho      float64 `json:"ancho"`
	Alto       float64 `json:"alto"`
	FondoColor *string `json:"fondo_color"`
	FondoData  *string `json:"fondo_data"`
}

type FloorInput struct {
	ID                *int64       `json:"id"`
	Nombre            string       `json:"nombre"`
	Mesas             []TableInput `json:"mesas"`
	FondoColor        *string      `json:"fondo_color"`
	FondoData         *string      `json:"fondo_data"`
	FondoQuitarImagen bool         `json:"fondo_quitar_imagen"`
}

type PlanInput struct {
	Pisos         []FloorInput `json:"pisos"`
	QuitarMesaIDs []int64      `json:"quitarMesaIds"`
	QuitarPisoIDs []int64      `json:"quitarPisoIds"`
}

type SavedFloor struct {
	ID     int64  `json:"id"`
	Nombre string `json:"nombre"`
}

func SavePlan(ctx context.Context, db *sql.DB, input PlanInput) ([]SavedFloor, error) {
	if err := validatePlan(ctx, db, input); err != nil {
		return nil, err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	out := []SavedFloor{}
	for _, floor := range input.Pisos {
		name := strings.TrimSpace(floor.Nombre)
		var floorID int64
		if floor.ID != nil && *floor.ID > 0 {
			floorID = *floor.ID
			if _, err := tx.ExecContext(ctx, "UPDATE pisos SET nombre = ?, fondo_color = ?, activo = 1 WHERE id = ?", name, floor.FondoColor, floorID); err != nil {
				return nil, err
			}
		} else {
			result, err := tx.ExecContext(ctx, "INSERT INTO pisos (nombre, fondo_color, activo) VALUES (?, ?, 1)", name, floor.FondoColor)
			if err != nil {
				return nil, err
			}
			floorID, err = result.LastInsertId()
			if err != nil {
				return nil, err
			}
		}
		if err := saveFloorBackground(ctx, tx, floorID, floor.FondoData, floor.FondoQuitarImagen); err != nil {
			return nil, err
		}
		out = append(out, SavedFloor{ID: floorID, Nombre: name})
		for _, table := range floor.Mesas {
			shape := "square"
			if table.Forma == "round" {
				shape = "round"
			}
			seats := table.Asientos
			if seats < 1 {
				seats = 1
			}
			number := table.Numero
			if number < 1 {
				number = 1
			}
			if table.ID != nil && *table.ID > 0 {
				_, err = tx.ExecContext(ctx, `UPDATE mesas SET piso_id = ?, numero = ?, asientos = ?, pos_x = ?, pos_y = ?,
					forma = ?, ancho = ?, alto = ?, activa = 1, fondo_color = ?, fondo_data = ? WHERE id = ?`,
					floorID, number, seats, table.PosX, table.PosY, shape, table.Ancho, table.Alto, table.FondoColor, table.FondoData, *table.ID)
			} else {
				_, err = tx.ExecContext(ctx, `INSERT INTO mesas
					(piso_id, numero, asientos, activa, pos_x, pos_y, forma, ancho, alto, fondo_color, fondo_data)
					VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`, floorID, number, seats, table.PosX, table.PosY, shape, table.Ancho, table.Alto, table.FondoColor, table.FondoData)
			}
			if err != nil {
				return nil, err
			}
		}
	}
	for _, tableID := range input.QuitarMesaIDs {
		occupied, err := tableOccupied(ctx, tx, tableID)
		if err != nil {
			return nil, err
		}
		if occupied {
			return nil, &DomainError{"mesa_ocupada", "No se quita una mesa con consumo"}
		}
		if _, err := tx.ExecContext(ctx, "UPDATE mesas SET activa = 0 WHERE id = ?", tableID); err != nil {
			return nil, err
		}
	}
	for _, floorID := range input.QuitarPisoIDs {
		rows, err := tx.QueryContext(ctx, "SELECT id FROM mesas WHERE piso_id = ? AND activa = 1", floorID)
		if err != nil {
			return nil, err
		}
		ids := []int64{}
		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return nil, err
			}
			ids = append(ids, id)
		}
		rows.Close()
		for _, tableID := range ids {
			occupied, err := tableOccupied(ctx, tx, tableID)
			if err != nil {
				return nil, err
			}
			if occupied {
				return nil, &DomainError{"piso_ocupado", "No se elimina un piso con consumo abierto"}
			}
		}
		if _, err := tx.ExecContext(ctx, "UPDATE mesas SET activa = 0 WHERE piso_id = ?", floorID); err != nil {
			return nil, err
		}
		if _, err := tx.ExecContext(ctx, "UPDATE pisos SET activo = 0 WHERE id = ?", floorID); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return out, nil
}

func validatePlan(ctx context.Context, db *sql.DB, input PlanInput) error {
	removedTables := idSet(input.QuitarMesaIDs)
	removedFloors := idSet(input.QuitarPisoIDs)
	floorNames := map[string]string{}
	tableNumbers := map[int]string{}
	payloadTables := map[int64]bool{}
	payloadFloors := map[int64]bool{}
	for _, floor := range input.Pisos {
		name := strings.TrimSpace(floor.Nombre)
		if name == "" {
			return &DomainError{"piso_sin_nombre", "El piso necesita un nombre"}
		}
		key := strings.ToLower(name)
		if previous, ok := floorNames[key]; ok {
			return &DomainError{"piso_nombre_duplicado", "Ya hay un piso llamado " + previous}
		}
		floorNames[key] = name
		if floor.ID != nil {
			payloadFloors[*floor.ID] = true
		}
		for _, table := range floor.Mesas {
			if table.ID != nil && removedTables[*table.ID] {
				continue
			}
			if table.ID != nil {
				payloadTables[*table.ID] = true
			}
			number := table.Numero
			if number < 1 {
				number = 1
			}
			if previous, ok := tableNumbers[number]; ok {
				return &DomainError{"mesa_numero_duplicado", "La mesa ya existe (" + previous + ")"}
			}
			tableNumbers[number] = name
		}
	}
	rows, err := db.QueryContext(ctx, "SELECT id, nombre FROM pisos WHERE COALESCE(activo, 1) = 1")
	if err != nil {
		return err
	}
	for rows.Next() {
		var id int64
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			rows.Close()
			return err
		}
		if removedFloors[id] || payloadFloors[id] {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(name))
		if _, ok := floorNames[key]; ok {
			rows.Close()
			return &DomainError{"piso_nombre_duplicado", "Ya hay un piso llamado " + name}
		}
		floorNames[key] = name
	}
	rows.Close()
	tables, err := db.QueryContext(ctx, "SELECT id, numero, piso_id FROM mesas WHERE activa = 1")
	if err != nil {
		return err
	}
	defer tables.Close()
	for tables.Next() {
		var id, floorID int64
		var number int
		if err := tables.Scan(&id, &number, &floorID); err != nil {
			return err
		}
		if removedTables[id] || removedFloors[floorID] || payloadTables[id] {
			continue
		}
		if _, ok := tableNumbers[number]; ok {
			return &DomainError{"mesa_numero_duplicado", "La mesa ya existe"}
		}
		tableNumbers[number] = "existente"
	}
	return tables.Err()
}

func SaveBackground(ctx context.Context, db *sql.DB, floorID int64, dataURL string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := saveFloorBackground(ctx, tx, floorID, &dataURL, false); err != nil {
		return err
	}
	return tx.Commit()
}

func GetBackground(ctx context.Context, db *sql.DB, floorID int64) (string, []byte, error) {
	var mime sql.NullString
	var data []byte
	err := db.QueryRowContext(ctx, "SELECT fondo_mime, fondo_blob FROM pisos WHERE id = ?", floorID).Scan(&mime, &data)
	if err != nil {
		return "", nil, err
	}
	if len(data) == 0 {
		return "", nil, sql.ErrNoRows
	}
	if !mime.Valid || mime.String == "" {
		mime.String = "image/jpeg"
	}
	return mime.String, data, nil
}

func saveFloorBackground(ctx context.Context, tx *sql.Tx, floorID int64, dataURL *string, remove bool) error {
	if remove {
		_, err := tx.ExecContext(ctx, "UPDATE pisos SET fondo_mime = NULL, fondo_blob = NULL WHERE id = ?", floorID)
		return err
	}
	if dataURL == nil || *dataURL == "" {
		return nil
	}
	value := *dataURL
	marker := ";base64,"
	index := strings.Index(value, marker)
	if !strings.HasPrefix(value, "data:") || index < 5 {
		return &DomainError{"imagen_invalida", "La imagen no es válida"}
	}
	mime := value[5:index]
	data, err := base64.StdEncoding.DecodeString(value[index+len(marker):])
	if err != nil {
		return &DomainError{"imagen_invalida", "La imagen no es válida"}
	}
	result, err := tx.ExecContext(ctx, "UPDATE pisos SET fondo_mime = ?, fondo_blob = ? WHERE id = ?", mime, data, floorID)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return &DomainError{"piso_inexistente", "El piso no existe"}
	}
	return nil
}

func tableOccupied(ctx context.Context, q interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}, tableID int64) (bool, error) {
	var count int
	err := q.QueryRowContext(ctx, `SELECT
		(SELECT count(*) FROM cuentas WHERE mesa_id = ? AND estado IN ('abierta','precuenta_emitida')) +
		(SELECT count(*) FROM pedidos WHERE mesa_id = ? AND estado NOT IN ('en_caja','cancelado'))`, tableID, tableID).Scan(&count)
	return count > 0, err
}

func idSet(ids []int64) map[int64]bool {
	result := map[int64]bool{}
	for _, id := range ids {
		result[id] = true
	}
	return result
}
