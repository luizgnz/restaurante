import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModalArmadoPlato } from "../ui/src/pantallas/ModalArmadoPlato.tsx";
import { ConstructorOrden } from "../ui/src/pantallas/ConstructorOrden.tsx";

describe("armado de platos", () => {
  it("muestra los slots, variantes, suplementos y extras", () => {
    const html = renderToStaticMarkup(
      createElement(ModalArmadoPlato, {
        productoNombre: "Menú del día",
        slots: [
          { posicion: 1, nombre: "Proteína", permiteExtra: true, grupos: [{ id: 1, nombre: "Proteína" }] },
          {
            posicion: 2,
            nombre: "Segundo contorno",
            permiteExtra: false,
            grupos: [{ id: 2, nombre: "Carbohidrato" }, { id: 3, nombre: "Ensalada" }],
          },
        ],
        variantes: [
          { id: 10, grupoId: 1, nombre: "Pollo", suplementoCentavos: 500, extraCentavos: 1500 },
          { id: 11, grupoId: 2, nombre: "Arroz", suplementoCentavos: 0, extraCentavos: 500 },
          { id: 12, grupoId: 3, nombre: "Ensalada rusa", suplementoCentavos: 0, extraCentavos: 500 },
        ],
        onConfirmar: () => undefined,
        onCancelar: () => undefined,
      }),
    );
    expect(html).toContain("Armado de Menú del día");
    expect(html).toContain("Proteína");
    expect(html).toContain("Segundo contorno");
    expect(html).toContain("Carbohidrato");
    expect(html).toContain("Ensalada rusa");
    expect(html).toContain("+ Extra Pollo");
    expect(html).toContain("disabled");
  });

  it("resume la selección guardada en el constructor", () => {
    const html = renderToStaticMarkup(
      createElement(ConstructorOrden, {
        mesaFija: { id: 7, numero: 7 },
        productos: [{ id: 1, nombre: "Menú del día", precio_centavos: 8900, armable: 0, configurable: true }],
        borrador: {
          version: 1,
          claveIdempotencia: "ui-contornos",
          lineas: [{
            productoId: 1,
            cantidad: 1,
            nota: "",
            contornos: [{ slotPosicion: 1, varianteId: 10 }],
            contornosTexto: "Pollo · Arroz · Ensalada rusa",
          }],
          indicaciones: "",
          actualizadoEn: new Date(0).toISOString(),
        },
        onCambiar: () => undefined,
        onEnviar: async () => undefined,
        onCancelar: () => undefined,
      }),
    );
    expect(html).toContain("1 × Menú del día");
    expect(html).toContain("Pollo · Arroz · Ensalada rusa");
  });
});
