import { describe, expect, it } from "vitest";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { abrirSesion, cerrarSesion, sesionAbierta } from "../src/modules/empleados/sesion.ts";
import { openTestDb } from "./helpers.ts";

describe("sesión POS", () => {
  it("solo un avanzado con usuario y contraseña abre el salón", async () => {
    const db = openTestDb();
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    await crearEmpleado(db, {
      nombre: "Jefa",
      pin: "2222",
      derecho: "avanzado",
      usuario: "admin",
      password: "admin",
    });

    await expect(abrirSesion(db, { usuario: "admin", password: "1234" })).rejects.toMatchObject({
      codigo: "credenciales_invalidas",
    });
    await expect(abrirSesion(db, { usuario: "ana", password: "1234" })).rejects.toMatchObject({
      codigo: "credenciales_invalidas",
    });
    expect(sesionAbierta(db)).toBeNull();

    const abierta = await abrirSesion(db, { usuario: "admin", password: "admin" });
    expect(abierta.administrador.nombre).toBe("Jefa");
    expect(abierta.administrador.derecho).toBe("avanzado");
    expect(sesionAbierta(db)?.administrador.nombre).toBe("Jefa");
    db.close();
  });

  it("contraseña incorrecta no abre sesión", async () => {
    const db = openTestDb();
    await crearEmpleado(db, {
      nombre: "Jefa",
      pin: "2222",
      derecho: "avanzado",
      usuario: "admin",
      password: "admin",
    });
    await expect(abrirSesion(db, { usuario: "admin", password: "mala" })).rejects.toMatchObject({
      codigo: "credenciales_invalidas",
    });
    expect(sesionAbierta(db)).toBeNull();
    db.close();
  });

  it("cerrar deja el salón bloqueado otra vez", async () => {
    const db = openTestDb();
    await crearEmpleado(db, {
      nombre: "Jefa",
      pin: "2222",
      derecho: "avanzado",
      usuario: "admin",
      password: "admin",
    });
    await abrirSesion(db, { usuario: "admin", password: "admin" });
    cerrarSesion(db);
    expect(sesionAbierta(db)).toBeNull();
    db.close();
  });
});
