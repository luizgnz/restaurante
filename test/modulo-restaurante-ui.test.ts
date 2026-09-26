import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CrearProducto } from "../ui/src/pantallas/CrearProducto.tsx";
import { Backend } from "../ui/src/pantallas/Backend.tsx";
import { EditarMapa } from "../ui/src/pantallas/EditarMapa.tsx";
import { CerrarJornadaDialog } from "../ui/src/pantallas/CerrarJornadaDialog.tsx";
import { Reportes } from "../ui/src/pantallas/Reportes.tsx";

describe("pantallas módulo restaurante", () => {
  it("formulario de producto tipo PdV", () => {
    const html = renderToStaticMarkup(
      createElement(CrearProducto, {
        categorias: [{ id: 1, nombre: "Principales" }],
        error: "",
        onGuardar: () => undefined,
        onCancelar: () => undefined,
      }),
    );
    expect(html).not.toContain("Nuevo producto");
    expect(html).not.toContain("<h1");
    expect(html).toContain("Precio de venta");
    // Todo producto queda asociado a una categoría.
    expect(html).not.toContain("Sin categoría");
    expect(html).toContain("Categoría del menú");
    expect(html).toContain("Disponible en la carta");
    expect(html).toContain("Rastrear en el inventario");
    expect(html).toContain("Código de producto");
    expect(html).toContain("Color del ítem");
    expect(html).toContain("Foto");
    expect(html).toContain("checked");
    expect(html).toContain("Guardar");
  });

  it("editar mapa muestra los dos grupos y desactiva el de mesa sin selección", () => {
    const html = renderToStaticMarkup(
      createElement(EditarMapa, {
        pisos: [{ id: 1, nombre: "Salón" }],
        mesas: [
          {
            id: 1,
            numero: 7,
            estado: "libre",
            cuentaId: null,
            asientos: 4,
            pos_x: 10,
            pos_y: 10,
            forma: "round",
            ancho: 90,
            alto: 90,
            piso_id: 1,
          },
        ],
        onGuardar: () => undefined,
        onDescartar: () => undefined,
      }),
    );
    expect(html).toContain("Guardar");
    expect(html).toContain("Opciones del área");
    expect(html).toContain("Opciones de mesa");
    expect(html).toContain('title="Nueva mesa"');
    expect(html).toContain('title="Nueva área"');
    expect(html).toContain('title="Ordenar y dimensionar mesas automáticamente"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("<span>Auto</span>");
    expect(html).toContain('title="Duplicar área"');
    expect(html).toContain('title="Eliminar área"');
    expect(html).toContain('title="Duplicar mesa"');
    expect(html).toContain('title="Eliminar mesa"');
    expect(html).not.toContain('title="Forma redonda"');
    expect(html).not.toContain('title="Forma cuadrada"');
    expect(html).toContain('title="Nombre del área"');
    expect(html).toContain('title="Clientes"');
    expect(html).toContain('title="Color de la mesa"');
    expect(html).toContain("editor-campo__nombre");
    expect(html).toContain("editor-campo__clientes");
    expect(html).toContain("editor-campo__color");
    expect(html).not.toContain('role="alert"');
    const grupoMesa = html.slice(html.indexOf("Opciones de mesa") - 200, html.indexOf("Opciones de mesa"));
    expect(grupoMesa).toContain("disabled");
  });

  it("backend ofrece los atajos del módulo restaurante", () => {
    const html = renderToStaticMarkup(
      createElement(Backend, {
        onCrearProducto: () => undefined,
        onCategorias: () => undefined,
        onContornos: () => undefined,
        onRecetas: () => undefined,
        onEditarMapa: () => undefined,
        onMesas: () => undefined,
      }),
    );
    expect(html).toContain("Crear producto");
    expect(html).toContain("Categorías");
    expect(html).toContain("Contornos");
    expect(html).toContain("Editar mapa");
    expect(html).toContain("Administración");
    expect(html).toContain("Editar recetas");
    expect(html).toContain("Día operativo");
    expect(html).toContain("Consultando jornada");
    expect(html).not.toContain("Cuentas activas");
    expect(html).not.toContain("Configurar turnos");
    expect(html).toContain("Reiniciar día de demostración");
  });

  it("el encargado solo ve la operación de jornada", () => {
    const html = renderToStaticMarkup(
      createElement(Backend, {
        esAdministrador: false,
        onCrearProducto: () => undefined,
        onCategorias: () => undefined,
        onContornos: () => undefined,
        onEditarMapa: () => undefined,
        onMesas: () => undefined,
      }),
    );
    expect(html).toContain("Día operativo");
    expect(html).not.toContain("Crear producto");
    expect(html).not.toContain("Reiniciar día de demostración");
    expect(html).not.toContain("Configurar turnos");
    expect(html).not.toContain("Órdenes</dt>");
  });

  it("el cierre masivo explica los bloqueos y exige credenciales", () => {
    const html = renderToStaticMarkup(
      createElement(CerrarJornadaDialog, {
        resumen: {
          cuentasActivas: 3,
          cuentasTotales: 3,
          cuentasVacias: 1,
          ordenes: 4,
          tareasCocinaPendientes: 0,
          incidenciasPendientes: 0,
          ordenesListas: 2,
          pedidosParaLlevarPendientes: 0,
        },
        procesando: false,
        onActualizarEntregas: async () => undefined,
        onCancelar: () => undefined,
        onConfirmar: async () => undefined,
      }),
    );
    expect(html).toContain("sin imprimir precuentas una por una");
    expect(html).toContain("Marcar todas entregadas");
    expect(html).toContain("Usuario autorizado");
    expect(html).toContain("Contraseña");
    expect(html).toContain("disabled");
  });

  it("reportes ofrece períodos rápidos y limita ventas por permiso", () => {
    const html = renderToStaticMarkup(createElement(Reportes, { puedeVentas: true, onVolver: () => undefined }));
    expect(html).toContain("Hoy");
    expect(html).toContain("Esta semana");
    expect(html).toContain("Este mes");
    expect(html).toContain("Personalizado");
    expect(html).toContain("Ventas registradas");
    expect(html).toContain("Inventario");
    expect(html.match(/Descargar PDF/g)).toHaveLength(2);
    expect(html).toContain("/api/reportes/ventas.pdf?");

    const inventoryOnly = renderToStaticMarkup(createElement(Reportes, { puedeVentas: false, onVolver: () => undefined }));
    expect(inventoryOnly).not.toContain("Ventas registradas");
    expect(inventoryOnly.match(/Descargar PDF/g)).toHaveLength(1);
  });
});
