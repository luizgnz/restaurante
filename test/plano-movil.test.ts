import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditarMapa } from "../ui/src/pantallas/EditarMapa.tsx";
import { Plano, type Mesa, type Piso } from "../ui/src/pantallas/Plano.tsx";

const mesa: Mesa = {
  id: 1,
  numero: 7,
  estado: "libre",
  cuentaId: null,
  asientos: 4,
  pos_x: 48,
  pos_y: 40,
  forma: "round",
  ancho: 90,
  alto: 90,
};
const piso: Piso = { id: 1, nombre: "Salón" };

describe("contrato responsive del plano", () => {
  it("el salón operativo lleva el modificador móvil en contenedor y mesas", () => {
    const html = renderToStaticMarkup(
      createElement(Plano, { piso: "Salón", mesas: [mesa], onMesa: () => undefined }),
    );
    expect(html).toContain("plano-mapa--operativo");
    expect(html).toContain("mesa-odoo--operativa");
  });

  it("el editor de mapa no lleva el modificador: conserva coordenadas absolutas", () => {
    const html = renderToStaticMarkup(
      createElement(EditarMapa, {
        pisos: [piso],
        mesas: [mesa],
        onGuardar: () => undefined,
        onDescartar: () => undefined,
      }),
    );
    expect(html).toContain("plano-mapa");
    expect(html).not.toContain("plano-mapa--operativo");
    expect(html).not.toContain("mesa-odoo--operativa");
    expect(html).toContain("left:48%");
  });
});
