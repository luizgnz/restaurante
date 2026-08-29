import { describe, expect, it } from "vitest";
import {
  renderAnulacion,
  renderComanda,
  renderCorreccion,
  renderPrecuenta,
  textoCorreccion,
  textoPrecuenta,
} from "../src/print/escpos.ts";

describe("escpos", () => {
  it("comanda incluye mesa y mesero", () => {
    const bytes = renderComanda({
      mesaNumero: 7,
      mesero: "Ana",
      lineas: [{ nombre: "Hamburguesa", cantidad: 5, nota: "sin cebolla" }],
      indicaciones: "servir junto",
    });
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("Mesa 7");
    expect(text).toContain("Ana");
    expect(text).toContain("Hamburguesa");
    expect(text).toContain("sin cebolla");
    expect(text).toContain("servir junto");
  });

  it("comanda con contornos lista las selecciones bajo la línea", () => {
    const bytes = renderComanda({
      mesaNumero: 7,
      ordenNumero: 1,
      mesero: "Ana",
      lineas: [
        {
          nombre: "Menú del día",
          cantidad: 1,
          contornos: ["Proteína: Pollo", "Contorno: Papas fritas", "EXTRA: Pollo"],
        },
      ],
    });
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("1 x Menú del día");
    expect(text).toContain("Proteína: Pollo");
    expect(text).toContain("Contorno: Papas fritas");
    expect(text).toContain("EXTRA: Pollo");
  });

  it("precuenta aclara que no es boleta", () => {
    const text = new TextDecoder().decode(
      renderPrecuenta({
        mesaNumero: 7,
        mesero: "Ana",
        cubiertos: 4,
        lineas: [{ nombre: "Hamburguesa", cantidad: 5, precio_centavos: 8900 }],
        totalCentavos: 44500,
      }),
    );
    expect(text).toMatch(/no es boleta/i);
  });

  it("precuenta legacy conserva su formato con cubiertos", () => {
    const texto = textoPrecuenta({
      mesaNumero: 7,
      mesero: "Ana",
      cubiertos: 4,
      lineas: [{ nombre: "Hamburguesa", cantidad: 5, precio_centavos: 8900 }],
      totalCentavos: 44500,
    });
    expect(texto).toContain("PRECUENTA\nMesa 7\nCubiertos: 4\nMesero: Ana\n5 x Hamburguesa  8900\nTOTAL 44500");
  });

  it("precuenta sin cubiertos omite la línea en vez de imprimir cero", () => {
    const texto = textoPrecuenta({
      mesaNumero: 7,
      mesero: "Ana",
      lineas: [{ nombre: "Jugo", cantidad: 2, precio_centavos: 2500 }],
      totalCentavos: 5000,
    });
    expect(texto).toContain("PRECUENTA\nMesa 7\nMesero: Ana\n2 x Jugo  2500\nTOTAL 5000");
    expect(texto).not.toContain("Cubiertos");
  });

  it("precuenta distingue dos líneas del mismo producto por su nota", () => {
    const texto = textoPrecuenta({
      mesaNumero: 7,
      mesero: "Ana",
      lineas: [
        { nombre: "Hamburguesa", cantidad: 1, precio_centavos: 8900, nota: "sin cebolla" },
        { nombre: "Hamburguesa", cantidad: 1, precio_centavos: 8900, nota: "sin queso" },
        { nombre: "Jugo", cantidad: 1, precio_centavos: 2500, nota: null },
      ],
      totalCentavos: 20300,
    });
    expect(texto).toContain("1 x Hamburguesa (sin cebolla)  8900");
    expect(texto).toContain("1 x Hamburguesa (sin queso)  8900");
    // Sin nota el renglón queda como siempre, sin paréntesis vacíos.
    expect(texto).toContain("1 x Jugo  2500");
  });

  it("anulación legacy conserva su formato", () => {
    const text = new TextDecoder().decode(
      renderAnulacion({ mesaNumero: 7, mesero: "Ana", lineas: [{ nombre: "Hamburguesa", cantidad: 2 }] }),
    );
    expect(text).toContain("ANULACION\nMesa 7\nMesero: Ana\nANULA 2 x Hamburguesa");
  });

  it("corrección imprime deltas, anulados y notas cambiadas", () => {
    const texto = textoCorreccion({
      mesaNumero: 7,
      ordenNumero: 2,
      mesero: "Ana",
      esAnulacion: false,
      indicaciones: "servir junto",
      lineas: [
        { nombre: "Hamburguesa", delta: -1, cantidadAnterior: 2, cantidadNueva: 1 },
        { nombre: "Jugo", delta: 2, cantidadAnterior: 0, cantidadNueva: 2 },
        { nombre: "Café", delta: -1, cantidadAnterior: 1, cantidadNueva: 0 },
        {
          nombre: "Pizza margarita",
          delta: 0,
          cantidadAnterior: 1,
          cantidadNueva: 1,
          notaAnterior: null,
          notaNueva: "sin cebolla",
        },
      ],
    });
    expect(texto).toBe(
      [
        "CORRECCIÓN · Mesa 7 · Orden 2",
        "Mesero: Ana",
        "Indicaciones: servir junto",
        "- 1 Hamburguesa",
        "+ 2 Jugo",
        "ANULADO: 1 Café",
        "NOTA CAMBIADA: Pizza margarita → sin cebolla",
      ].join("\n"),
    );
  });

  it("distingue dos líneas del mismo producto por su nota", () => {
    const texto = textoCorreccion({
      mesaNumero: 7,
      ordenNumero: 2,
      mesero: "Ana",
      esAnulacion: false,
      lineas: [
        {
          nombre: "Hamburguesa",
          delta: -1,
          cantidadAnterior: 2,
          cantidadNueva: 1,
          notaAnterior: "sin cebolla",
          notaNueva: "sin cebolla",
        },
        {
          nombre: "Hamburguesa",
          delta: 0,
          cantidadAnterior: 1,
          cantidadNueva: 1,
          notaAnterior: "extra queso",
          notaNueva: "sin tomate",
        },
        {
          nombre: "Hamburguesa",
          delta: -3,
          cantidadAnterior: 3,
          cantidadNueva: 0,
          notaAnterior: "para llevar",
          notaNueva: null,
        },
      ],
    });
    expect(texto).toContain("- 1 Hamburguesa (sin cebolla)");
    expect(texto).toContain("NOTA CAMBIADA: Hamburguesa (antes: extra queso) → sin tomate");
    expect(texto).toContain("ANULADO: 3 Hamburguesa (para llevar)");
  });

  it("un cambio que solo borra indicaciones igual deja cuerpo", () => {
    expect(
      textoCorreccion({
        mesaNumero: 7,
        ordenNumero: 1,
        mesero: "Ana",
        esAnulacion: false,
        indicaciones: null,
        indicacionesCambiadas: true,
        lineas: [],
      }),
    ).toBe("CORRECCIÓN · Mesa 7 · Orden 1\nMesero: Ana\nINDICACIONES BORRADAS");
  });

  it("un cambio de indicaciones las imprime en el cuerpo", () => {
    const texto = textoCorreccion({
      mesaNumero: 7,
      ordenNumero: 1,
      mesero: "Ana",
      esAnulacion: false,
      indicaciones: "servir al final",
      indicacionesCambiadas: true,
      lineas: [],
    });
    expect(texto).toContain("Indicaciones: servir al final");
    expect(texto).toContain("INDICACIONES CAMBIADAS: servir al final");
  });

  it("corrección de anulación total usa encabezado de anulación", () => {
    const text = new TextDecoder().decode(
      renderCorreccion({
        mesaNumero: 7,
        ordenNumero: 1,
        mesero: "Ana",
        esAnulacion: true,
        lineas: [{ nombre: "Jugo", delta: -2, cantidadAnterior: 2, cantidadNueva: 0 }],
      }),
    );
    expect(text).toContain("ANULACIÓN · Mesa 7 · Orden 1");
    expect(text).toContain("ANULADO: 2 Jugo");
  });

  it("corrección sin mesa dice Sin mesa y quita la nota borrada", () => {
    const texto = textoCorreccion({
      mesaNumero: null,
      ordenNumero: 3,
      mesero: "Ana",
      esAnulacion: false,
      lineas: [
        {
          nombre: "Jugo",
          delta: 0,
          cantidadAnterior: 1,
          cantidadNueva: 1,
          notaAnterior: "sin hielo",
          notaNueva: null,
        },
      ],
    });
    expect(texto).toContain("Sin mesa · Orden 3");
    expect(texto).toContain("NOTA BORRADA: Jugo");
  });
});
