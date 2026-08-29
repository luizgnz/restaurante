import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ConstructorOrden,
  actualizarLineaConstructor,
  crearLineasConstructor,
  lineasPersistibles,
  revelarProducto,
  type ProductoCarta,
} from "../ui/src/pantallas/ConstructorOrden.tsx";
import { CuentaMesa, type CuentaDetalleUi } from "../ui/src/pantallas/CuentaMesa.tsx";
import { ConfirmarCierreCuenta } from "../ui/src/pantallas/ConfirmarCierreCuenta.tsx";
import {
  ModalEditarOrden,
  crearLineasEditables,
  prepararLineasCorreccion,
} from "../ui/src/pantallas/ModalEditarOrden.tsx";
import type { BorradorOrden } from "../ui/src/lib/borradores.ts";

const productos: ProductoCarta[] = [
  { id: 1, nombre: "Hamburguesa", precio_centavos: 8900, armable: 0 },
  { id: 2, nombre: "Jugo", precio_centavos: 3500, armable: 0 },
];

const borrador: BorradorOrden = {
  version: 1,
  claveIdempotencia: "ui-test-1",
  lineas: [{ productoId: 1, cantidad: 2, nota: "sin cebolla" }],
  indicaciones: "Primero las bebidas",
  actualizadoEn: "2026-08-22T12:00:00.000Z",
};

const cuenta: CuentaDetalleUi = {
  id: 8,
  mesa: { id: 3, numero: 7 },
  estado: "abierta",
  notaPrivada: null,
  totalCentavos: 21300,
  ordenes: [
    {
      id: 11,
      numero: 1,
      estado: "enviada",
      indicaciones: null,
      indicacionesOriginales: null,
      creadaEn: "2026-08-22T12:00:00.000Z",
      empleado: "Ana",
      lineas: [
        {
          lineaClave: "linea-1",
          ordenLineaId: 20,
          productoId: 1,
          nombre: "Hamburguesa",
          cantidad: 2,
          precioCentavos: 8900,
          nota: "sin cebolla",
        },
      ],
    },
    {
      id: 12,
      numero: 2,
      estado: "corregida",
      indicaciones: "Con hielo",
      indicacionesOriginales: null,
      creadaEn: "2026-08-22T12:10:00.000Z",
      empleado: "Ana",
      lineas: [
        {
          lineaClave: "linea-2",
          ordenLineaId: 21,
          productoId: 2,
          nombre: "Jugo",
          cantidad: 1,
          precioCentavos: 3500,
          nota: null,
        },
      ],
    },
  ],
};

