import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Categorias } from "../ui/src/pantallas/Categorias.tsx";

describe("pantalla de categorías", () => {
  it("lista las categorías y ofrece crear una nueva", () => {
    const html = renderToStaticMarkup(
      createElement(Categorias, {
        categorias: [
          { id: 1, nombre: "Comida" },
          { id: 2, nombre: "Bebida" },
        ],
        onCrear: async () => undefined,
        onVolver: () => undefined,
      }),
    );

    expect(html).toContain("Categorías");
    expect(html).toContain("Comida");
    expect(html).toContain("Bebida");
    expect(html).toContain("Nueva categoría");
    expect(html).toContain("Crear");
    expect(html).toContain("Volver");
  });

  it("sin categorías lo dice", () => {
    const html = renderToStaticMarkup(
      createElement(Categorias, { categorias: [], onCrear: async () => undefined, onVolver: () => undefined }),
    );
    expect(html).toContain("No hay categorías");
  });
});
