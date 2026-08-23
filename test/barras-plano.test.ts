import { describe, expect, it } from "vitest";
import { pedidosAtrasados, ultimosPedidos } from "../src/modules/salon/barras.ts";
import { nivelEspera } from "../src/modules/tiempo.ts";

const p = (id: number, espera_min: number) => ({ id, espera_min, abierto_en: `2026-08-20T12:${String(10 - id).padStart(2, "0")}:00Z` });

describe("barras del plano", () => {
  it("últimos 5 por apertura más reciente", () => {
    const lista = [p(1, 6), p(2, 5), p(3, 4), p(4, 3), p(5, 2), p(6, 1)];
    expect(ultimosPedidos(lista, 5).map((x) => x.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("atrasados: los de más espera primero, máximo 5", () => {
    const lista = [p(1, 2), p(2, 40), p(3, 12), p(4, 3), p(5, 25), p(6, 8)];
    expect(pedidosAtrasados(lista, 5).map((x) => x.id)).toEqual([2, 5, 3, 6, 4]);
  });

  it("colorea espera: ok / medio / alto / critico", () => {
    expect(nivelEspera(3)).toBe("ok");
    expect(nivelEspera(10)).toBe("medio");
    expect(nivelEspera(18)).toBe("alto");
    expect(nivelEspera(30)).toBe("critico");
  });
});
