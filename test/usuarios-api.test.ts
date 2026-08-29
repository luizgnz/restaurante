import { describe, expect, it } from "vitest";
import { entornoApi, post } from "./helpers.ts";

describe("usuarios y roles API", () => {
  it("crea y edita un usuario con varios roles", async () => {
    const e = await entornoApi();
    await post(e.app, "/api/sesion/abrir", { usuario: "admin", password: "admin" });
    const creado = await post(e.app, "/api/usuarios", {
      nombre: "Valentina",
      usuario: "vale",
      pin: "4545",
      password: "clave-segura",
      roles: ["mesero", "caja"],
    });
    expect(creado.status).toBe(201);
    const { usuario } = (await creado.json()) as { usuario: { id: number; roles: string[] } };
    expect(usuario.roles).toEqual(["caja", "mesero"]);

    const editado = await e.app.request(`/api/usuarios/${usuario.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre: "Valentina", usuario: "vale", roles: ["mesero", "inventario"], activo: true }),
    });
    expect(editado.status).toBe(200);
    expect(((await editado.json()) as { usuario: { roles: string[] } }).usuario.roles).toEqual(["inventario", "mesero"]);

    const listado = await e.app.request("/api/usuarios");
    expect(((await listado.json()) as { roles: Array<{ clave: string }> }).roles.map((rol) => rol.clave)).toEqual([
      "administrador", "mesero", "cocina", "caja", "inventario",
    ]);
    e.db.close();
  });
});
