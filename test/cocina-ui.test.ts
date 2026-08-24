import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Kds, type TarjetaKdsUi } from "../ui/src/pantallas/Kds.tsx";
import { Pedidos, type CuentaEnCursoUi } from "../ui/src/pantallas/Pedidos.tsx";

const tarjeta: TarjetaKdsUi = {
  id: 10,
  tipo: "orden",
  referencia: "Mesa #7 · Orden #1",
  mesero: "Ana",
  creadaEn: "2026-08-24T01:00:00.000Z",
  indicaciones: "Todo junto",
  lineas: [
    {
      id: 20,
      etapa: "por_preparar",
      esAviso: false,
      nombre: "Hamburguesa",
      cantidad: 1,
      delta: null,
      nota: "sin cebolla",
      contornos: ["Contorno: Papas fritas"],
    },
  ],
  incidencias: [],
};

const cuenta: CuentaEnCursoUi = {
  id: 1,
  mesaId: 7,
  mesa: 7,
  mesero: "Ana",
  estado: "abierta",
  hace: "Ahora",
  totalCentavos: 10_000,
  ordenes: [{ id: 30, numero: 1, lineas: [{ lineaClave: "l1", productoId: 1, nombre: "Hamburguesa", cantidad: 1, nota: null }] }],
};

describe("vistas coordinadas de cocina y mesero", () => {
  it("cocina muestra los tres estados y las acciones por producto u orden", () => {
    const html = renderToStaticMarkup(
      createElement(Kds, {
        tarjetas: [tarjeta],
        onCambiarEtapa: async () => undefined,
        onCrearIncidencia: async () => undefined,
        onRecargar: async () => undefined,
      }),
    );
    expect(html).toContain("Vista del cocinero");
    expect(html).toContain("Enviado a cocina");
    expect(html).toContain("Comenzar preparación");
    expect(html).toContain("Sugerir cambio");
    expect(html).toContain("No disponible");
    expect(html).toContain("Rechazar orden");
  });

  it("una sugerencia pendiente se presenta al mesero como notificación", () => {
    const incidencia = {
      id: 40,
      comandaId: 10,
      ordenId: 30,
      comandaLineaId: 20,
      tipo: "sugerencia" as const,
      alcance: "linea" as const,
      motivo: "No queda pan",
      propuesta: "Cambiar por ensalada",
      estado: "pendiente" as const,
      mesa: 7,
      ordenNumero: 1,
      producto: "Hamburguesa",
    };
    const html = renderToStaticMarkup(
      createElement(Pedidos, {
        cuentas: [cuenta],
        incidencias: [incidencia],
        onAbrir: () => undefined,
      }),
    );
    expect(html).toContain("Cocina necesita una respuesta");
    expect(html).toContain("Cambio sugerido: Hamburguesa");
    expect(html).toContain("Cambiar por ensalada");
    expect(html).toContain("Sugerencia aceptada");
    expect(html).toContain("Rechazar sugerencia");
  });

  it("cocina muestra la aceptación y vuelve a habilitar el inicio", () => {
    const html = renderToStaticMarkup(
      createElement(Kds, {
        tarjetas: [{
          ...tarjeta,
          incidencias: [{
            id: 40,
            comandaId: 10,
            ordenId: 30,
            comandaLineaId: 20,
            tipo: "sugerencia",
            alcance: "linea",
            motivo: "No queda pan",
            propuesta: "Cambiar por ensalada",
            estado: "aceptada",
            mesa: 7,
            ordenNumero: 1,
            producto: "Hamburguesa",
          }],
        }],
        onCambiarEtapa: async () => undefined,
        onCrearIncidencia: async () => undefined,
        onRecargar: async () => undefined,
      }),
    );
    expect(html).toContain("Sugerencia aceptada por el cliente");
    expect(html).toContain("Comenzar preparación");
  });
});
