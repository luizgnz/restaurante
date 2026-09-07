import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { abrirJornada, cerrarJornada, estadoJornada } from "../src/modules/jornadas/jornadas.ts";
import { listarCuentasActivas } from "../src/modules/cuentas/listar.ts";
import { tarjetasKds } from "../src/modules/kds/kds.ts";
import { crearOrden, entornoApi, post } from "./helpers.ts";

describe("jornada operativa", () => {
  it("no permite cerrar con trabajo activo y crea un respaldo al cerrar limpio", async () => {
    const e = await entornoApi();
    const actual = estadoJornada(e.db).jornada;
    expect(actual?.estado).toBe("abierta");
    const orden = await crearOrden(e);

    await expect(cerrarJornada(e.db, null)).rejects.toMatchObject({ codigo: "jornada_con_cuentas" });

    e.db.prepare("UPDATE cuentas SET estado = 'en_caja', cerrada_en = ? WHERE id = ?")
      .run(new Date().toISOString(), orden.cuentaId);
    e.db.prepare("UPDATE comanda_lineas SET etapa = 'servido' WHERE comanda_id = ?").run(orden.comandaId);
    const cierre = await cerrarJornada(e.db, null);

    expect(cierre.jornada.estado).toBe("cerrada");
    expect(existsSync(cierre.respaldoRuta)).toBe(true);
    expect(estadoJornada(e.db).jornada).toBeNull();
    expect(() => abrirJornada(e.db, null)).not.toThrow();
    expect(listarCuentasActivas(e.db)).toEqual([]);
    expect(tarjetasKds(e.db)).toEqual([]);
    e.db.close();
  });

  it("filtra la jornada anterior y acepta órdenes solo en la jornada abierta", async () => {
    const e = await entornoApi();
    const anterior = await crearOrden(e);
    e.db.prepare("UPDATE cuentas SET estado = 'en_caja', cerrada_en = ? WHERE id = ?")
      .run(new Date().toISOString(), anterior.cuentaId);
    e.db.prepare("UPDATE comanda_lineas SET etapa = 'servido' WHERE comanda_id = ?").run(anterior.comandaId);
    await cerrarJornada(e.db, null);

    const cerrada = await post(e.app, "/api/ordenes", {
      mesaId: e.ids.mesa7,
      claveIdempotencia: "sin-jornada",
      pin: "1234",
      lineas: [{ productoId: e.ids.jugo, cantidad: 1 }],
    });
    expect(cerrada.status).toBe(409);

    abrirJornada(e.db, null);
    await crearOrden(e, { claveIdempotencia: "jornada-nueva" });
    expect(listarCuentasActivas(e.db)).toHaveLength(1);
    expect(tarjetasKds(e.db)).toHaveLength(1);
    expect((e.db.prepare("SELECT COUNT(*) AS n FROM comandas").get() as { n: number }).n).toBe(2);
    e.db.close();
  });

  it("reinicia el demo por la API, conserva maestros y deja auditoría", async () => {
    const e = await entornoApi();
    await crearOrden(e);
    const productosAntes = (e.db.prepare("SELECT COUNT(*) AS n FROM productos").get() as { n: number }).n;

    const respuesta = await post(e.app, "/api/jornadas/demo/reiniciar");
    expect(respuesta.status).toBe(200);
    const body = await respuesta.json() as { cuentas: number; jornadaId: number; respaldoRuta: string };

    expect(body.cuentas).toBe(8);
    expect(existsSync(body.respaldoRuta)).toBe(true);
    expect(listarCuentasActivas(e.db)).toHaveLength(8);
    expect(tarjetasKds(e.db)).toHaveLength(8);
    expect((e.db.prepare("SELECT COUNT(*) AS n FROM productos").get() as { n: number }).n).toBe(productosAntes);
    expect((e.db.prepare("SELECT COUNT(*) AS n FROM jornada_eventos WHERE tipo = 'reinicio_demo'").get() as { n: number }).n).toBe(1);
    expect((e.db.prepare("SELECT COUNT(*) AS n FROM precuentas WHERE vigente = 1").get() as { n: number }).n).toBe(1);
    e.db.close();
  });

  it("puede reiniciar el demo aunque la jornada anterior ya esté cerrada", async () => {
    const e = await entornoApi();
    await cerrarJornada(e.db, null);

    const respuesta = await post(e.app, "/api/jornadas/demo/reiniciar");

    expect(respuesta.status).toBe(200);
    expect(estadoJornada(e.db).jornada?.estado).toBe("abierta");
    expect(listarCuentasActivas(e.db)).toHaveLength(8);
    e.db.close();
  });
});
