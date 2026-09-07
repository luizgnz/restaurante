import { describe, expect, it } from "vitest";
import { armableDeProducto } from "../src/modules/productos/productos.ts";
import { asegurarProductosDemo, seedCartaDemo } from "../src/modules/productos/seed.ts";
import { listarContornos, slotsDeProducto, validarSelecciones } from "../src/modules/contornos/contornos.ts";
import { openTestDb } from "./helpers.ts";

describe("seed carta", () => {
  it("deja armable hamburguesa >= 5", () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    expect(armableDeProducto(db, ids.hamburguesa)).toBeGreaterThanOrEqual(5);
    const conFoto = db.prepare("SELECT count(*) AS c FROM productos WHERE disponible_en_pos = 1 AND foto_data IS NOT NULL").get() as { c: number };
    expect(conFoto.c).toBe(0); // sin pseudo-fotos: la carta demo dibuja el icono por categoría
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
      { slotPosicion: 3, varianteId: carbohidrato.variantes.find((item) => item.nombre === "Papas fritas")!.id },
      { slotPosicion: 3, varianteId: ensalada.variantes.find((item) => item.nombre === "Ensalada rusa")!.id },
    ]);
    expect(seleccionMenu).toHaveLength(4);
    expect(seleccionMenu.every((seleccion) => !seleccion.esExtra)).toBe(true);

    const tipoExtra = grupos.find((grupo) => grupo.nombre === "Tipo de extra")!;
    const extraPollo = validarSelecciones(db, ids.extra, [
      { slotPosicion: 1, varianteId: tipoExtra.variantes.find((item) => item.nombre === "Pollo")!.id },
    ]);
    expect(extraPollo[0]).toMatchObject({ slotNombre: "Tipo de extra", varianteNombre: "Pollo", precioCentavos: 1500 });
    db.close();
  });

  it("elimina solo la pseudo-foto legacy exacta y conserva un SVG legítimo", () => {
    const db = openTestDb();
    seedCartaDemo(db);
    const legacySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="20" fill="#6f4a8e"/><text x="64" y="78" text-anchor="middle" font-size="48" fill="#ffffff" font-family="sans-serif">+</text></svg>`;
    const fotoLegacy = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(legacySvg)}`;
    const svgLegitimo = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><circle cx="64" cy="64" r="48" fill="#6f4a8e"/></svg>')}`;
    db.prepare("UPDATE productos SET foto_data = ? WHERE nombre = 'Extra'").run(fotoLegacy);
    db.prepare("UPDATE productos SET foto_data = ? WHERE nombre = 'Hamburguesa'").run(svgLegitimo);

    asegurarProductosDemo(db);

    const extra = db.prepare("SELECT foto_data FROM productos WHERE nombre = 'Extra'").get() as { foto_data: string | null };
    const hamburguesa = db.prepare("SELECT foto_data FROM productos WHERE nombre = 'Hamburguesa'").get() as { foto_data: string | null };
    expect(extra.foto_data).toBeNull();
    expect(hamburguesa.foto_data).toBe(svgLegitimo);
    db.close();
  });
});
