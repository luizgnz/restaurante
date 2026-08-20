import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Plano } from "../ui/src/pantallas/Plano.tsx";

describe("plano restaurante", () => {
  it("pinta el mapa de mesas con posición y estado, no una lista suelta", () => {
    const html = renderToStaticMarkup(
      createElement(Plano, {
        piso: "Salón",
        mesas: [
          {
            id: 1,
            numero: 7,
            estado: "libre",
            pedidoId: null,
            asientos: 4,
            pos_x: 48,
            pos_y: 40,
            forma: "round",
            ancho: 90,
            alto: 90,
          },
          {
            id: 2,
            numero: 1,
            estado: "ocupada",
            pedidoId: 9,
            asientos: 2,
            pos_x: 8,
            pos_y: 18,
            forma: "square",
            ancho: 88,
            alto: 88,
          },
        ],
        onMesa: () => undefined,
      }),
    );
    expect(html).toContain("plano-mapa");
    expect(html).toContain("Mesa 7");
    expect(html).toContain("Mesa 1");
    expect(html).toContain("Salón");
    expect(html).toContain("libre");
    expect(html).toContain("ocupada");
    expect(html).toContain("left:48%");
    expect(html).toContain("top:40%");
  });
});
