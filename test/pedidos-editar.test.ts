import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { avanzarEtapa } from "../src/modules/kds/kds.ts";
import { agregarLinea, cambiarCantidad, enviarACocina, quitarLinea } from "../src/modules/pedidos/pedidos.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { abrirMesa } from "../src/modules/salon/salon.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { openTestDb } from "./helpers.ts";

describe("editar o anular enviado", () => {
  it("con papel no deja anular lo ya enviado; con tablet sí hasta en proceso", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const { pedidoId } = abrirMesa(db, { mesaId: ids.mesa7, cubiertos: 4, preset: "salon", meseroId: 1 });
    const { lineaId } = agregarLinea(db, pedidoId, { productoId: ids.hamburguesa, cantidad: 1 });
    await enviarACocina(db, pedidoId, "1234", new MemoryPrinter(), defaultConfig());

    const papel = { ...defaultConfig(), tablet_cocina: false };
    expect(() => quitarLinea(db, lineaId, papel)).toThrow(/papel|impres/i);

    const tablet = { ...defaultConfig(), tablet_cocina: true };
    quitarLinea(db, lineaId, tablet);
    expect(db.prepare("SELECT estado FROM pedido_lineas WHERE id = ?").get(lineaId)).toMatchObject({
      estado: "anulada_en_cocina",
    });
    db.close();
  });

  it("si cocina marcó en proceso, ya no se cambia", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const { pedidoId } = abrirMesa(db, { mesaId: ids.mesa7, cubiertos: 4, preset: "salon", meseroId: 1 });
    const { lineaId } = agregarLinea(db, pedidoId, { productoId: ids.hamburguesa, cantidad: 1 });
    await enviarACocina(db, pedidoId, "1234", new MemoryPrinter(), defaultConfig());
    const cl = db.prepare("SELECT id FROM comanda_lineas WHERE pedido_linea_id = ?").get(lineaId) as { id: number };
    avanzarEtapa(db, cl.id, "en_proceso");
    expect(() => quitarLinea(db, lineaId, { ...defaultConfig(), tablet_cocina: true })).toThrow(/tomó|proceso/i);
    db.close();
  });

  it("cambia cantidad de una línea nueva; a 0 la anula", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const { pedidoId } = abrirMesa(db, { mesaId: ids.mesa7, cubiertos: 4, preset: "salon", meseroId: 1 });
    const { lineaId } = agregarLinea(db, pedidoId, { productoId: ids.hamburguesa, cantidad: 2 });
    cambiarCantidad(db, lineaId, 5, defaultConfig());
    expect(db.prepare("SELECT cantidad, estado FROM pedido_lineas WHERE id = ?").get(lineaId)).toMatchObject({
      cantidad: 5,
      estado: "nueva",
    });
    cambiarCantidad(db, lineaId, 0, defaultConfig());
    expect(db.prepare("SELECT estado FROM pedido_lineas WHERE id = ?").get(lineaId)).toMatchObject({
      estado: "anulada_antes_de_enviar",
    });
    db.close();
  });

  it("con tablet cambia lo enviado aún no tomado y ajusta reserva; con papel no", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const { pedidoId } = abrirMesa(db, { mesaId: ids.mesa7, cubiertos: 4, preset: "salon", meseroId: 1 });
    const { lineaId } = agregarLinea(db, pedidoId, { productoId: ids.hamburguesa, cantidad: 2 });
    await enviarACocina(db, pedidoId, "1234", new MemoryPrinter(), defaultConfig());
    expect((db.prepare("SELECT reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as { reserved_real: number }).reserved_real).toBe(2);

    expect(() => cambiarCantidad(db, lineaId, 3, { ...defaultConfig(), tablet_cocina: false })).toThrow(/papel|impres/i);

    cambiarCantidad(db, lineaId, 3, { ...defaultConfig(), tablet_cocina: true });
    expect(db.prepare("SELECT cantidad FROM pedido_lineas WHERE id = ?").get(lineaId)).toMatchObject({ cantidad: 3 });
    expect((db.prepare("SELECT reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as { reserved_real: number }).reserved_real).toBe(3);
    db.close();
  });

  it("anular lo enviado encola un ticket de anulación", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const { pedidoId } = abrirMesa(db, { mesaId: ids.mesa7, cubiertos: 4, preset: "salon", meseroId: 1 });
    const { lineaId } = agregarLinea(db, pedidoId, { productoId: ids.hamburguesa, cantidad: 2 });
    await enviarACocina(db, pedidoId, "1234", new MemoryPrinter(), defaultConfig());
    quitarLinea(db, lineaId, { ...defaultConfig(), tablet_cocina: true });
    const job = db.prepare("SELECT kind, payload FROM print_jobs ORDER BY id DESC LIMIT 1").get() as {
      kind: string;
      payload: string;
    };
    expect(job.kind).toBe("anulacion");
    expect(job.payload).toMatch(/Hamburguesa/);
    expect(job.payload).toMatch(/Mesa 7|mesaNumero.:7/);
    db.close();
  });

  it("el flujo legacy no crea correcciones ni comandas del modelo nuevo", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const { pedidoId } = abrirMesa(db, { mesaId: ids.mesa7, cubiertos: 4, preset: "salon", meseroId: 1 });
    const { lineaId } = agregarLinea(db, pedidoId, { productoId: ids.hamburguesa, cantidad: 2 });
    await enviarACocina(db, pedidoId, "1234", new MemoryPrinter(), defaultConfig());

    cambiarCantidad(db, lineaId, 1, { ...defaultConfig(), tablet_cocina: true });
    quitarLinea(db, lineaId, { ...defaultConfig(), tablet_cocina: true });

    expect(db.prepare("SELECT count(*) AS c FROM orden_correcciones").get() as { c: number }).toEqual({ c: 0 });
    expect(db.prepare("SELECT count(*) AS c FROM orden_correccion_lineas").get() as { c: number }).toEqual({ c: 0 });
    expect(db.prepare("SELECT count(*) AS c FROM auditoria_anulaciones").get() as { c: number }).toEqual({ c: 0 });
    expect(db.prepare("SELECT count(*) AS c FROM cuentas").get() as { c: number }).toEqual({ c: 0 });
    const comandas = db.prepare("SELECT tipo, orden_id, correccion_id FROM comandas").all() as {
      tipo: string;
      orden_id: number | null;
      correccion_id: number | null;
    }[];
    expect(comandas).toEqual([{ tipo: "legacy", orden_id: null, correccion_id: null }]);
    const kinds = (db.prepare("SELECT kind FROM print_jobs ORDER BY id").all() as { kind: string }[]).map(
      (j) => j.kind,
    );
    expect(kinds).toEqual(["comanda", "anulacion"]);
    expect(
      (db.prepare("SELECT etapa FROM comanda_lineas WHERE pedido_linea_id = ?").get(lineaId) as { etapa: string })
        .etapa,
    ).toBe("cancelado");
    db.close();
  });
});
