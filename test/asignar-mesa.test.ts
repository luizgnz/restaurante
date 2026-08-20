import { describe, expect, it } from "vitest";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { agregarLinea } from "../src/modules/pedidos/pedidos.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { abrirMesa, abrirTab, asignarMesa, estadoMesa } from "../src/modules/salon/salon.ts";
import { openTestDb } from "./helpers.ts";

describe("asignar mesa después", () => {
  it("pedido sin mesa luego se sienta en mesa 7", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    const mesero = await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const { pedidoId } = abrirTab(db, { cubiertos: 2, preset: "salon", meseroId: mesero.id });
    agregarLinea(db, pedidoId, { productoId: ids.hamburguesa, cantidad: 1 });
    expect(estadoMesa(db, ids.mesa7)).toBe("libre");
    asignarMesa(db, pedidoId, ids.mesa7);
    expect(estadoMesa(db, ids.mesa7)).toBe("ocupada");
    expect(db.prepare("SELECT mesa_id FROM pedidos WHERE id = ?").get(pedidoId)).toEqual({ mesa_id: ids.mesa7 });
    db.close();
  });
});
