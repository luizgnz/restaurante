import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { agregarLinea, enviarACocina } from "../src/modules/pedidos/pedidos.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { abrirMesa } from "../src/modules/salon/salon.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { openTestDb } from "./helpers.ts";

describe("enviar a cocina", () => {
  it("mesa 7: 5 hamburguesas 2 jugos 3 aguas, PIN envía KDS y job; PIN malo no", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const { pedidoId } = abrirMesa(db, { mesaId: ids.mesa7, cubiertos: 4, preset: "salon", meseroId: 1 });
    agregarLinea(db, pedidoId, { productoId: ids.hamburguesa, cantidad: 5 });
    agregarLinea(db, pedidoId, { productoId: ids.jugo, cantidad: 2 });
    agregarLinea(db, pedidoId, { productoId: ids.agua, cantidad: 3 });

    const printer = new MemoryPrinter();
    await expect(enviarACocina(db, pedidoId, "0000", printer, defaultConfig())).rejects.toMatchObject({
      codigo: "pin_invalido",
    });
    expect(db.prepare("SELECT count(*) AS c FROM comandas").get() as { c: number }).toEqual({ c: 0 });
    expect(db.prepare("SELECT reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as { reserved_real: number }).toEqual(
      { reserved_real: 0 },
    );

    const result = await enviarACocina(db, pedidoId, "1234", printer, defaultConfig());
    expect(result.comandaId).toBeGreaterThan(0);
    expect(result.jobId).toBeGreaterThan(0);
    expect(db.prepare("SELECT count(*) AS c FROM comandas").get() as { c: number }).toEqual({ c: 1 });
    expect(db.prepare("SELECT etapa FROM comanda_lineas").all() as { etapa: string }[]).toEqual(
      expect.arrayContaining([{ etapa: "por_preparar" }]),
    );
    expect((db.prepare("SELECT reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as { reserved_real: number }).reserved_real).toBe(5);
    const ticket = Buffer.concat(printer.chunks.map((c) => Buffer.from(c))).toString("utf8");
    expect(ticket).toContain("Mesa 7");
    expect(ticket).toContain("Ana");
    expect(ticket).toContain("Hamburguesa");
    db.close();
  });

  it("impresora caída: comanda existe y job en cola", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const { pedidoId } = abrirMesa(db, { mesaId: ids.mesa7, cubiertos: 4, preset: "salon", meseroId: 1 });
    agregarLinea(db, pedidoId, { productoId: ids.hamburguesa, cantidad: 1 });
    const printer = new MemoryPrinter();
    printer.fail = true;
    await enviarACocina(db, pedidoId, "1234", printer, defaultConfig());
    const job = db.prepare("SELECT status, attempts, kind FROM print_jobs").get() as {
      status: string;
      attempts: number;
      kind: string;
    };
    expect(job.kind).toBe("comanda");
    expect(["queued", "failed"]).toContain(job.status);
    expect(job.attempts).toBeGreaterThanOrEqual(1);
    expect(db.prepare("SELECT count(*) AS c FROM comandas").get() as { c: number }).toEqual({ c: 1 });
    db.close();
  });
});
