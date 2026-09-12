package catalog

import (
	"context"
	"database/sql"
	"errors"
	"math"
	"strings"
)

type ContourGroup struct {
	ID        int64            `json:"id"`
	Nombre    string           `json:"nombre"`
	Variantes []ContourVariant `json:"variantes"`
}

type SlotGroup struct {
	ID     int64  `json:"id"`
	Nombre string `json:"nombre"`
}

type ContourVariant struct {
	ID                 int64  `json:"id"`
	GrupoID            int64  `json:"grupoId"`
	Nombre             string `json:"nombre"`
	SuplementoCentavos int64  `json:"suplementoCentavos"`
	ExtraCentavos      int64  `json:"extraCentavos"`
	Activo             bool   `json:"activo"`
}

type Slot struct {
	Posicion     int64       `json:"posicion"`
	Nombre       string      `json:"nombre"`
	PermiteExtra bool        `json:"permiteExtra"`
	Grupos       []SlotGroup `json:"grupos"`
}

type SlotInput struct {
	Posicion     int64   `json:"posicion"`
	Nombre       string  `json:"nombre"`
	PermiteExtra bool    `json:"permiteExtra"`
	GrupoIDs     []int64 `json:"grupoIds"`
}

func ListContours(ctx context.Context, db *sql.DB) ([]ContourGroup, error) {
	rows, err := db.QueryContext(ctx, "SELECT id, nombre FROM contorno_grupos ORDER BY nombre")
	if err != nil {
		return nil, err
	}
	groups := []ContourGroup{}
	for rows.Next() {
		var group ContourGroup
		if err := rows.Scan(&group.ID, &group.Nombre); err != nil {
			rows.Close()
			return nil, err
		}
		group.Variantes = []ContourVariant{}
		groups = append(groups, group)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	variantRows, err := db.QueryContext(ctx, `SELECT id, grupo_id, nombre, suplemento_centavos, extra_centavos, activo
		FROM contorno_variantes ORDER BY nombre`)
	if err != nil {
		return nil, err
	}
	defer variantRows.Close()
	byID := map[int64]int{}
	for index := range groups {
		byID[groups[index].ID] = index
	}
	for variantRows.Next() {
		var variant ContourVariant
		var active int
		if err := variantRows.Scan(&variant.ID, &variant.GrupoID, &variant.Nombre, &variant.SuplementoCentavos, &variant.ExtraCentavos, &active); err != nil {
			return nil, err
		}
		variant.Activo = active == 1
		if index, ok := byID[variant.GrupoID]; ok {
			groups[index].Variantes = append(groups[index].Variantes, variant)
		}
	}
	return groups, variantRows.Err()
}

func CreateContourGroup(ctx context.Context, db *sql.DB, name string) (SlotGroup, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return SlotGroup{}, &DomainError{"nombre_requerido", "El grupo necesita un nombre"}
	}
	var id int64
	if err := db.QueryRowContext(ctx, "SELECT id FROM contorno_grupos WHERE lower(nombre) = lower(?)", name).Scan(&id); err == nil {
		return SlotGroup{}, &DomainError{"grupo_duplicado", "Ese grupo de contornos ya existe"}
	} else if !errors.Is(err, sql.ErrNoRows) {
		return SlotGroup{}, err
	}
	result, err := db.ExecContext(ctx, "INSERT INTO contorno_grupos (nombre) VALUES (?)", name)
	if err != nil {
		return SlotGroup{}, err
	}
	id, err = result.LastInsertId()
	return SlotGroup{ID: id, Nombre: name}, err
}

func CreateContourVariant(ctx context.Context, db *sql.DB, groupID int64, name string, surcharge, extra float64) (int64, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return 0, &DomainError{"nombre_requerido", "La variante necesita un nombre"}
	}
	var id int64
	if err := db.QueryRowContext(ctx, "SELECT id FROM contorno_grupos WHERE id = ?", groupID).Scan(&id); errors.Is(err, sql.ErrNoRows) {
		return 0, &DomainError{"grupo_inexistente", "Grupo de contornos inexistente"}
	} else if err != nil {
		return 0, err
	}
	if err := db.QueryRowContext(ctx, "SELECT id FROM contorno_variantes WHERE grupo_id = ? AND lower(nombre) = lower(?)", groupID, name).Scan(&id); err == nil {
		return 0, &DomainError{"variante_duplicada", "Esa variante ya existe en el grupo"}
	} else if !errors.Is(err, sql.ErrNoRows) {
		return 0, err
	}
	surchargeCents := int64(math.Max(0, math.Round(surcharge)))
	extraCents := int64(math.Max(0, math.Round(extra)))
	result, err := db.ExecContext(ctx, `INSERT INTO contorno_variantes
		(grupo_id, nombre, suplemento_centavos, extra_centavos, activo) VALUES (?, ?, ?, ?, 1)`, groupID, name, surchargeCents, extraCents)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

