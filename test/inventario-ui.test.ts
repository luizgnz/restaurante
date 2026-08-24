import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Inventario, type MaterialInventarioUi } from "../ui/src/pantallas/Inventario.tsx";

const material: MaterialInventarioUi = {
  id: 1,
  nombre: "Harina",
  codigo: "MAT-001",
  enMano: 20,
  reservado: 3,
  disponible: 17,
  ultimaEntradaEn: null,
};

const acciones = {
  onRecargar: async () => undefined,
  onRegistrarEntrada: async () => undefined,
};

describe("pantalla de inventario", () => {
  it("permite consultar existencias a un usuario sin permiso de escritura", () => {
    const html = renderToStaticMarkup(
      createElement(Inventario, { materiales: [material], puedeIngresar: false, ...acciones }),
    );

    expect(html).toContain("Inventario");
    expect(html).toContain("Harina");
    expect(html).toContain("MAT-001");
    expect(html).toContain("Solo lectura");
    expect(html).not.toContain(">Ingresar<");
  });

  it("ofrece el ingreso de cantidades solo al administrador", () => {
    const html = renderToStaticMarkup(
      createElement(Inventario, { materiales: [material], puedeIngresar: true, ...acciones }),
    );

    expect(html).toContain(">Ingresar<");
    expect(html).toContain("Cada entrada exige el PIN de un administrador");
  });
});
