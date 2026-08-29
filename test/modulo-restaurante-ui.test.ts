import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CrearProducto } from "../ui/src/pantallas/CrearProducto.tsx";
import { Backend } from "../ui/src/pantallas/Backend.tsx";
import { EditarMapa } from "../ui/src/pantallas/EditarMapa.tsx";

describe("pantallas módulo restaurante", () => {
  it("formulario de producto tipo PdV", () => {
    const html = renderToStaticMarkup(
      createElement(CrearProducto, {
        categorias: [{ id: 1, nombre: "Principales" }],
        error: "",
        onGuardar: () => undefined,
        onCancelar: () => undefined,
      }),
    );
    expect(html).not.toContain("Nuevo producto");
    expect(html).not.toContain("<h1");
    expect(html).toContain("Precio de venta");
    // Todo producto queda asociado a una categoría.
    expect(html).not.toContain("Sin categoría");
    expect(html).toContain("Categoría del menú");
    expect(html).toContain("Disponible en la carta");
    expect(html).toContain("Rastrear en el inventario");
    expect(html).toContain("Código de producto");
    expect(html).toContain("Color del ítem");
    expect(html).toContain("Foto");
    expect(html).toContain("checked");
    expect(html).toContain("Guardar");
  });

  it("editar mapa muestra los dos grupos y desactiva el de mesa sin selección", () => {
    const html = renderToStaticMarkup(
      createElement(EditarMapa, {
        pisos: [{ id: 1, nombre: "Salón" }],
        mesas: [
          {
            id: 1,
            numero: 7,
            estado: "libre",
            cuentaId: null,
            asientos: 4,
            pos_x: 10,
            pos_y: 10,
            forma: "round",
            ancho: 90,
            alto: 90,
            piso_id: 1,
          },
        ],
        onGuardar: () => undefined,
        onDescartar: () => undefined,
      }),
    );
    expect(html).toContain("Guardar");
    expect(html).toContain("Opciones de piso");
    expect(html).toContain("Opciones de mesa");
    expect(html).toContain('title="Nueva mesa"');
    expect(html).toContain('title="Nuevo piso"');
    expect(html).toContain('title="Ordenar mesas en cuadrícula"');
    expect(html).toContain('title="Duplicar piso"');
    expect(html).toContain('title="Eliminar piso"');
    expect(html).toContain('title="Duplicar mesa"');
    expect(html).toContain('title="Eliminar mesa"');
    expect(html).not.toContain('title="Forma redonda"');
    expect(html).not.toContain('title="Forma cuadrada"');
    expect(html).toContain('title="Nombre del piso"');
    expect(html).toContain('title="Clientes"');
    expect(html).toContain('title="Color de la mesa"');
    expect(html).toContain("editor-campo__nombre");
    expect(html).toContain("editor-campo__clientes");
    expect(html).toContain("editor-campo__color");
    expect(html).not.toContain('role="alert"');
    const grupoMesa = html.slice(html.indexOf("Opciones de mesa") - 200, html.indexOf("Opciones de mesa"));
    expect(grupoMesa).toContain("disabled");
  });

  it("backend ofrece los atajos del módulo restaurante", () => {
    const html = renderToStaticMarkup(
      createElement(Backend, {
        onCrearProducto: () => undefined,
        onCategorias: () => undefined,
        onContornos: () => undefined,
        onRecetas: () => undefined,
        onEditarMapa: () => undefined,
        onMesas: () => undefined,
      }),
    );
    expect(html).toContain("Crear producto");
    expect(html).toContain("Categorías");
    expect(html).toContain("Contornos");
    expect(html).toContain("Editar mapa");
    expect(html).toContain("Administración");
    expect(html).toContain("Editar recetas");
  });
});
