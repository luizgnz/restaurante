# Módulo restaurante (Odoo-like, recortado)

**Fecha:** 2026-08-22  
**Alcance:** menú POS → Crear producto, Editar mapa, Backend. No se clona Odoo completo (impuestos, variantes, cobro, eCommerce).

## Crear producto

Formulario tipo Odoo PdV (un producto, no wizard):

- Nombre
- Precio de venta (pesos enteros → centavos)
- Categoría POS
- Disponible en el PdV
- Tipo: no almacenable · almacenable · receta (un nivel)

Guardar → entra a la carta si está disponible en POS.

Fuera de v1 de esta pantalla: imagen, código de barras, impuestos, recetas anidadas, combos Odoo.

## Editar mapa

Mismo plano de Mesas, modo *Edit Plan*:

- Añadir / quitar mesa (no se borra si tiene pedido abierto)
- Arrastrar, asientos, redonda/cuadrada
- Pisos al centro; se puede crear piso
- Guardar / Descartar

## Backend

Back-office **nuestro** (no `:8069`). Inicio con atajos a productos, mapa y (después) empleados/config. Crear producto y editar mapa son las mismas pantallas.
