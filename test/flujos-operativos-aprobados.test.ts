import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { createApp } from "../src/http/app.ts";
import { aplicarEntregasAutomaticas, marcarOrdenEntregada } from "../src/modules/cuentas/entregas.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import { cancelarProductoDesdeCocina } from "../src/modules/kds/cancelar-producto.ts";
import { avanzarEtapaDeComanda, tarjetasKds } from "../src/modules/kds/kds.ts";
import { enviarOrden } from "../src/modules/ordenes/enviar.ts";
import { corregirOrden } from "../src/modules/ordenes/correcciones.ts";
import { versionVigenteOrden } from "../src/modules/ordenes/ordenes.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { openTestDb } from "./helpers.ts";

async function escenario(tipoServicio: "mesa" | "para_llevar" = "mesa", conUsuarios = false) {
  const db = openTestDb();
  const ids = seedCartaDemo(db);
  const mesero = await crearEmpleado(db, {
    nombre: "Ana",
    ...(conUsuarios ? { usuario: "ana", password: "clave-segura" } : {}),
    pin: "1234",
    roles: ["mesero"],
  });
  const cocina = await crearEmpleado(db, {
    nombre: "Cocina",
    ...(conUsuarios ? { usuario: "cocina", password: "clave-segura" } : {}),
    pin: "4444",
    roles: ["cocina"],
  });
  const printer = new MemoryPrinter();
  const envio = await enviarOrden(db, {
    mesaId: tipoServicio === "mesa" ? ids.mesa7 : 0,
    tipoServicio,
    clienteNombre: tipoServicio === "para_llevar" ? "Carla" : null,
    empleadoId: mesero.id,
    claveIdempotencia: `orden-${tipoServicio}`,
    lineas: [{ productoId: ids.hamburguesa, cantidad: 1 }],
  }, printer, defaultConfig());
  return { db, ids, mesero, cocina, printer, envio };
}

