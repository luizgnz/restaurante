import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Kds, type TarjetaKdsUi } from "../ui/src/pantallas/Kds.tsx";
import { Pedidos, type CuentaEnCursoUi } from "../ui/src/pantallas/Pedidos.tsx";

const tarjeta: TarjetaKdsUi = {
  id: 10,
  tipo: "orden",
  referencia: "Mesa #7 · Orden #1",
  mesa: 7,
  mesero: "Ana",
  envioN: 1,
  ordenNumero: 1,
  numeroVersion: null,
  esAnulacion: false,
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
  it("cocina muestra la tabla de órdenes con una fila por orden", () => {
    const html = renderToStaticMarkup(
      createElement(Kds, {
        tarjetas: [tarjeta],
        onCambiarEtapa: async () => undefined,
        onCrearIncidencia: async () => undefined,
      }),
    );
    expect(html).toContain("Vista del cocinero");
    // la tabla: cabecera y una fila clicable con la orden
    expect(html).toContain('aria-label="Órdenes en cocina, de la más nueva a la más vieja"');
    expect(html).toContain("Orden");
    expect(html).toContain("Espera");
    expect(html).toContain("Productos");
    // primero el número de orden; la mesa va en segunda línea, en otra letra
    expect(html).toContain('aria-label="Abrir Orden #1 de la Mesa #7"');
    expect(html).toContain("cocina-tabla__mesa");
    // la fila muestra la descripción acotada de lo pedido
    expect(html).toContain("1 × Hamburguesa (sin cebolla)");
    // sin contadores, sin estado "Enviada", sin botón de actualizar
    expect(html).not.toContain("enviados a cocina");
    expect(html).not.toContain("Enviada<");
    expect(html).not.toContain("Actualizar");
    // las acciones NO viven en la tabla: van en la pantalla emergente al hacer clic
    expect(html).not.toContain("Comenzar orden");
    expect(html).not.toContain("Lista completa");
  });

  it("las órdenes sin nada por cocinar salen del tablero", () => {
    const entregada = {
      ...tarjeta,
      id: 11,
      lineas: [{ ...tarjeta.lineas[0], etapa: "listo" }],
    };
    const html = renderToStaticMarkup(
      createElement(Kds, {
        tarjetas: [tarjeta, entregada],
        onCambiarEtapa: async () => undefined,
        onCrearIncidencia: async () => undefined,
      }),
    );
    // solo queda la fila activa; la entregada desaparece sin toggle
    expect((html.match(/Abrir Orden #1 de la Mesa #7/g) ?? []).length).toBe(1);
    expect(html).not.toContain("Ocultar entregadas");
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
      }),
    );
    // respondida la incidencia, la fila se renderiza y deja de estar bloqueada
    expect(html).toContain('aria-label="Abrir Orden #1 de la Mesa #7"');
    expect(html).not.toContain("Cocina esperando respuesta");
  });
});
