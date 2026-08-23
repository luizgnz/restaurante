import { describe, expect, it } from "vitest";
import { crearEmpleado, exigirPin } from "../src/modules/empleados/empleados.ts";
import { hashPin, verifyPin } from "../src/modules/empleados/pin.ts";
import { openTestDb } from "./helpers.ts";

describe("empleados", () => {
  it("hash no guarda el PIN en claro", async () => {
    const h = await hashPin("1234");
    expect(h).not.toContain("1234");
    expect(await verifyPin("1234", h)).toBe(true);
    expect(await verifyPin("0000", h)).toBe(false);
  });

  it("exigirPin envía con básico", async () => {
    const db = openTestDb();
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const e = await exigirPin(db, "1234", "enviar");
    expect(e.nombre).toBe("Ana");
    db.close();
  });

  it("PIN incorrecto no identifica", async () => {
    const db = openTestDb();
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    await expect(exigirPin(db, "9999", "enviar")).rejects.toMatchObject({ codigo: "pin_invalido" });
    db.close();
  });

  it("mínimo no puede enviar ni precuenta; avanzado sí caja", async () => {
    const db = openTestDb();
    await crearEmpleado(db, { nombre: "Luis", pin: "1111", derecho: "minimo" });
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    await crearEmpleado(db, { nombre: "Jefa", pin: "2222", derecho: "avanzado" });
    await expect(exigirPin(db, "1111", "enviar")).rejects.toMatchObject({ codigo: "sin_derecho" });
    await expect(exigirPin(db, "1111", "precuenta")).rejects.toMatchObject({ codigo: "sin_derecho" });
    await expect(exigirPin(db, "1111", "caja")).rejects.toMatchObject({ codigo: "sin_derecho" });
    await expect(exigirPin(db, "1234", "abrir_sesion")).rejects.toMatchObject({ codigo: "sin_derecho" });
    const j = await exigirPin(db, "2222", "caja");
    expect(j.nombre).toBe("Jefa");
    await expect(exigirPin(db, "1111", "abrir_sesion")).rejects.toMatchObject({ codigo: "sin_derecho" });
    expect((await exigirPin(db, "2222", "abrir_sesion")).nombre).toBe("Jefa");
    await expect(exigirPin(db, "1111", "anular")).rejects.toMatchObject({ codigo: "sin_derecho" });
    await expect(exigirPin(db, "1111", "crear_pedido")).rejects.toMatchObject({ codigo: "sin_derecho" });
    expect((await exigirPin(db, "1234", "anular")).nombre).toBe("Ana");
    expect((await exigirPin(db, "1234", "crear_pedido")).nombre).toBe("Ana");
    db.close();
  });
});
