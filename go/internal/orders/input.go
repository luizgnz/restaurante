package orders

import (
	"errors"
	"math"
	"strings"
)

type Error struct{ Code, Message string }

func (err *Error) Error() string { return err.Message }

type Contour struct {
	SlotPosition int64 `json:"slotPosicion"`
	VariantID    int64 `json:"varianteId"`
}
type Line struct {
	ProductID int64     `json:"productoId"`
	Quantity  float64   `json:"cantidad"`
	Note      *string   `json:"nota"`
	Contours  []Contour `json:"contornos"`
}
type NewInput struct {
	TableID      int64   `json:"mesaId"`
	ServiceType  string  `json:"tipoServicio"`
	CustomerName *string `json:"clienteNombre"`
	Key          string  `json:"claveIdempotencia"`
	Lines        []Line  `json:"lineas"`
	Instructions *string `json:"indicaciones"`
	PIN          *string `json:"pin"`
}

func Validate(input NewInput) error {
	if strings.TrimSpace(input.Key) == "" {
		return &Error{"clave_idempotencia_requerida", "Hace falta una clave de idempotencia"}
	}
	if len(input.Key) > 500 || input.Instructions != nil && len(*input.Instructions) > 500 {
		return &Error{"texto_largo", "Ese texto supera 500 caracteres"}
	}
	if len(input.Lines) == 0 {
		return &Error{"orden_sin_productos", "La orden no tiene productos"}
	}
	if input.ServiceType == "" {
		input.ServiceType = "mesa"
	}
	if input.ServiceType != "mesa" && input.ServiceType != "para_llevar" {
		return &Error{"tipo_servicio_invalido", "Tipo de servicio inválido"}
	}
	if input.ServiceType == "mesa" && input.TableID < 1 {
		return &Error{"mesa_inexistente", "Hace falta una mesa válida"}
	}
	if input.CustomerName != nil && len(strings.TrimSpace(*input.CustomerName)) > 80 {
		return &Error{"cliente_nombre_largo", "El nombre del cliente supera 80 caracteres"}
	}
	for _, line := range input.Lines {
		if line.ProductID < 1 {
			return &Error{"producto_invalido", "Producto inválido"}
		}
		if line.Quantity <= 0 || math.IsNaN(line.Quantity) || math.IsInf(line.Quantity, 0) {
			return &Error{"cantidad_invalida", "Cantidad inválida"}
		}
		if line.Note != nil && len(*line.Note) > 500 {
			return &Error{"texto_largo", "Ese texto supera 500 caracteres"}
		}
		for _, contour := range line.Contours {
			if contour.SlotPosition < 1 || contour.VariantID < 1 {
				return errors.New("contorno inválido")
			}
		}
	}
	return nil
}
