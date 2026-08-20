import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { agregarLinea, enviarACocina } from "../src/modules/pedidos/pedidos.ts";
import { emitirPrecuenta, reimprimirPrecuenta } from "../src/modules/precuenta/precuenta.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { abrirMesa } from "../src/modules/salon/salon.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { openTestDb } from "./helpers.ts";

async function pedidoEjemplo(db: ReturnType<typeof openTestDb>, ids: ReturnType<typeof seedCartaDemo>) {
  await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
  const { pedidoId } = abrirMesa(db, { mesaId: ids.mesa7, cubiertos: 4, preset: "salon", meseroId: 1 });
  agregarLinea(db, pedidoId, { productoId: ids.hamburguesa, cantidad: 5 });
  agregarLinea(db, pedidoId, { productoId: ids.jugo, cantidad: 2 });
  agregarLinea(db, pedidoId, { productoId: ids.agua, cantidad: 3 });
  const printer = new MemoryPrinter();
  await enviarACocina(db, pedidoId, "1234", printer, defaultConfig());
  return { pedidoId, printer };
}

describe("precuenta", () => {
  it("emite snapshot 54000, no firma stock, PIN inválido no crea fila", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    const { pedidoId, printer } = await pedidoEjemplo(db, ids);
    await expect(emitirPrecuenta(db, pedidoId, "0000", printer, defaultConfig())).rejects.toMatchObject({
      codigo: "pin_invalido",
    });
    expect(db.prepare("SELECT count(*) AS c FROM precuentas").get() as { c: number }).toEqual({ c: 0 });

    const reservedAntes = (
      db.prepare("SELECT reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as { reserved_real: number }
    ).reserved_real;
    const emitted = await emitirPrecuenta(db, pedidoId, "1234", printer, defaultConfig());
    expect(emitted.numero).toBe(1);
    const snap = JSON.parse(
      (db.prepare("SELECT snapshot_json FROM precuentas WHERE id = ?").get(emitted.precuentaId) as { snapshot_json: string })
        .snapshot_json,
    ) as { totalCentavos: number; leyenda: string };
    expect(snap.totalCentavos).toBe(54000);
    expect(snap.leyenda).toMatch(/no es boleta/i);
    const reservedDespues = (
      db.prepare("SELECT reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as { reserved_real: number }
    ).reserved_real;
    expect(reservedDespues).toBe(reservedAntes);

    const reprint = await reimprimirPrecuenta(db, emitted.precuentaId, printer);
    expect(reprint.numero).toBe(emitted.numero);
    expect(
      (db.prepare("SELECT reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as { reserved_real: number })
        .reserved_real,
    ).toBe(reservedAntes);
    db.close();
  });
});
