import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModalCrearProducto } from "../ui/src/pantallas/ModalCrearProducto.tsx";

const categorias = [{ id: 1, nombre: "Principales" }];

function render(props: Partial<Parameters<typeof ModalCrearProducto>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(ModalCrearProducto, {
      abierto: true,
      categorias,
      onGuardar: () => undefined,
      onCerrar: () => undefined,
      ...props,
    }),
  );
}

describe("modal crear producto", () => {
  it("abierto muestra un diálogo modal con título y el formulario completo", () => {
    const html = render();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Crear producto");
    expect(html).toContain("Precio de venta");
    expect(html).toContain("Categoría del menú");
    expect(html).toContain("Código de producto");
    expect(html).toContain("Color del ítem");
    expect(html).toContain("Foto");
    expect(html).toContain("Guardar");
    expect(html).toContain("Descartar");
  });

  it("cerrado no renderiza nada: la vista de fondo no cambia", () => {
    expect(render({ abierto: false })).toBe("");
  });

  it("muestra el error dentro del diálogo", () => {
    const html = render({ error: "El nombre es obligatorio" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("El nombre es obligatorio");
  });

  it("el diálogo no incluye navegación ni rutas de pantalla completa", () => {
    const html = render();
    expect(html).not.toContain("Backend");
    expect(html).not.toContain("Editar mapa");
    expect(html).not.toContain("<h1");
  });
});
