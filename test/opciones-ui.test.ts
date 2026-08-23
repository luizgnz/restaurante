import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Opciones } from "../ui/src/pantallas/Opciones.tsx";
import { VistaPreviaComanda } from "../ui/src/pantallas/VistaPreviaComanda.tsx";

const valores = {
  nombre_local: "La Mesa",
  logo_data: null,
  tipografia: "sans" as const,
  tamano_ui: "normal" as const,
  pin_habilitado: true,
  pin_momento: "enviar" as const,
  confirmar_comanda: false,
  auditoria_anulaciones: false,
  justificacion_anulacion: false,
  precuenta_obligatoria_antes_de_caja: true,
};

describe("opciones", () => {
  it("agrupa identidad, apariencia, seguridad e impresoras; no menciona tablet", () => {
    const html = renderToStaticMarkup(createElement(Opciones, { valores, onCambiar: () => undefined }));
    expect(html).toContain("Opciones");
    expect(html).toContain("Identidad");
    expect(html).toContain("Apariencia");
    expect(html).toContain("Seguridad y autorizaciones");
    expect(html).toContain("Impresoras");
    expect(html).toContain("Configuración próximamente");
    expect(html).toContain("Solicitar contraseña");
    expect(html).toContain("Confirmar comanda");
    expect(html).toContain("Pedir precuenta antes de cerrar la cuenta");
    expect(html).toContain("disabled");
    expect(html).not.toContain("Tablet en cocina");
  });

  it("auditoría en seguridad; justificación solo si auditoría activa", () => {
    const sinAuditoria = renderToStaticMarkup(
      createElement(Opciones, { valores, onCambiar: () => undefined }),
    );
    expect(sinAuditoria).toContain("Guardar registro de órdenes anuladas");
    expect(sinAuditoria).not.toContain("Pedir justificación al anular");

    const conAuditoria = renderToStaticMarkup(
      createElement(Opciones, {
        valores: { ...valores, auditoria_anulaciones: true, justificacion_anulacion: true },
        onCambiar: () => undefined,
      }),
    );
    expect(conAuditoria).toContain("Pedir justificación al anular");
  });

  it("la vista previa parece un ticket y no es otro sistema", () => {
    const html = renderToStaticMarkup(
      createElement(VistaPreviaComanda, {
        texto: "COMANDA\nMesa 1\nMesero: Ana\n1 x Hamburguesa",
        onVolver: () => undefined,
        onContinuar: () => undefined,
      }),
    );
    expect(html).toContain("COMANDA");
    expect(html).toContain("Continuar");
    expect(html).toContain("Volver");
    expect(html).toContain("ticket-preview");
  });
});
