import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Inventario, type MaterialInventarioUi } from "../ui/src/pantallas/Inventario.tsx";

const material: MaterialInventarioUi = {
  id: 1,
  nombre: "Harina",
  codigo: "MAT-001",
  enMano: 20,
  reservado: 3,
  disponible: 17,
  ultimaEntradaEn: null,
};

const acciones = {
  onRecargar: async () => undefined,
  onRegistrarEntrada: async () => undefined,
  onRegistrarPerdida: async () => undefined,
};

describe("pantalla de inventario", () => {
  it("permite consultar existencias a un usuario sin permiso de escritura", () => {
    const html = renderToStaticMarkup(
      createElement(Inventario, { materiales: [material], puedeIngresar: false, ...acciones }),
    );

    expect(html).toContain("Inventario");
    expect(html).toContain("Harina");
    expect(html).toContain("MAT-001");
    expect(html).not.toContain("Solo lectura");
    expect(html).not.toContain(">Ingresar<");
    expect(html).not.toContain("Ajustar inventario de Harina");
  });

  it("ofrece el ajuste desde el material solo al administrador", () => {
    const html = renderToStaticMarkup(
      createElement(Inventario, { materiales: [material], puedeIngresar: true, ...acciones }),
    );

    expect(html).not.toContain(">Ingresar<");
    expect(html).toContain('aria-label="Ajustar inventario de Harina"');
    expect(html).toContain("Los ingresos y las pérdidas exigen autorización");
  });

  it("coloca búsqueda, totales y recarga en una sola franja", () => {
    const html = renderToStaticMarkup(
      createElement(Inventario, { materiales: [material], puedeIngresar: true, ...acciones }),
    );

    const herramientas = html.slice(html.indexOf('class="inventario-herramientas"'), html.indexOf('class="inventario-tabla"'));
    expect(herramientas).toContain("Buscar material o código");
    expect(herramientas).toContain('aria-label="Recargar inventario"');
    expect(herramientas).not.toContain('class="inventario-filtros"');
    expect(herramientas).toContain("Filtrar por estado del inventario");
    expect(herramientas).toContain("Reservado");
    expect(html).not.toContain(">Actualizar<");
    expect(html).not.toContain(">Ingresar<");
    expect(html).not.toContain("Acción");
    expect(html).toContain('aria-label="Ajustar inventario de Harina"');
  });
});
