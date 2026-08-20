import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { enviarACaja } from "../src/modules/caja/caja.ts";
import { agregarLinea, enviarACocina } from "../src/modules/pedidos/pedidos.ts";
import { emitirPrecuenta } from "../src/modules/precuenta/precuenta.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { abrirMesa, estadoMesa } from "../src/modules/salon/salon.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { openTestDb } from "./helpers.ts";

describe("enviar a caja", () => {
  it("básico no puede; avanzado firma stock, libera mesa y no se reenvía", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    await crearEmpleado(db, { nombre: "Jefa", pin: "2222", derecho: "avanzado" });
    const { pedidoId } = abrirMesa(db, { mesaId: ids.mesa7, cubiertos: 4, preset: "salon", meseroId: 1 });
    agregarLinea(db, pedidoId, { productoId: ids.hamburguesa, cantidad: 5 });
    const printer = new MemoryPrinter();
    await enviarACocina(db, pedidoId, "1234", printer, defaultConfig());

    await expect(enviarACaja(db, pedidoId, "2222", defaultConfig())).rejects.toMatchObject({
      codigo: "precuenta_requerida",
    });
    await emitirPrecuenta(db, pedidoId, "1234", printer, defaultConfig());

    await expect(enviarACaja(db, pedidoId, "1234", defaultConfig())).rejects.toMatchObject({ codigo: "sin_derecho" });

    await enviarACaja(db, pedidoId, "2222", defaultConfig());
    const pan = db.prepare("SELECT on_hand_real, reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as {
      on_hand_real: number;
      reserved_real: number;
    };
    expect(pan.on_hand_real).toBe(15);
    expect(pan.reserved_real).toBe(0);
    expect(estadoMesa(db, ids.mesa7)).toBe("libre");
    expect(db.prepare("SELECT estado FROM pedidos WHERE id = ?").get(pedidoId) as { estado: string }).toEqual({
      estado: "en_caja",
    });
    await expect(enviarACaja(db, pedidoId, "2222", defaultConfig())).rejects.toMatchObject({ codigo: "pedido_cerrado" });
    db.close();
  });
});