describe("constructor de orden", () => {
  it("en contexto general exige selector de mesa", () => {
    const html = renderToStaticMarkup(
      createElement(ConstructorOrden, {
        mesasSeleccionables: [
          { id: 3, numero: 7, estado: "libre" },
          { id: 4, numero: 8, estado: "ocupada" },
        ],
        productos,
        borrador,
        onCambiar: () => undefined,
        onEnviar: async () => undefined,
        onCancelar: () => undefined,
      }),
    );

    expect(html).toContain("Nueva orden");
    expect(html).toContain("<select");
    expect(html).toContain("Selecciona una mesa");
    expect(html).toContain("Mesa #7");
    expect(html).not.toContain("Mesa #8");
  });

  it("en contexto de mesa fija muestra el título y no el selector", () => {
    const html = renderToStaticMarkup(
      createElement(ConstructorOrden, {
        mesaFija: { id: 3, numero: 7 },
        productos,
        borrador: { ...borrador, mesaId: 3 },
        onCambiar: () => undefined,
        onEnviar: async () => undefined,
        onCancelar: () => undefined,
      }),
    );

    expect(html).toContain("Nueva orden · Mesa #7");
    expect(html).not.toContain("<select");
    // La cantidad se controla en la propia tarjeta del menú, sin popup.
    expect(html).toContain("2 × Hamburguesa");
    expect(html).toContain('aria-label="Agregar una unidad de Hamburguesa"');
    expect(html).toContain('aria-label="Quitar una unidad de Hamburguesa"');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("Agregar línea");
    // Un producto sin línea no muestra controles todavía.
    expect(html).not.toContain('aria-label="Agregar una unidad de Jugo"');
    // Sin notas por producto: solo indicaciones generales de la orden.
    expect(html).not.toContain("Nota del producto");
    expect(html).toContain("Indicaciones del cliente");
  });

  it("revelar un producto muestra el control en cero sin sumarlo a la orden", () => {
    const html = renderToStaticMarkup(
      createElement(ConstructorOrden, {
        mesaFija: { id: 3, numero: 7 },
        productos,
        borrador: { ...borrador, mesaId: 3, lineas: [{ productoId: 2, cantidad: 0, nota: "" }] },
        onCambiar: () => undefined,
        onEnviar: async () => undefined,
        onCancelar: () => undefined,
      }),
    );

    expect(html).toContain('aria-label="Agregar una unidad de Jugo"');
    expect(html).toContain('aria-label="Quitar una unidad de Jugo"');
    expect(html).toContain(">0<");
    // En cero no aparece en la orden ni habilita el envío.
    expect(html).not.toContain("0 × Jugo");
    expect(html).toContain("Toca un producto del menú para agregarlo");
    expect(html).toContain("disabled");
  });

  it("revelar otro producto desactiva el revelado anterior que quedó en cero", () => {
    const revelada = revelarProducto([], 1, () => "ui-a");

    expect(revelada).toEqual([{ idUi: "ui-a", productoId: 1, cantidad: 0, nota: "" }]);

    // Quedó en cero: al tocar otro producto se descarta.
    const cambio = revelarProducto(revelada, 2, () => "ui-b");
    expect(cambio).toEqual([{ idUi: "ui-b", productoId: 2, cantidad: 0, nota: "" }]);

    // Con unidades se conserva junto al nuevo revelado.
    const conUnidades = actualizarLineaConstructor(cambio, "ui-b", { cantidad: 3 });
    const tercero = revelarProducto(conUnidades, 1, () => "ui-c");
    expect(tercero.map((linea) => [linea.productoId, linea.cantidad])).toEqual([
      [2, 3],
      [1, 0],
    ]);

    // Tocar el mismo producto no lo duplica.
    expect(revelarProducto(tercero, 1, () => "ui-d")).toBe(tercero);
  });

  it("restaura duplicados y cambia solo la línea elegida", () => {
    const ids = ["ui-a", "ui-b"];
    const lineas = crearLineasConstructor(
      [
        { productoId: 1, cantidad: 2, nota: "sin cebolla" },
        { productoId: 1, cantidad: 1, nota: "sin queso" },
      ],
      () => ids.shift()!,
    );

    const cambiadas = actualizarLineaConstructor(lineas, "ui-b", { cantidad: 3 });

    expect(lineasPersistibles(cambiadas)).toEqual([
      { productoId: 1, cantidad: 2, nota: "sin cebolla" },
      { productoId: 1, cantidad: 3, nota: "sin queso" },
    ]);

    const html = renderToStaticMarkup(
      createElement(ConstructorOrden, {
        mesaFija: { id: 3, numero: 7 },
        productos,
        borrador: { ...borrador, mesaId: 3, lineas: lineasPersistibles(cambiadas) },
        onCambiar: () => undefined,
        onEnviar: async () => undefined,
        onCancelar: () => undefined,
      }),
    );
    expect(html).toContain("2 × Hamburguesa");
    expect(html).toContain("3 × Hamburguesa");
    expect(html).not.toContain("Nota del producto");
  });
});

