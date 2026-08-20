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
    expect(html).toContain("login-odoo");
    expect(html).toContain("Usuario");
    expect(html).toContain("Contraseña");
    expect(html).toContain("Iniciar sesión");
    expect(html).toContain('type="password"');
    expect(html).not.toContain("Ana");
    expect(html).not.toMatch(/>PIN</);
    expect(html).not.toContain("Identificarse");
  });
});
