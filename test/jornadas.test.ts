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

  it("configura turnos y abre el predeterminado elegido", async () => {
    const e = await entornoApi();
    const creado = await post(e.app, "/api/jornadas/turnos", {
      nombre: "Noche",
      horaInicio: "18:00",
      horaFin: "23:30",
      esPredeterminada: true,
    });
    expect(creado.status).toBe(201);
    const turno = (await creado.json() as { turno: { id: number } }).turno;
    await cerrarJornada(e.db, null);
    const abierta = await post(e.app, "/api/jornadas/abrir", { turnoPlantillaId: turno.id });
    expect(abierta.status).toBe(201);
    expect(estadoJornada(e.db).jornada).toMatchObject({ turnoPlantillaId: turno.id, turnoNombre: "Noche" });
    e.db.close();
  });

  it("cierra las cuentas vacías juntas con credenciales autorizadas", async () => {
    const e = await entornoApi();
    const jornada = estadoJornada(e.db).jornada!;
    const jefa = e.db.prepare("SELECT id FROM empleados WHERE usuario='admin'").get() as { id: number };
    e.db.prepare(
      `INSERT INTO cuentas (mesa_id,estado,abierta_por_empleado_id,abierta_en,jornada_id,tipo_servicio)
       VALUES (?,'abierta',?,?,?,'mesa')`,
    ).run(e.ids.mesa7, jefa.id, new Date().toISOString(), jornada.id);
    const respuesta = await post(e.app, "/api/jornadas/cerrar-masivo", { usuario: "admin", password: "admin" });
    if (respuesta.status !== 200) throw new Error(`cierre masivo ${respuesta.status}: ${await respuesta.text()}`);
    const resultado = await respuesta.json() as { cierreMasivo: { cuentasVaciasAnuladasIds: number[] } };
    expect(resultado.cierreMasivo.cuentasVaciasAnuladasIds).toHaveLength(1);
    expect(estadoJornada(e.db).jornada).toBeNull();
    expect((e.db.prepare("SELECT estado FROM cuentas ORDER BY id DESC LIMIT 1").get() as { estado: string }).estado).toBe("cancelada");
    e.db.close();
  });

  it("confirma juntas las órdenes listas antes de cerrar", async () => {
    const e = await entornoApi();
    const orden = await crearOrden(e);
    e.db.prepare("UPDATE comanda_lineas SET etapa='listo',etapa_actualizada_en=? WHERE comanda_id=?")
      .run(new Date().toISOString(), orden.comandaId);
    expect(estadoJornada(e.db).resumen?.ordenesListas).toBe(1);
    const respuesta = await post(e.app, "/api/jornadas/listos/entregar");
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toMatchObject({ ordenesEntregadas: 1 });
    expect(estadoJornada(e.db).resumen?.ordenesListas).toBe(0);
    e.db.close();
  });
});
