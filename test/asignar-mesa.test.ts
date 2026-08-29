import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { enviarOrden } from "../src/modules/ordenes/enviar.ts";
import { agregarLinea } from "../src/modules/pedidos/pedidos.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { abrirTab, asignarMesa, estadoMesa } from "../src/modules/salon/salon.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { openTestDb } from "./helpers.ts";

describe("asignar mesa después (legacy)", () => {
  it("sienta el pedido legacy en mesa 7 sin alterar el estado derivado de cuentas", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    const mesero = await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const { pedidoId } = abrirTab(db, { cubiertos: 2, preset: "salon", meseroId: mesero.id });
    agregarLinea(db, pedidoId, { productoId: ids.hamburguesa, cantidad: 1 });
    expect(estadoMesa(db, ids.mesa7)).toBe("libre");
    asignarMesa(db, pedidoId, ids.mesa7);
    expect(db.prepare("SELECT mesa_id FROM pedidos WHERE id = ?").get(pedidoId)).toEqual({ mesa_id: ids.mesa7 });
    expect(estadoMesa(db, ids.mesa7)).toBe("libre");
    db.close();
  });

  it("no sienta un pedido legacy en una mesa con cuenta activa", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    const mesero = await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    await enviarOrden(
      db,
      {
        mesaId: ids.mesa7,
        empleadoId: mesero.id,
        claveIdempotencia: "asignar-orden-1",
        lineas: [{ productoId: ids.hamburguesa, cantidad: 1 }],
      },
      new MemoryPrinter(),
      defaultConfig(),
    );
    const { pedidoId } = abrirTab(db, { cubiertos: 2, preset: "salon", meseroId: mesero.id });
    expect(() => asignarMesa(db, pedidoId, ids.mesa7)).toThrow(/mesa_ocupada/);
    db.close();
  });
});
