import { describe, expect, it } from "vitest";
import { armableDeProducto } from "../src/modules/productos/productos.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { listarContornos, slotsDeProducto, validarSelecciones } from "../src/modules/contornos/contornos.ts";
import { openTestDb } from "./helpers.ts";

describe("seed carta", () => {
  it("deja armable hamburguesa >= 5", () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    expect(armableDeProducto(db, ids.hamburguesa)).toBeGreaterThanOrEqual(5);
    const conFoto = db.prepare("SELECT count(*) AS c FROM productos WHERE disponible_en_pos = 1 AND foto_data IS NOT NULL").get() as { c: number };
    expect(conFoto.c).toBeGreaterThanOrEqual(10);
    db.close();
  });

  it("deja el menú del día y el producto Extra configurados y pedibles", () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    const grupos = listarContornos(db).grupos;
    const menuSlots = slotsDeProducto(db, ids.menuDia);
    expect(menuSlots.map((slot) => slot.nombre)).toEqual(["Proteína", "Contorno", "Segundo contorno"]);

    const proteina = grupos.find((grupo) => grupo.nombre === "Proteína")!;
    const carbohidrato = grupos.find((grupo) => grupo.nombre === "Carbohidrato")!;
    const ensalada = grupos.find((grupo) => grupo.nombre === "Ensalada")!;
    const seleccionMenu = validarSelecciones(db, ids.menuDia, [
      { slotPosicion: 1, varianteId: proteina.variantes.find((item) => item.nombre === "Pollo")!.id },
      { slotPosicion: 2, varianteId: carbohidrato.variantes.find((item) => item.nombre === "Arroz")!.id },
      { slotPosicion: 3, varianteId: ensalada.variantes.find((item) => item.nombre === "Ensalada rusa")!.id },
    ]);
    expect(seleccionMenu).toHaveLength(3);

    const tipoExtra = grupos.find((grupo) => grupo.nombre === "Tipo de extra")!;
    const extraPollo = validarSelecciones(db, ids.extra, [
      { slotPosicion: 1, varianteId: tipoExtra.variantes.find((item) => item.nombre === "Pollo")!.id },
    ]);
    expect(extraPollo[0]).toMatchObject({ slotNombre: "Tipo de extra", varianteNombre: "Pollo", precioCentavos: 1500 });
    db.close();
  });
});
