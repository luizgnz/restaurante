import { describe, expect, it } from "vitest";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { abrirMesa, estadoMesa, liberarMesa } from "../src/modules/salon/salon.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { openTestDb } from "./helpers.ts";

describe("salon", () => {
  it("abrir mesa 7 la deja ocupada; no se abre dos veces", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    const mesero = await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    expect(estadoMesa(db, ids.mesa7)).toBe("libre");
    const { pedidoId } = abrirMesa(db, { mesaId: ids.mesa7, cubiertos: 4, preset: "salon", meseroId: mesero.id });
    expect(pedidoId).toBeGreaterThan(0);
    expect(estadoMesa(db, ids.mesa7)).toBe("ocupada");
    expect(() => abrirMesa(db, { mesaId: ids.mesa7, cubiertos: 2, preset: "salon", meseroId: mesero.id })).toThrow(/mesa_ocupada/);
    db.close();
  });

  it("liberar mesa con pedido vacío la deja libre", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    const mesero = await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    abrirMesa(db, { mesaId: ids.mesa7, cubiertos: 4, preset: "salon", meseroId: mesero.id });
    liberarMesa(db, ids.mesa7);
    expect(estadoMesa(db, ids.mesa7)).toBe("libre");
    db.close();
  });
});
