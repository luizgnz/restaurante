import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { enviarACaja } from "../src/modules/caja/caja.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { agregarLinea, enviarACocina } from "../src/modules/pedidos/pedidos.ts";
import { emitirPrecuenta } from "../src/modules/precuenta/precuenta.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { abrirMesa, estadoMesa } from "../src/modules/salon/salon.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { openTestDb } from "./helpers.ts";

describe("circuito mesa 7", () => {
  it("5 hamburguesas, 2 jugos, 3 aguas → precuenta 54000 → caja y mesa libre", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    await crearEmpleado(db, { nombre: "Jefa", pin: "2222", derecho: "avanzado" });
    const printer = new MemoryPrinter();
    const { pedidoId } = abrirMesa(db, { mesaId: ids.mesa7, cubiertos: 4, preset: "salon", meseroId: 1 });
    agregarLinea(db, pedidoId, { productoId: ids.hamburguesa, cantidad: 5 });
    agregarLinea(db, pedidoId, { productoId: ids.jugo, cantidad: 2 });
    agregarLinea(db, pedidoId, { productoId: ids.agua, cantidad: 3 });
    await enviarACocina(db, pedidoId, "1234", printer, defaultConfig());
    const pre = await emitirPrecuenta(db, pedidoId, "1234", printer, defaultConfig());
    expect(pre.totalCentavos).toBe(54000);
    await enviarACaja(db, pedidoId, "2222", defaultConfig());
    expect(estadoMesa(db, ids.mesa7)).toBe("libre");
    const pan = db.prepare("SELECT on_hand_real, reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as {
      on_hand_real: number;
      reserved_real: number;
    };
    expect(pan.on_hand_real).toBe(15);
    expect(pan.reserved_real).toBe(0);
    db.close();
  });
});
