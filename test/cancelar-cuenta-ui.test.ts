import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfirmarCancelarCuenta } from "../ui/src/pantallas/ConfirmarCancelarCuenta.tsx";

describe("diálogo de cancelar cuenta", () => {
  it("muestra el total vigente con formato de moneda es-CL", () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmarCancelarCuenta, {
        mesaNumero: 4,
        totalCentavos: 8900,
        onConfirmar: () => undefined,
        onCancelar: () => undefined,
      }),
    );

    expect(html).toContain("Mesa #4");
    expect(html).toContain("$8.900");
    expect(html).not.toContain("$8900");
    expect(html).toContain("Motivo de la cancelación");
    expect(html).toContain("Solo un administrador");
    expect(html).toContain("Cancelar cuenta");
  });
});
