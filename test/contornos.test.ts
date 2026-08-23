import { describe, expect, it } from "vitest";
import {
  ContornoError,
  configurarSlots,
  crearGrupo,
  crearVariante,
  listarContornos,
  slotsDeProducto,
  validarSelecciones,
} from "../src/modules/contornos/contornos.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { openTestDb } from "./helpers.ts";

function escenario() {
  const db = openTestDb();
  const ids = seedCartaDemo(db);
  const proteina = crearGrupo(db, { nombre: "Proteína" });
  const carbohidrato = crearGrupo(db, { nombre: "Carbohidrato" });
  const ensalada = crearGrupo(db, { nombre: "Ensalada" });
  const pollo = crearVariante(db, { grupoId: proteina.id, nombre: "Pollo", suplementoCentavos: 0, extraCentavos: 1500 });
  const carne = crearVariante(db, { grupoId: proteina.id, nombre: "Carne", suplementoCentavos: 500, extraCentavos: 2000 });
  const papas = crearVariante(db, { grupoId: carbohidrato.id, nombre: "Papas fritas" });
  const arroz = crearVariante(db, { grupoId: carbohidrato.id, nombre: "Arroz" });
  const rusa = crearVariante(db, { grupoId: ensalada.id, nombre: "Ensalada rusa" });
  configurarSlots(db, ids.hamburguesa, [
    { posicion: 1, nombre: "Proteína", permiteExtra: true, grupoIds: [proteina.id] },
    { posicion: 2, nombre: "Contorno", grupoIds: [carbohidrato.id] },
    { posicion: 3, nombre: "Segundo contorno", permiteExtra: true, grupoIds: [carbohidrato.id, ensalada.id] },
  ]);
  return { db, ids, proteina, carbohidrato, ensalada, pollo, carne, papas, arroz, rusa };
}

function codigoDe(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof ContornoError ? e.codigo : "?";
  }
  return "";
}

describe("contornos: configuración", () => {
  it("crea grupos y variantes y los lista agrupados", () => {
    const e = escenario();
    const listado = listarContornos(e.db);
    const proteina = listado.grupos.find((g) => g.nombre === "Proteína");
    expect(proteina).toBeTruthy();
    expect(proteina!.variantes.map((v) => v.nombre).sort()).toEqual(["Carne", "Pollo"]);
    const pollo = proteina!.variantes.find((v) => v.nombre === "Pollo")!;
    expect(pollo.suplementoCentavos).toBe(0);
    expect(pollo.extraCentavos).toBe(1500);
    e.db.close();
  });

  it("rechaza grupos y variantes duplicadas sin distinguir mayúsculas", () => {
    const e = escenario();
    expect(() => crearGrupo(e.db, { nombre: "proteína" })).toThrow(ContornoError);
    expect(() => crearVariante(e.db, { grupoId: e.proteina.id, nombre: "pollo" })).toThrow(ContornoError);
    e.db.close();
  });

  it("expone los slots del plato con sus grupos permitidos", () => {
    const e = escenario();
    const slots = slotsDeProducto(e.db, e.ids.hamburguesa);
    expect(slots.map((s) => s.posicion)).toEqual([1, 2, 3]);
    const segundo = slots.find((s) => s.posicion === 3)!;
    expect(segundo.permiteExtra).toBe(true);
    expect(segundo.grupos.map((g) => g.nombre).sort()).toEqual(["Carbohidrato", "Ensalada"]);
    e.db.close();
  });

  it("un plato sin slots no tiene contornos", () => {
    const e = escenario();
    expect(slotsDeProducto(e.db, e.ids.jugo)).toEqual([]);
    e.db.close();
  });
});

describe("contornos: validación de selecciones", () => {
  it("acepta una selección completa y cobra suplemento y extra", () => {
    const e = escenario();
    const ok = validarSelecciones(e.db, e.ids.hamburguesa, [
      { slotPosicion: 1, varianteId: e.carne.id },
      { slotPosicion: 2, varianteId: e.papas.id },
      { slotPosicion: 3, varianteId: e.rusa.id },
      { slotPosicion: 1, varianteId: e.pollo.id },
    ]);
    expect(ok).toHaveLength(4);
    const proteina = ok.find((s) => s.slotPosicion === 1 && !s.esExtra)!;
    expect(proteina.precioCentavos).toBe(500);
    const extra = ok.find((s) => s.slotPosicion === 1 && s.esExtra)!;
    expect(extra.varianteNombre).toBe("Pollo");
    expect(extra.precioCentavos).toBe(1500);
    e.db.close();
  });

  it("rechaza selecciones incompletas", () => {
    const e = escenario();
    expect(codigoDe(() => validarSelecciones(e.db, e.ids.hamburguesa, [{ slotPosicion: 1, varianteId: e.pollo.id }]))).toBe(
      "contornos_incompletos",
    );
    e.db.close();
  });

  it("rechaza una variante de un grupo no permitido en el slot", () => {
    const e = escenario();
    expect(
      codigoDe(() =>
        validarSelecciones(e.db, e.ids.hamburguesa, [
          { slotPosicion: 1, varianteId: e.papas.id },
          { slotPosicion: 2, varianteId: e.arroz.id },
          { slotPosicion: 3, varianteId: e.rusa.id },
        ]),
      ),
    ).toBe("variante_no_permitida");
    e.db.close();
  });

  it("rechaza un extra en un slot que no lo permite", () => {
    const e = escenario();
    expect(
      codigoDe(() =>
        validarSelecciones(e.db, e.ids.hamburguesa, [
          { slotPosicion: 1, varianteId: e.pollo.id },
          { slotPosicion: 2, varianteId: e.papas.id },
          { slotPosicion: 2, varianteId: e.arroz.id },
          { slotPosicion: 3, varianteId: e.rusa.id },
        ]),
      ),
    ).toBe("extra_no_permitido");
    e.db.close();
  });

  it("rechaza una variante inexistente", () => {
    const e = escenario();
    expect(
      codigoDe(() =>
        validarSelecciones(e.db, e.ids.hamburguesa, [
          { slotPosicion: 1, varianteId: 9999 },
          { slotPosicion: 2, varianteId: e.papas.id },
          { slotPosicion: 3, varianteId: e.rusa.id },
        ]),
      ),
    ).toBe("variante_inexistente");
    e.db.close();
  });
});
