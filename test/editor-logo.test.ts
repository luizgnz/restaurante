import { describe, expect, it } from "vitest";
import {
  calcularRecorte,
  limitesDesplazamiento,
  validarArchivoLogo,
} from "../ui/src/pantallas/EditorLogo.tsx";

describe("editor de logo", () => {
  it("acepta PNG, JPEG y WebP de hasta 5 MB", () => {
    expect(validarArchivoLogo({ type: "image/png", size: 5 * 1024 * 1024 })).toBeNull();
    expect(validarArchivoLogo({ type: "image/jpeg", size: 12_000 })).toBeNull();
    expect(validarArchivoLogo({ type: "image/webp", size: 12_000 })).toBeNull();
  });

  it("rechaza SVG y archivos mayores a 5 MB con un mensaje comprensible", () => {
    expect(validarArchivoLogo({ type: "image/svg+xml", size: 1_000 })).toContain("PNG, JPEG o WebP");
    expect(validarArchivoLogo({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).toContain("5 MB");
  });

  it("calcula límites de arrastre sin dejar espacios dentro del recorte", () => {
    expect(limitesDesplazamiento(1600, 800, 320, 1)).toEqual({ x: 160, y: 0 });
    expect(limitesDesplazamiento(1600, 800, 320, 2)).toEqual({ x: 480, y: 160 });
  });

  it("traduce el encuadre visible a un recorte cuadrado dentro de la imagen", () => {
    expect(calcularRecorte(1600, 800, 320, 1, { x: 0, y: 0 })).toEqual({ x: 400, y: 0, lado: 800 });
    const recorte = calcularRecorte(1600, 800, 320, 2, { x: 480, y: 0 });
    expect(recorte).toEqual({ x: 0, y: 200, lado: 400 });
  });
});