describe("cuenta de mesa", () => {
  it("agrupa productos por orden y ofrece acciones sobre la orden enviada", () => {
    const html = renderToStaticMarkup(
      createElement(CuentaMesa, {
        cuenta,
        puedeCerrar: false,
        onNuevaOrden: () => undefined,
        onEditarOrden: () => undefined,
        onAnularOrden: () => undefined,
        onPrecuenta: () => undefined,
        onCerrarCuenta: () => undefined,
        onNotaPrivada: async () => undefined,
      }),
    );

    expect(html).toContain("Cuenta de mesa #7");
    expect(html).toContain("Orden #1");
    expect(html).toContain("Orden #2");
    expect(html).toContain("Hamburguesa");
    expect(html).toContain("Jugo");
    expect(html).toContain('title="Editar orden"');
    expect(html).toContain('title="Anular orden"');
    expect(html).toContain("Nueva orden");
    expect(html).not.toContain(">Enviar<");
    expect(html).not.toContain('aria-label="Agregar una unidad"');
    expect(html).not.toContain('aria-label="Quitar una unidad"');
    expect(html).toContain("Nota privada");
    expect(html).toContain("Solo visible en el sistema");
    // Sin precuenta emitida (y exigida) no se ofrece cerrar la cuenta.
    expect(html).toContain("Precuenta");
    expect(html).not.toContain("Cerrar cuenta");
    expect(html).not.toContain("Enviar a caja");
  });

  it("ofrece cerrar la cuenta cuando la precuenta ya está emitida", () => {
    const html = renderToStaticMarkup(
      createElement(CuentaMesa, {
        cuenta: { ...cuenta, estado: "precuenta_emitida" },
        puedeCerrar: true,
        onNuevaOrden: () => undefined,
        onEditarOrden: () => undefined,
        onAnularOrden: () => undefined,
        onPrecuenta: () => undefined,
        onCerrarCuenta: () => undefined,
        onNotaPrivada: async () => undefined,
      }),
    );

    expect(html).toContain("Precuenta");
    expect(html).toContain("Cerrar cuenta");
  });

  it("oculta líneas efectivas en cero como consumo", () => {
    const html = renderToStaticMarkup(
      createElement(CuentaMesa, {
        cuenta: {
          ...cuenta,
          ordenes: [
            {
              ...cuenta.ordenes[0],
              lineas: [
                ...cuenta.ordenes[0].lineas,
                {
                  lineaClave: "cancelada",
                  ordenLineaId: 99,
                  productoId: 2,
                  nombre: "Producto cancelado",
                  cantidad: 0,
                  precioCentavos: 3500,
                  nota: null,
                },
              ],
            },
          ],
        },
        puedeCerrar: false,
        onNuevaOrden: () => undefined,
        onEditarOrden: () => undefined,
        onAnularOrden: () => undefined,
        onPrecuenta: () => undefined,
        onCerrarCuenta: () => undefined,
        onNotaPrivada: async () => undefined,
      }),
    );

    expect(html).not.toContain("Producto cancelado");
  });
});

describe("confirmación de cierre de cuenta", () => {
  it("pide confirmar con mesa y total antes de cerrar", () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmarCierreCuenta, {
        mesaNumero: 7,
        totalCentavos: 21300,
        onConfirmar: () => undefined,
        onCancelar: () => undefined,
      }),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("¿Cerrar cuenta?");
    expect(html).toContain("Mesa #7");
    expect(html).toContain("$21300");
    expect(html).toContain("Cancelar");
    expect(html).toContain("Cerrar cuenta");
  });
});

describe("corrección de orden", () => {
  it("muestra un diff textual de cantidad, nota e indicaciones y pide PIN", () => {
    const html = renderToStaticMarkup(
      createElement(ModalEditarOrden, {
        orden: cuenta.ordenes[0],
        productos,
        pedirJustificacionAlAnular: true,
        onGuardar: async () => undefined,
        onCancelar: () => undefined,
      }),
    );

    expect(html).toContain("Editar orden #1");
    expect(html).toContain("Vista previa de cambios");
    expect(html).toContain("Sin cambios");
    expect(html).toContain("Continuar y pedir PIN");
    expect(html).toContain("Indicaciones para Hamburguesa");
    expect(html).toContain('value="sin cebolla"');
    expect(html).toContain("Indicaciones generales para cocina");
  });

  it("no incluye líneas históricas en cero ni permite resucitarlas", () => {
    const orden = {
      ...cuenta.ordenes[0],
      lineas: [
        ...cuenta.ordenes[0].lineas,
        {
          lineaClave: "cancelada",
          ordenLineaId: 99,
          productoId: 2,
          nombre: "Jugo",
          cantidad: 0,
          precioCentavos: 3500,
          nota: null,
        },
      ],
    };

    const editables = crearLineasEditables(orden, "editar", () => "sustituta");

    expect(editables.map((linea) => linea.lineaClaveOriginal)).toEqual(["linea-1"]);
    expect(prepararLineasCorreccion(editables)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ lineaClave: "cancelada", cantidad: 1 })]),
    );
  });

  it("conserva la clave sustituta al reintentar un cambio de producto", () => {
    const [linea] = crearLineasEditables(cuenta.ordenes[0], "editar", () => "reemplazo-estable");
    const cambiada = { ...linea, productoId: 2 };

    expect(prepararLineasCorreccion([cambiada])).toEqual(prepararLineasCorreccion([cambiada]));
    expect(prepararLineasCorreccion([cambiada])[1].lineaClave).toBe("reemplazo-estable");
  });
});
