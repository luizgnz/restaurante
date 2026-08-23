import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Contornos } from "../ui/src/pantallas/Contornos.tsx";

describe("administración de contornos", () => {
  it("lista grupos y permite crear variantes y configurar platos", () => {
    const html = renderToStaticMarkup(
      createElement(Contornos, {
        grupos: [{
          id: 1,
          nombre: "Proteína",
          variantes: [{ id: 2, grupoId: 1, nombre: "Pollo", suplementoCentavos: 0, extraCentavos: 1500 }],
        }],
        productos: [{ id: 3, nombre: "Menú del día", precio_centavos: 8900, armable: 0, configurable: true }],
        onCrearGrupo: async () => undefined,
        onCrearVariante: async () => undefined,
        onCargarSlots: async () => [],
        onGuardarSlots: async () => undefined,
        onVolver: () => undefined,
      }),
    );
    expect(html).toContain("Contornos");
    expect(html).toContain("Proteína");
    expect(html).toContain("Pollo");
    expect(html).toContain("Crear grupo");
    expect(html).toContain("Crear variante");
    expect(html).toContain("Slots por plato");
    expect(html).toContain("Menú del día");
    expect(html).toContain("Volver");
  });
});
