package bootstrap

import (
	"context"
	"database/sql"
	"fmt"
	"math"

	"github.com/luizgnz/restaurante/go/internal/auth"
)

// Ensure deja una base nueva operable sin ejecutar previamente el servidor
// Node. Nunca reemplaza datos existentes: cada bloque solo se crea si está vacío.
func Ensure(ctx context.Context, db *sql.DB) error {
	if err := ensureUsers(ctx, db); err != nil {
		return fmt.Errorf("usuarios iniciales: %w", err)
	}
	if err := ensureFloor(ctx, db); err != nil {
		return fmt.Errorf("salón inicial: %w", err)
	}
	if err := ensureCatalog(ctx, db); err != nil {
		return fmt.Errorf("carta inicial: %w", err)
	}
	if err := ensureContours(ctx, db); err != nil {
		return fmt.Errorf("contornos iniciales: %w", err)
	}
	if _, err := db.ExecContext(ctx, "UPDATE sesiones_usuario SET cerrada_en = COALESCE(cerrada_en, datetime('now')) WHERE cerrada_en IS NULL"); err != nil {
		return fmt.Errorf("cerrar sesiones anteriores: %w", err)
	}
	if _, err := db.ExecContext(ctx, "DELETE FROM sesiones_pos"); err != nil {
		return fmt.Errorf("cerrar sesión heredada: %w", err)
	}
	return nil
}

func ensureUsers(ctx context.Context, db *sql.DB) error {
	var count int
	if err := db.QueryRowContext(ctx, "SELECT count(*) FROM empleados").Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	adminUser, adminPIN, adminPassword := "admin", "2222", "admin"
	if _, err := auth.CreateUser(ctx, db, auth.UserInput{Nombre: "Jefa", Usuario: &adminUser, PIN: &adminPIN, Password: &adminPassword, Roles: []string{"administrador"}, Activo: true}); err != nil {
		return err
	}
	waiterUser, waiterPIN, waiterPassword := "ana", "1234", "ana"
	_, err := auth.CreateUser(ctx, db, auth.UserInput{Nombre: "Ana", Usuario: &waiterUser, PIN: &waiterPIN, Password: &waiterPassword, Roles: []string{"mesero"}, Activo: true})
	return err
}

func ensureFloor(ctx context.Context, db *sql.DB) error {
	var floorCount int
	if err := db.QueryRowContext(ctx, "SELECT count(*) FROM pisos").Scan(&floorCount); err != nil {
		return err
	}
	var floorID int64
	if floorCount == 0 {
		result, err := db.ExecContext(ctx, "INSERT INTO pisos (nombre, activo) VALUES ('Salón', 1)")
		if err != nil {
			return err
		}
		floorID, err = result.LastInsertId()
		if err != nil {
			return err
		}
	} else if err := db.QueryRowContext(ctx, "SELECT id FROM pisos WHERE COALESCE(activo,1)=1 ORDER BY id LIMIT 1").Scan(&floorID); err != nil {
		return err
	}
	var tableCount int
	if err := db.QueryRowContext(ctx, "SELECT count(*) FROM mesas").Scan(&tableCount); err != nil {
		return err
	}
	if tableCount > 0 {
		return nil
	}
	columns := 4
	rows := 3
	for number := 1; number <= 10; number++ {
		index := number - 1
		x := math.Round((4+float64(index%columns)*(90/float64(columns)))*10) / 10
		y := math.Round((4+float64(index/columns)*math.Min(26, 88/float64(rows)))*10) / 10
		seats := []int{2, 4, 4, 2, 6, 4, 4, 4, 2, 8}[index]
		if _, err := db.ExecContext(ctx, `INSERT INTO mesas (piso_id,numero,asientos,activa,pos_x,pos_y,forma,ancho,alto) VALUES (?,?,?,1,?,?,'square',96,96)`, floorID, number, seats, x, y); err != nil {
			return err
		}
	}
	return nil
}

