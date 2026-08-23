import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { agregarLinea, enviarACocina, listarPedidosEnCurso } from "../src/modules/pedidos/pedidos.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { abrirTab, asignarMesa, borradorSinMesa, limpiarPedidosSinMesa } from "../src/modules/salon/salon.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { openTestDb } from "./helpers.ts";

describe("pedidos sin mesa", () => {
  it("solo hay un borrador sin mesa: abrir otra vez reusa el mismo", async () => {
    const db = openTestDb();
    seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const uno = abrirTab(db, { cubiertos: 1, preset: "salon", meseroId: 1 });
    const dos = abrirTab(db, { cubiertos: 1, preset: "salon", meseroId: 1 });
    expect(dos.pedidoId).toBe(uno.pedidoId);
    const sinMesa = db.prepare("SELECT count(*) AS c FROM pedidos WHERE mesa_id IS NULL").get() as { c: number };
    expect(sinMesa.c).toBe(1);
    db.close();
  });

  it("al asignar mesa el borrador queda libre para una orden nueva", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const primero = abrirTab(db, { cubiertos: 1, preset: "salon", meseroId: 1 });
    asignarMesa(db, primero.pedidoId, ids.mesa7);
    expect(borradorSinMesa(db)).toBeNull();
    const segundo = abrirTab(db, { cubiertos: 1, preset: "salon", meseroId: 1 });
    expect(segundo.pedidoId).not.toBe(primero.pedidoId);
    db.close();
  });

  it("enviar a cocina saca la orden del borrador sin mesa", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const { pedidoId } = abrirTab(db, { cubiertos: 1, preset: "salon", meseroId: 1 });
    agregarLinea(db, pedidoId, { productoId: ids.hamburguesa, cantidad: 1 });
    await enviarACocina(db, pedidoId, "1234", new MemoryPrinter(), defaultConfig());
    expect(borradorSinMesa(db)).toBeNull();
    const lista = listarPedidosEnCurso(db, defaultConfig());
    expect(lista.find((p) => p.id === pedidoId)?.estado).toBe("enviado");
    db.close();
  });

  it("limpia los borradores vacíos sin mesa y deja uno", async () => {
    const db = openTestDb();
    seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const insertar = db.prepare(
      "INSERT INTO pedidos (mesa_id, preset, cubiertos, estado, mesero_id, abierto_en) VALUES (NULL, 'salon', 1, 'borrador', 1, ?)",
    );
    for (let i = 0; i < 4; i += 1) insertar.run(new Date().toISOString());
    expect(limpiarPedidosSinMesa(db)).toBe(3);
    const quedan = db.prepare("SELECT count(*) AS c FROM pedidos WHERE mesa_id IS NULL").get() as { c: number };
    expect(quedan.c).toBe(1);
    db.close();
  });

  it("no borra un pedido sin mesa que ya tiene productos", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const conProductos = abrirTab(db, { cubiertos: 1, preset: "salon", meseroId: 1 });
    agregarLinea(db, conProductos.pedidoId, { productoId: ids.hamburguesa, cantidad: 1 });
    db.prepare(
      "INSERT INTO pedidos (mesa_id, preset, cubiertos, estado, mesero_id, abierto_en) VALUES (NULL, 'salon', 1, 'borrador', 1, ?)",
    ).run(new Date().toISOString());
    limpiarPedidosSinMesa(db);
    const vive = db.prepare("SELECT id FROM pedidos WHERE id = ?").get(conProductos.pedidoId);
    expect(vive).toBeTruthy();
    db.close();
  });
});
