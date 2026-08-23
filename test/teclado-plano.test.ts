import { describe, expect, it } from "vitest";
import { interpretarTecla } from "../src/modules/salon/teclado.ts";

describe("teclado del plano", () => {
  it("no intercepta si hay un campo de texto activo (salvo el buscador #)", () => {
    expect(interpretarTecla({ key: "n", buffer: "", buscando: false, inputActivo: true })).toEqual({ tipo: "nada" });
  });

  it("atajos: n nueva orden, o órdenes, m mesas, # buscar mesa", () => {
    expect(interpretarTecla({ key: "n", buffer: "", buscando: false, inputActivo: false })).toEqual({
      tipo: "nueva_orden",
    });
    expect(interpretarTecla({ key: "o", buffer: "", buscando: false, inputActivo: false }).tipo).toBe("ordenes");
    expect(interpretarTecla({ key: "m", buffer: "", buscando: false, inputActivo: false }).tipo).toBe("mesas");
    expect(interpretarTecla({ key: "k", buffer: "", buscando: false, inputActivo: false }).tipo).toBe("nada");
    expect(interpretarTecla({ key: "#", buffer: "", buscando: false, inputActivo: false }).tipo).toBe("buscar_mesa");
  });

  it("dígitos acumulan número de mesa y Enter la abre", () => {
    const uno = interpretarTecla({ key: "7", buffer: "", buscando: false, inputActivo: false });
    expect(uno).toEqual({ tipo: "digito", buffer: "7" });
    expect(interpretarTecla({ key: "Enter", buffer: "7", buscando: true, inputActivo: true })).toEqual({
      tipo: "abrir_mesa",
      numero: 7,
      buffer: "",
    });
  });

  it("Escape limpia el buscador", () => {
    expect(interpretarTecla({ key: "Escape", buffer: "12", buscando: true, inputActivo: true })).toEqual({
      tipo: "cancelar",
      buffer: "",
    });
  });
});