func ensureCatalog(ctx context.Context, db *sql.DB) error {
	var count int
	if err := db.QueryRowContext(ctx, "SELECT count(*) FROM productos").Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	category := func(name string) (int64, error) {
		result, err := tx.ExecContext(ctx, "INSERT INTO categorias_pos (nombre,estacion) VALUES (?,'cocina')", name)
		if err != nil {
			return 0, err
		}
		return result.LastInsertId()
	}
	food, err := category("Comida")
	if err != nil {
		return err
	}
	drinks, err := category("Bebida")
	if err != nil {
		return err
	}
	desserts, err := category("Postres")
	if err != nil {
		return err
	}
	insert := func(name string, price, categoryID int64, kind string, pos, track bool, color string) (int64, error) {
		var category any = categoryID
		if categoryID == 0 {
			category = nil
		}
		result, err := tx.ExecContext(ctx, `INSERT INTO productos (nombre,precio_centavos,categoria_id,tipo_consumo,disponible_en_pos,activo,color,rastrear_inventario) VALUES (?,?,?,?,?,1,?,?)`, name, price, category, kind, boolInt(pos), color, boolInt(track))
		if err != nil {
			return 0, err
		}
		return result.LastInsertId()
	}
	pan, err := insert("Pan", 0, 0, "almacenable_unitario", false, true, "")
	if err != nil {
		return err
	}
	carne, err := insert("Carne g", 0, 0, "almacenable_unitario", false, true, "")
	if err != nil {
		return err
	}
	queso, err := insert("Queso", 0, 0, "almacenable_unitario", false, true, "")
	if err != nil {
		return err
	}
	lechuga, err := insert("Lechuga g", 0, 0, "almacenable_unitario", false, true, "")
	if err != nil {
		return err
	}
	for id, amount := range map[int64]float64{pan: 20, carne: 2000, queso: 20, lechuga: 400} {
		if _, err := tx.ExecContext(ctx, "INSERT INTO stock (producto_id,on_hand_real,reserved_real) VALUES (?,?,0)", id, amount); err != nil {
			return err
		}
	}
	hamburger, err := insert("Hamburguesa", 8900, food, "receta_kit", true, true, "#8b4513")
	if err != nil {
		return err
	}
	for id, amount := range map[int64]float64{pan: 1, carne: 150, queso: 1, lechuga: 20} {
		if _, err := tx.ExecContext(ctx, "INSERT INTO receta_lineas (producto_id,ingrediente_id,cantidad_real) VALUES (?,?,?)", hamburger, id, amount); err != nil {
			return err
		}
	}
	type item struct {
		name            string
		price, category int64
		color           string
		stock           *float64
	}
	stock10 := float64(10)
	items := []item{{"Jugo", 2500, drinks, "#e07a2f", &stock10}, {"Agua con gas", 1500, drinks, "#3d8ea8", &stock10}, {"Completo", 4500, food, "#c45c26", nil}, {"Empanada", 1800, food, "#d4a017", nil}, {"Papas fritas", 2500, food, "#e0a106", nil}, {"Ensalada César", 5200, food, "#3d7a3d", nil}, {"Pizza margarita", 8900, food, "#b33c3c", nil}, {"Sopa del día", 3200, food, "#b56b2a", nil}, {"Menú del día", 8900, food, "#9b5d32", nil}, {"Extra", 0, food, "#6f4a8e", nil}, {"Café", 1800, drinks, "#4a2c1a", nil}, {"Cerveza", 2800, drinks, "#c9a227", nil}, {"Flan", 2200, desserts, "#c48a3a", nil}, {"Chorrillana", 12400, food, "#a0522d", nil}, {"Pastel de choclo", 7900, food, "#c8a13a", nil}, {"Cazuela de vacuno", 7500, food, "#8f6b3d", nil}, {"Salmón a la plancha", 11900, food, "#c96f4a", nil}, {"Pollo asado", 8400, food, "#b5793a", nil}, {"Lomo a lo pobre", 10900, food, "#7a4a2b", nil}, {"Asado de tira", 11500, food, "#96442e", nil}, {"Barros Luco", 6200, food, "#a86a32", nil}, {"Sándwich de palta", 4900, food, "#4a7a3d", nil}, {"Ceviche de salmón", 7900, food, "#d07a3f", nil}, {"Gaseosa", 1900, drinks, "#8a3d2e", nil}, {"Pisco sour", 5500, drinks, "#c9b267", nil}, {"Vino tinto", 4500, drinks, "#6b1f2a", nil}, {"Limonada", 2800, drinks, "#b8c94a", nil}, {"Té", 1400, drinks, "#7a5230", nil}, {"Kuchen de manzana", 3500, desserts, "#b5793f", nil}, {"Tiramisú", 4200, desserts, "#6b4a33", nil}, {"Helado", 2800, desserts, "#d9a3b3", nil}}
	for _, value := range items {
		kind := "no_almacenable"
		track := false
		if value.stock != nil {
			kind = "almacenable_unitario"
			track = true
		}
		id, err := insert(value.name, value.price, value.category, kind, true, track, value.color)
		if err != nil {
			return err
		}
		if value.stock != nil {
			if _, err := tx.ExecContext(ctx, "INSERT INTO stock (producto_id,on_hand_real,reserved_real) VALUES (?,?,0)", id, *value.stock); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func ensureContours(ctx context.Context, db *sql.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	group := func(name string) (int64, error) {
		var id int64
		err := tx.QueryRowContext(ctx, "SELECT id FROM contorno_grupos WHERE lower(nombre) = lower(?)", name).Scan(&id)
		if err == nil {
			return id, nil
		}
		if err != sql.ErrNoRows {
			return 0, err
		}
		result, err := tx.ExecContext(ctx, "INSERT INTO contorno_grupos (nombre) VALUES (?)", name)
		if err != nil {
			return 0, err
		}
		return result.LastInsertId()
	}
	variant := func(groupID int64, name string, surcharge, extra int64) error {
		var id int64
		err := tx.QueryRowContext(ctx, "SELECT id FROM contorno_variantes WHERE grupo_id = ? AND lower(nombre) = lower(?)", groupID, name).Scan(&id)
		if err == nil {
			return nil
		}
		if err != sql.ErrNoRows {
			return err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO contorno_variantes
			(grupo_id,nombre,suplemento_centavos,extra_centavos,activo) VALUES (?,?,?,?,1)`, groupID, name, surcharge, extra)
		return err
	}
	type slot struct {
		position   int
		name       string
		allowExtra bool
		groupIDs   []int64
	}
	configure := func(productName string, slots []slot) error {
		var productID int64
		if err := tx.QueryRowContext(ctx, "SELECT id FROM productos WHERE lower(nombre) = lower(?)", productName).Scan(&productID); err == sql.ErrNoRows {
			return nil
		} else if err != nil {
			return err
		}
		var count int
		if err := tx.QueryRowContext(ctx, "SELECT count(*) FROM plato_slots WHERE producto_id = ?", productID).Scan(&count); err != nil {
			return err
		}
		if count > 0 {
			return nil
		}
		for _, value := range slots {
			result, err := tx.ExecContext(ctx, `INSERT INTO plato_slots
				(producto_id,posicion,nombre,permite_extra) VALUES (?,?,?,?)`, productID, value.position, value.name, boolInt(value.allowExtra))
			if err != nil {
				return err
			}
			slotID, err := result.LastInsertId()
			if err != nil {
				return err
			}
			for _, groupID := range value.groupIDs {
				if _, err := tx.ExecContext(ctx, "INSERT INTO plato_slot_grupos (slot_id,grupo_id) VALUES (?,?)", slotID, groupID); err != nil {
					return err
				}
			}
		}
		return nil
	}

	protein, err := group("Proteína")
	if err != nil {
		return err
	}
	carbohydrate, err := group("Carbohidrato")
	if err != nil {
		return err
	}
	salad, err := group("Ensalada")
	if err != nil {
		return err
	}
	extraType, err := group("Tipo de extra")
	if err != nil {
		return err
	}
	variants := []struct {
		groupID          int64
		name             string
		surcharge, extra int64
	}{
		{protein, "Pollo", 0, 1500}, {protein, "Carne", 500, 2000}, {protein, "Longaniza", 300, 1800},
		{carbohydrate, "Papas fritas", 0, 1000}, {carbohydrate, "Arroz", 0, 800}, {carbohydrate, "Puré", 0, 800},
		{salad, "Ensalada rusa", 0, 700}, {salad, "Ensalada rallada", 0, 700},
		{extraType, "Pollo", 1500, 0}, {extraType, "Carne", 2000, 0}, {extraType, "Longaniza", 1800, 0},
	}
	for _, value := range variants {
		if err := variant(value.groupID, value.name, value.surcharge, value.extra); err != nil {
			return err
		}
	}
	if err := configure("Menú del día", []slot{
		{1, "Proteína", true, []int64{protein}},
		{2, "Contorno", false, []int64{carbohydrate}},
		{3, "Segundo contorno", true, []int64{carbohydrate, salad}},
	}); err != nil {
		return err
	}
	if err := configure("Extra", []slot{{1, "Tipo de extra", false, []int64{extraType}}}); err != nil {
		return err
	}
	return tx.Commit()
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