func GetSlots(ctx context.Context, db *sql.DB, productID int64) ([]Slot, error) {
	rows, err := db.QueryContext(ctx, "SELECT id, posicion, nombre, permite_extra FROM plato_slots WHERE producto_id = ? ORDER BY posicion", productID)
	if err != nil {
		return nil, err
	}
	type slotRow struct {
		id   int64
		slot Slot
	}
	items := []slotRow{}
	for rows.Next() {
		var item slotRow
		var allowExtra int
		if err := rows.Scan(&item.id, &item.slot.Posicion, &item.slot.Nombre, &allowExtra); err != nil {
			rows.Close()
			return nil, err
		}
		item.slot.PermiteExtra = allowExtra == 1
		item.slot.Grupos = []SlotGroup{}
		items = append(items, item)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	for index := range items {
		groupRows, err := db.QueryContext(ctx, `SELECT g.id, g.nombre FROM plato_slot_grupos psg
			JOIN contorno_grupos g ON g.id = psg.grupo_id WHERE psg.slot_id = ? ORDER BY g.nombre`, items[index].id)
		if err != nil {
			return nil, err
		}
		for groupRows.Next() {
			var group SlotGroup
			if err := groupRows.Scan(&group.ID, &group.Nombre); err != nil {
				groupRows.Close()
				return nil, err
			}
			items[index].slot.Grupos = append(items[index].slot.Grupos, group)
		}
		if err := groupRows.Close(); err != nil {
			return nil, err
		}
	}
	result := make([]Slot, len(items))
	for index := range items {
		result[index] = items[index].slot
	}
	return result, nil
}

func SaveSlots(ctx context.Context, db *sql.DB, productID int64, slots []SlotInput) error {
	var id int64
	if err := db.QueryRowContext(ctx, "SELECT id FROM productos WHERE id = ?", productID).Scan(&id); errors.Is(err, sql.ErrNoRows) {
		return &DomainError{"producto_inexistente", "Producto inexistente"}
	} else if err != nil {
		return err
	}
	positions := map[int64]bool{}
	for _, slot := range slots {
		if strings.TrimSpace(slot.Nombre) == "" {
			return &DomainError{"slot_sin_nombre", "El slot necesita un nombre"}
		}
		if positions[slot.Posicion] {
			return &DomainError{"slot_duplicado", "Posición de slot repetida"}
		}
		positions[slot.Posicion] = true
		if len(slot.GrupoIDs) == 0 {
			return &DomainError{"slot_sin_grupos", "El slot necesita al menos un grupo"}
		}
		for _, groupID := range slot.GrupoIDs {
			if err := db.QueryRowContext(ctx, "SELECT id FROM contorno_grupos WHERE id = ?", groupID).Scan(&id); errors.Is(err, sql.ErrNoRows) {
				return &DomainError{"grupo_inexistente", "Grupo de contornos inexistente"}
			} else if err != nil {
				return err
			}
		}
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, "DELETE FROM plato_slots WHERE producto_id = ?", productID); err != nil {
		return err
	}
	for _, slot := range slots {
		result, err := tx.ExecContext(ctx, "INSERT INTO plato_slots (producto_id, posicion, nombre, permite_extra) VALUES (?, ?, ?, ?)", productID, slot.Posicion, strings.TrimSpace(slot.Nombre), boolInt(slot.PermiteExtra))
		if err != nil {
			return err
		}
		slotID, err := result.LastInsertId()
		if err != nil {
			return err
		}
		for _, groupID := range slot.GrupoIDs {
			if _, err := tx.ExecContext(ctx, "INSERT INTO plato_slot_grupos (slot_id, grupo_id) VALUES (?, ?)", slotID, groupID); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}
