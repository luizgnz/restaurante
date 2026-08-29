import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PinPad } from "../ui/src/pantallas/PinPad.tsx";

describe("teclado del PIN", () => {
  it("sale como pantalla emergente sobre la vista actual", () => {
    const html = renderToStaticMarkup(
      createElement(PinPad, {
        titulo: "PIN para anular",
        onPin: () => undefined,
        onCancelar: () => undefined,
      }),
    );
    // Se afirma el comportamiento accesible, no el nombre de la clase CSS:
    // `modal-fondo` se eliminó al migrar PinPad al componente Dialog.
    expect(html).toContain('aria-label="PIN para anular"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("PIN para anular");
    expect(html).toContain("Cancelar");
    expect(html).toContain("OK");
    expect(html).toContain("Enter");
  });

  it("muestra dentro del modal el fallo y ofrece reintento", () => {
    const html = renderToStaticMarkup(
      createElement(PinPad, {
        titulo: "PIN para enviar",
        error: "PIN inválido",
        onPin: () => undefined,
        onCancelar: () => undefined,
      }),
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("PIN inválido");
    expect(html).toContain("Vuelve a ingresar el PIN");
  });
});
