package orders

import (
	"context"
	"database/sql"
	"errors"
)

type contourSlot struct {
	id          int64
	position    int64
	name        string
	allowsExtra bool
	groups      []contourGroup
}

type contourGroup struct {
	id   int64
	name string
}

type contourVariant struct {
	id              int64
	groupID         int64
	name            string
	supplementPrice int64
	extraPrice      int64
}

func validateContours(ctx context.Context, tx *sql.Tx, productID int64, selected []Contour) ([]validatedContour, error) {
	slots, err := contourSlots(ctx, tx, productID)
	if err != nil {
		return nil, err
	}
	if len(slots) == 0 {
		if len(selected) > 0 {
			return nil, &Error{"slot_inexistente", "El producto no tiene contornos"}
		}
		return []validatedContour{}, nil
	}

	selectedByPosition := map[int64][]Contour{}
	for _, selection := range selected {
		selectedByPosition[selection.SlotPosition] = append(selectedByPosition[selection.SlotPosition], selection)
	}
	output := []validatedContour{}
	knownPositions := map[int64]bool{}
	for _, slot := range slots {
		knownPositions[slot.position] = true
		selections := selectedByPosition[slot.position]
		if len(selections) == 0 {
			return nil, &Error{"contornos_incompletos", "Falta elegir " + slot.name}
		}

		allowedGroups := map[int64]contourGroup{}
		for _, group := range slot.groups {
			allowedGroups[group.id] = group
		}
		byGroup := map[int64][]contourVariant{}
		for _, selection := range selections {
			variant, err := activeContourVariant(ctx, tx, selection.VariantID)
			if err != nil {
				return nil, err
			}
			if _, ok := allowedGroups[variant.groupID]; !ok {
				return nil, &Error{"variante_no_permitida", variant.name + " no es una opción de " + slot.name}
			}
			byGroup[variant.groupID] = append(byGroup[variant.groupID], variant)
		}

		orderInSlot := 0
		for _, group := range slot.groups {
			variants := byGroup[group.id]
			if len(variants) == 0 {
				count, err := activeVariantsCount(ctx, tx, group.id)
				if err != nil {
					return nil, err
				}
				if count > 0 {
					return nil, &Error{"contornos_incompletos", "Falta elegir una opción de " + group.name + " en " + slot.name}
				}
				continue
			}
			for index, variant := range variants {
				isExtra := index > 0
				price := variant.supplementPrice
				if isExtra {
					if !slot.allowsExtra || variant.extraPrice <= 0 {
						return nil, &Error{"extra_no_permitido", slot.name + " no permite ese extra"}
					}
					price = variant.extraPrice
				}
				extra := 0
				if isExtra {
					extra = 1
				}
				output = append(output, validatedContour{
					position: slot.position,
					slot:     slot.name,
					variant:  variant.name,
					price:    price,
					extra:    extra,
					order:    orderInSlot,
				})
				orderInSlot++
			}
		}
	}
	for position := range selectedByPosition {
		if !knownPositions[position] {
			return nil, &Error{"slot_inexistente", "El slot no existe en el plato"}
		}
	}
	return output, nil
}

func contourSlots(ctx context.Context, tx *sql.Tx, productID int64) ([]contourSlot, error) {
	rows, err := tx.QueryContext(ctx,
		"SELECT id, posicion, nombre, permite_extra FROM plato_slots WHERE producto_id = ? ORDER BY posicion",
		productID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	slots := []contourSlot{}
	for rows.Next() {
		var slot contourSlot
		var allows int
		if err := rows.Scan(&slot.id, &slot.position, &slot.name, &allows); err != nil {
			return nil, err
		}
		slot.allowsExtra = allows == 1
		slots = append(slots, slot)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for index := range slots {
		groupRows, err := tx.QueryContext(ctx, `
			SELECT g.id, g.nombre
			FROM plato_slot_grupos psg
			JOIN contorno_grupos g ON g.id = psg.grupo_id
			WHERE psg.slot_id = ?
			ORDER BY psg.rowid`, slots[index].id)
		if err != nil {
			return nil, err
		}
		for groupRows.Next() {
			var group contourGroup
			if err := groupRows.Scan(&group.id, &group.name); err != nil {
				groupRows.Close()
				return nil, err
			}
			slots[index].groups = append(slots[index].groups, group)
		}
		if err := groupRows.Close(); err != nil {
			return nil, err
		}
	}
	return slots, nil
}

func activeContourVariant(ctx context.Context, tx *sql.Tx, variantID int64) (contourVariant, error) {
	var variant contourVariant
	err := tx.QueryRowContext(ctx, `
		SELECT id, grupo_id, nombre, suplemento_centavos, extra_centavos
		FROM contorno_variantes
		WHERE id = ? AND activo = 1`, variantID).Scan(
		&variant.id,
		&variant.groupID,
		&variant.name,
		&variant.supplementPrice,
		&variant.extraPrice,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return contourVariant{}, &Error{"variante_inexistente", "Variante inexistente"}
	}
	return variant, err
}

func activeVariantsCount(ctx context.Context, tx *sql.Tx, groupID int64) (int, error) {
	var count int
	err := tx.QueryRowContext(ctx,
		"SELECT count(*) FROM contorno_variantes WHERE grupo_id = ? AND activo = 1",
		groupID,
	).Scan(&count)
	return count, err
}
