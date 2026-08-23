import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { agregarLinea, enviarACocina, guardarNotasPedido } from "../src/modules/pedidos/pedidos.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { abrirMesa } from "../src/modules/salon/salon.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { openTestDb } from "./helpers.ts";

describe("notas de orden", () => {
  it("manda indicaciones y nota de producto a cocina, no la nota privada", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const { pedidoId } = abrirMesa(db, { mesaId: ids.mesa7, cubiertos: 4, preset: "salon", meseroId: 1 });
    agregarLinea(db, pedidoId, { productoId: ids.hamburguesa, cantidad: 1, nota: "sin cebolla" });
    guardarNotasPedido(db, pedidoId, { nota_privada: "cuenta de la empresa", indicaciones: "alergia al maní" });
    const printer = new MemoryPrinter();
    await enviarACocina(db, pedidoId, "1234", printer, defaultConfig());
    const ticket = Buffer.concat(printer.chunks.map((c) => Buffer.from(c))).toString("utf8");
    expect(ticket).toContain("alergia al maní");
    expect(ticket).toContain("sin cebolla");
    expect(ticket).not.toContain("cuenta de la empresa");
    db.close();
  });
});
