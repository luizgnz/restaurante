import { describe, expect, it } from "vitest";
import { listarPlugins, mensajesVacios } from "../src/modules/complementos/complementos.ts";

describe("complementos", () => {
  it("v1 siempre vacío con las dos frases en orden", () => {
    expect(listarPlugins()).toEqual([]);
    expect(mensajesVacios()).toEqual(["No hay plugins para mostrar", "No hay plugins disponibles"]);
  });
});
