import { describe, expect, it } from "vitest";
import { armableDeProducto } from "../src/modules/productos/productos.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
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
});
