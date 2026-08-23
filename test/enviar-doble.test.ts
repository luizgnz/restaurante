import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { createApp } from "../src/http/app.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { enviarOrden } from "../src/modules/ordenes/enviar.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { openTestDb } from "./helpers.ts";

describe("enviar una orden con productos", () => {
  it("el primer envío pasa y el segundo avisa que no queda nada nuevo", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const app = createApp({ db, config: defaultConfig(), printer: new MemoryPrinter() });

    const abrir = await app.request(`/api/mesas/${ids.mesa7}/abrir`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cubiertos: 4, pin: "1234" }),
    });
    const { pedidoId } = (await abrir.json()) as { pedidoId: number };
    await app.request(`/api/pedidos/${pedidoId}/lineas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productoId: ids.hamburguesa, cantidad: 2 }),
    });

    const primero = await app.request(`/api/pedidos/${pedidoId}/enviar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "1234" }),
    });
    expect(primero.status).toBe(200);

    const segundo = await app.request(`/api/pedidos/${pedidoId}/enviar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "1234" }),
    });
    expect(segundo.status).toBe(400);
    const error = (await segundo.json()) as { error: string; codigo: string };
    expect(error.codigo).toBe("sin_lineas_nuevas");
    expect(error.error).toMatch(/productos nuevos/i);
    db.close();
  });
});

describe("idempotencia de enviarOrden", () => {
  it("repite la misma claveIdempotencia sin crear filas ni jobs", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const printer = new MemoryPrinter();
    const cfg = defaultConfig();
    const input = {
      mesaId: ids.mesa7,
      empleadoId: 1,
      claveIdempotencia: "mismo-uuid",
      lineas: [{ productoId: ids.hamburguesa, cantidad: 2 }],
    };

    const primero = await enviarOrden(db, input, printer, cfg);
    const jobsTrasPrimero = db.prepare("SELECT count(*) AS c FROM print_jobs").get() as { c: number };
    const comandasTrasPrimero = db.prepare("SELECT count(*) AS c FROM comandas").get() as { c: number };
    const panTrasPrimero = db.prepare("SELECT reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as {
      reserved_real: number;
    };
    const chunksTrasPrimero = printer.chunks.length;

    const segundo = await enviarOrden(db, input, printer, cfg);

    expect(segundo).toEqual({ ...primero, repetida: true });
    expect(segundo.repetida).toBe(true);
    expect(db.prepare("SELECT count(*) AS c FROM cuentas").get() as { c: number }).toEqual({ c: 1 });
    expect(db.prepare("SELECT count(*) AS c FROM ordenes").get() as { c: number }).toEqual({ c: 1 });
    expect(db.prepare("SELECT count(*) AS c FROM orden_lineas").get() as { c: number }).toEqual({ c: 1 });
    expect(db.prepare("SELECT count(*) AS c FROM comandas").get() as { c: number }).toEqual({
      c: comandasTrasPrimero.c,
    });
    expect(db.prepare("SELECT count(*) AS c FROM print_jobs").get() as { c: number }).toEqual({
      c: jobsTrasPrimero.c,
    });
    expect(
      (db.prepare("SELECT reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as { reserved_real: number })
        .reserved_real,
    ).toBe(panTrasPrimero.reserved_real);
    expect(printer.chunks.length).toBe(chunksTrasPrimero);
    expect(jobsTrasPrimero.c).toBe(1);
    db.close();
  });

  it("reintenta el job encolado si la impresora falló en el primer envío", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const printer = new MemoryPrinter();
    printer.fail = true;
    const input = {
      mesaId: ids.mesa7,
      empleadoId: 1,
      claveIdempotencia: "reintento-impresora",
      lineas: [{ productoId: ids.hamburguesa, cantidad: 1 }],
    };

    const primero = await enviarOrden(db, input, printer, defaultConfig());
    expect(primero.repetida).toBe(false);
    expect(printer.chunks).toHaveLength(0);
    const jobTrasFallo = db.prepare("SELECT id, status FROM print_jobs").all() as { id: number; status: string }[];
    expect(jobTrasFallo).toHaveLength(1);
    expect(jobTrasFallo[0].status).toBe("queued");

    printer.fail = false;
    const segundo = await enviarOrden(db, input, printer, defaultConfig());
    expect(segundo).toEqual({ ...primero, repetida: true });
    expect(db.prepare("SELECT count(*) AS c FROM print_jobs").get() as { c: number }).toEqual({ c: 1 });
    expect(db.prepare("SELECT count(*) AS c FROM ordenes").get() as { c: number }).toEqual({ c: 1 });
    const job = db.prepare("SELECT status FROM print_jobs WHERE id = ?").get(jobTrasFallo[0].id) as { status: string };
    expect(job.status).toBe("sent");
    expect(printer.chunks).toHaveLength(1);
    expect(Buffer.concat(printer.chunks.map((c) => Buffer.from(c))).toString("utf8")).toContain(
      "COMANDA\nMesa 7 · Orden 1\nMesero: Ana",
    );
    db.close();
  });
});
