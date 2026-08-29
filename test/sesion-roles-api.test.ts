import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { createApp } from "../src/http/app.ts";
import { crearEmpleado, type RolClave } from "../src/modules/empleados/empleados.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { openTestDb } from "./helpers.ts";

async function entrar(app: ReturnType<typeof createApp>, usuario: string): Promise<string> {
  const respuesta = await app.request("/api/sesion/abrir", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usuario, password: "clave-segura" }),
  });
  expect(respuesta.status).toBe(200);
  const cookie = respuesta.headers.get("set-cookie");
  expect(cookie).toContain("restaurante_sesion=");
  return cookie!.split(";", 1)[0];
}

async function crearUsuario(db: ReturnType<typeof openTestDb>, rol: RolClave) {
  await crearEmpleado(db, {
    nombre: rol,
    usuario: rol,
    password: "clave-segura",
    pin: `9${String(rol.length).padStart(3, "0")}`,
    roles: [rol],
  });
}

describe("sesiones y vistas por rol", () => {
  it("todos los roles pueden iniciar sesión y el servidor limita sus vistas", async () => {
    const db = openTestDb();
    seedCartaDemo(db);
    for (const rol of ["administrador", "mesero", "cocina", "caja", "inventario"] as RolClave[]) await crearUsuario(db, rol);
    const app = createApp({ db, config: defaultConfig(), printer: new MemoryPrinter(), exigirAutenticacion: true });

    const cookieCocina = await entrar(app, "cocina");
    expect((await app.request("/api/kds", { headers: { cookie: cookieCocina } })).status).toBe(200);
    expect((await app.request("/api/mesas", { headers: { cookie: cookieCocina } })).status).toBe(403);

    const cookieMesero = await entrar(app, "mesero");
    expect((await app.request("/api/mesas", { headers: { cookie: cookieMesero } })).status).toBe(200);
    expect((await app.request("/api/kds", { headers: { cookie: cookieMesero } })).status).toBe(403);

    for (const rol of ["administrador", "mesero", "cocina", "caja", "inventario"] as RolClave[]) {
      const cookie = rol === "cocina" ? cookieCocina : rol === "mesero" ? cookieMesero : await entrar(app, rol);
      expect((await app.request("/api/inventario", { headers: { cookie } })).status).toBe(200);
    }

    const material = db.prepare("SELECT producto_id AS id FROM stock ORDER BY producto_id LIMIT 1").get() as { id: number };
    const entradaMesero = await app.request(`/api/inventario/${material.id}/entradas`, {
      method: "POST",
      headers: { cookie: cookieMesero, "content-type": "application/json" },
      body: JSON.stringify({ cantidad: 1, pin: "9006" }),
    });
    expect(entradaMesero.status).toBe(403);

    const cookieAdmin = await entrar(app, "administrador");
    const entradaAdmin = await app.request(`/api/inventario/${material.id}/entradas`, {
      method: "POST",
      headers: { cookie: cookieAdmin, "content-type": "application/json" },
      body: JSON.stringify({ cantidad: 1, pin: "9013" }),
    });
    expect(entradaAdmin.status).toBe(201);
    db.close();
  });
});