describe("flujos operativos aprobados", () => {
  it("crea pedidos para llevar numerados, sin exponer la mesa técnica", async () => {
    const e = await escenario("para_llevar");
    const cuenta = e.db.prepare("SELECT tipo_servicio, numero_servicio, cliente_nombre FROM cuentas WHERE id = ?")
      .get(e.envio.cuentaId);
    expect(cuenta).toEqual({ tipo_servicio: "para_llevar", numero_servicio: 1, cliente_nombre: "Carla" });
    expect(tarjetasKds(e.db)[0]).toMatchObject({ tipoServicio: "para_llevar", numeroServicio: 1, clienteNombre: "Carla", referencia: "Para llevar #1 · Orden #1" });
    e.db.close();
  });

  it("Cocina cancela un producto iniciado, devuelve stock y deja auditoría", async () => {
    const e = await escenario();
    avanzarEtapaDeComanda(e.db, e.envio.comandaId, "en_proceso");
    const linea = tarjetasKds(e.db)[0].lineas[0];
    const antes = e.db.prepare("SELECT COALESCE(sum(reserved_real), 0) AS total FROM stock").get() as { total: number };
    const resultado = await cancelarProductoDesdeCocina(e.db, {
      comandaLineaId: linea.id,
      empleadoId: e.cocina.id,
      motivo: "Ingrediente no disponible",
      printer: e.printer,
      config: defaultConfig(),
    });
    expect(resultado.repetida).toBe(false);
    expect(versionVigenteOrden(e.db, e.envio.ordenId)[0].cantidad).toBe(0);
    const despues = e.db.prepare("SELECT COALESCE(sum(reserved_real), 0) AS total FROM stock").get() as { total: number };
    expect(despues.total).toBeLessThan(antes.total);
    expect(e.db.prepare("SELECT motivo FROM cancelaciones_productos_cocina WHERE orden_id = ?").get(e.envio.ordenId))
      .toEqual({ motivo: "Ingrediente no disponible" });
    e.db.close();
  });

  it("la ruta protegida permite cancelar solo desde una sesión de Cocina", async () => {
    const e = await escenario("mesa", true);
    avanzarEtapaDeComanda(e.db, e.envio.comandaId, "en_proceso");
    const linea = tarjetasKds(e.db)[0].lineas[0];
    const app = createApp({
      db: e.db,
      config: defaultConfig(),
      printer: e.printer,
      exigirAutenticacion: true,
    });
    const login = await app.request("/api/sesion/abrir", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usuario: "cocina", password: "clave-segura" }),
    });
    const cookie = login.headers.get("set-cookie")!.split(";", 1)[0];
    const respuesta = await app.request(`/api/kds/lineas/${linea.id}/cancelar`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ motivo: "Ingrediente no disponible" }),
    });
    expect(respuesta.status).toBe(200);
    expect(versionVigenteOrden(e.db, e.envio.ordenId)[0].cantidad).toBe(0);

    const loginMesero = await app.request("/api/sesion/abrir", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usuario: "ana", password: "clave-segura" }),
    });
    const cookieMesero = loginMesero.headers.get("set-cookie")!.split(";", 1)[0];
    const pendientes = await app.request("/api/cocina/actualizaciones", { headers: { cookie: cookieMesero } });
    expect(pendientes.status).toBe(200);
    const actualizaciones = (await pendientes.json()) as { actualizaciones: Array<{ id: number; ordenId: number; producto: string }> };
    expect(actualizaciones.actualizaciones).toEqual([
      expect.objectContaining({ ordenId: e.envio.ordenId, producto: "Hamburguesa" }),
    ]);

    const reconocer = await app.request(`/api/cocina/actualizaciones/${actualizaciones.actualizaciones[0].id}/reconocer`, {
      method: "POST",
      headers: { cookie: cookieMesero },
    });
    expect(reconocer.status).toBe(200);
    const vacias = await app.request("/api/cocina/actualizaciones", { headers: { cookie: cookieMesero } });
    expect((await vacias.json()) as { actualizaciones: unknown[] }).toEqual({ actualizaciones: [] });
    e.db.close();
  });

  it("marca automáticamente como entregada una orden lista al vencer el respaldo", async () => {
    const e = await escenario();
    avanzarEtapaDeComanda(e.db, e.envio.comandaId, "en_proceso");
    avanzarEtapaDeComanda(e.db, e.envio.comandaId, "listo");
    e.db.prepare("UPDATE comanda_lineas SET etapa_actualizada_en = '2026-01-01T00:00:00.000Z' WHERE comanda_id = ?")
      .run(e.envio.comandaId);
    const cfg = { ...defaultConfig(), entrega_automatica_minutos: 30 };
    expect(aplicarEntregasAutomaticas(e.db, cfg)).toBe(1);
    expect(e.db.prepare("SELECT origen FROM entregas_ordenes WHERE orden_id = ?").get(e.envio.ordenId))
      .toEqual({ origen: "automatica" });
    expect(e.db.prepare("SELECT etapa FROM comanda_lineas WHERE comanda_id = ?").get(e.envio.comandaId))
      .toEqual({ etapa: "servido" });
    e.db.close();
  });

  it("un pedido para llevar listo se cierra al marcarlo Retirado", async () => {
    const e = await escenario("para_llevar");
    avanzarEtapaDeComanda(e.db, e.envio.comandaId, "en_proceso");
    avanzarEtapaDeComanda(e.db, e.envio.comandaId, "listo");
    marcarOrdenEntregada(e.db, e.envio.ordenId, e.mesero.id, "retiro");
    expect(e.db.prepare("SELECT estado FROM cuentas WHERE id = ?").get(e.envio.cuentaId)).toEqual({ estado: "en_caja" });
    e.db.close();
  });

  it("un pedido para llevar confirmado solo se anula con Administración o encargado de turno", async () => {
    const e = await escenario("para_llevar");
    const linea = versionVigenteOrden(e.db, e.envio.ordenId)[0];
    const cambio = [{
      lineaClave: linea.lineaClave,
      ordenLineaId: linea.ordenLineaId,
      productoId: linea.productoId,
      cantidad: 0,
      nota: linea.nota,
    }];
    await expect(corregirOrden(e.db, {
      ordenId: e.envio.ordenId,
      lineas: cambio,
      motivo: "Cliente desistió",
      pin: "1234",
      claveIdempotencia: "anular-llevar-mesero",
    }, e.printer, defaultConfig())).rejects.toMatchObject({ codigo: "sin_derecho" });

    await crearEmpleado(e.db, { nombre: "Encargado", pin: "5555", roles: ["encargado_turno"] });
    const resultado = await corregirOrden(e.db, {
      ordenId: e.envio.ordenId,
      lineas: cambio,
      motivo: "Cliente desistió",
      pin: "5555",
      claveIdempotencia: "anular-llevar-encargado",
    }, e.printer, defaultConfig());
    expect(resultado.repetida).toBe(false);
    expect(versionVigenteOrden(e.db, e.envio.ordenId)[0].cantidad).toBe(0);
    e.db.close();
  });
});
