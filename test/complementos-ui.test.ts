import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Complementos } from "../ui/src/pantallas/Complementos.tsx";
import { mensajesVacios } from "../src/modules/complementos/complementos.ts";

describe("complementos UI", () => {
  it("muestra las dos frases en orden", () => {
    const html = renderToStaticMarkup(createElement(Complementos, { mensajes: [...mensajesVacios()] }));
    const a = html.indexOf("No hay plugins para mostrar");
    const b = html.indexOf("No hay plugins disponibles");
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThan(a);
  });
});
