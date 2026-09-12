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
  ordenId: 30,
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
  ordenes: [{ id: 30, numero: 1, etapa: "enviado", lineas: [{ lineaClave: "l1", productoId: 1, nombre: "Hamburguesa", cantidad: 1, nota: null }] }],
};

describe("vistas coordinadas de cocina y mesero", () => {
  it("cocina muestra el tablero de dos columnas con una tarjeta por orden", () => {
    const html = renderToStaticMarkup(
      createElement(Kds, {
        tarjetas: [tarjeta],
        onCambiarEtapa: async () => undefined,
        onCrearIncidencia: async () => undefined,
      }),
    );
    expect(html).toContain("Vista del cocinero");
    expect(html).toContain('aria-label="Órdenes activas en cocina"');
    expect(html).toContain("Por preparar");
    expect(html).toContain("En proceso");
    // primero el número de orden; la mesa va en segunda línea, en otra letra
    expect(html).toContain('aria-label="Abrir Orden #30 de Mesa #7"');
    expect(html).toContain("tabla-ordenes__mesa");
    // la fila muestra la descripción acotada de lo pedido
    expect(html).toContain("1 × Hamburguesa (sin cebolla)");
    // sin estado "Enviada" ni botón de actualizar
    expect(html).not.toContain("enviados a cocina");
    expect(html).not.toContain("Enviada<");
    expect(html).not.toContain("Actualizar");
    expect(html).toContain("Empezar");
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
    // solo queda la activa en los carriles; la lista vive en el contador
    expect((html.match(/Abrir Orden #30 de Mesa #7/g) ?? []).length).toBe(1);
    expect(html).toContain("Órdenes listas");
    expect(html).not.toContain("Ocultar entregadas");
  });

  it("una corrección compuesta solo por avisos no crea una tarjeta vacía", () => {
    const aviso = {
      ...tarjeta,
      id: 12,
      tipo: "anulacion" as const,
      numeroVersion: 1,
      lineas: [{ ...tarjeta.lineas[0], id: 22, etapa: "aviso", esAviso: true, cantidad: 0, delta: -1 }],
    };
    const html = renderToStaticMarkup(createElement(Kds, {
      tarjetas: [aviso],
      onCambiarEtapa: async () => undefined,
      onCrearIncidencia: async () => undefined,
    }));
    expect(html).not.toContain("Abrir Orden #30");
    expect(html).not.toContain("Marcar lista");
    expect(html).toContain("Sin órdenes");
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
    // el encabezado ofrece una bandeja visible y muestra cuántas quedan por responder
    expect(html).toContain("Incidencias");
    expect(html).toContain(">1</span>");
    // la fila bloqueada lo dice y la tira de la incidencia trae la propuesta
    expect(html).toContain("Cocina esperando respuesta");
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
    expect(html).toContain('aria-label="Abrir Orden #30 de Mesa #7"');
    expect(html).not.toContain("Cocina esperando respuesta");
  });
});
