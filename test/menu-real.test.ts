import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openTestDb } from "./helpers.ts";

describe("catálogo real del restaurante", () => {
  it("migra el menú completo con bebidas, fotos, recetas y stock de demostración", () => {
    const db = openTestDb();
    const activos = db.prepare(`SELECT p.id,p.nombre,p.foto_data,c.nombre AS categoria,p.tipo_consumo
      FROM productos p JOIN categorias_pos c ON c.id=p.categoria_id
      WHERE p.activo=1 AND p.disponible_en_pos=1 AND p.codigo LIKE 'menu-real:%'`).all() as Array<{
      id: number; nombre: string; foto_data: string; categoria: string; tipo_consumo: string;
    }>;
    expect(activos).toHaveLength(81);
    expect(activos.filter((p) => p.categoria === "Bebidas")).toHaveLength(28);
    expect(activos.every((p) => p.foto_data.startsWith("/productos/menu-real/"))).toBe(true);

    const faltanRecetas = db.prepare(`SELECT p.nombre FROM productos p
      WHERE p.codigo LIKE 'menu-real:%' AND p.tipo_consumo='receta_kit'
      AND NOT EXISTS (SELECT 1 FROM receta_lineas rl WHERE rl.producto_id=p.id)`).all();
    expect(faltanRecetas).toEqual([]);

    const sinBase = db.prepare(`SELECT p.nombre FROM productos p
      WHERE p.activo=1 AND p.rastrear_inventario=1
      AND p.tipo_consumo='almacenable_unitario'
      AND NOT EXISTS (SELECT 1 FROM demo_stock_base d WHERE d.producto_id=p.id)`).all();
    expect(sinBase).toEqual([]);

    const raizPublica = path.resolve("ui/public");
    for (const producto of activos) {
      expect(existsSync(path.join(raizPublica, producto.foto_data))).toBe(true);
    }
    const manifest = JSON.parse(readFileSync(path.join(raizPublica, "productos/menu-real/manifest.json"), "utf8")) as unknown[];
    expect(manifest.length).toBeGreaterThanOrEqual(20);

    const tilapia = db.prepare("SELECT precio_centavos FROM productos WHERE nombre='Tilapia frita' AND activo=1").get() as { precio_centavos: number };
    expect(tilapia.precio_centavos).toBe(9500);
    db.close();
  });
});
