import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Login } from "../ui/src/pantallas/Login.tsx";

describe("login administrador", () => {
  it("pide usuario y contraseña, no PIN ni lista de meseros", () => {
    const html = renderToStaticMarkup(
      createElement(Login, {
        error: "",
        onEntrar: () => undefined,
      }),
    );
    // Se afirma el comportamiento visible, no el nombre de la clase CSS:
    // la clase `login-odoo` se eliminó al migrar la pantalla al sistema de
    // diseño, y afirmarla ataba el test a un detalle de implementación.
    expect(html).toContain('name="usuario"');
    expect(html).toContain('name="contraseña"');
    expect(html).toContain('type="password"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain("Usuario");
    expect(html).toContain("Contraseña");
    expect(html).toContain("Iniciar sesión");
    expect(html).not.toContain("Ana");
    expect(html).not.toMatch(/>PIN</);
    expect(html).not.toContain("Identificarse");
  });

  it("muestra el error de credenciales como alerta accesible", () => {
    const html = renderToStaticMarkup(
      createElement(Login, {
        error: "Usuario o contraseña incorrectos",
        onEntrar: () => undefined,
      }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Usuario o contraseña incorrectos");
  });
});
