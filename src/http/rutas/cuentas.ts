import type Database from "better-sqlite3";
import { Hono } from "hono";
import { idDeRuta, leerJson, pinOpcional, protegido, textoOpcional, type RutasDeps } from "../entrada.ts";
import { crearOrdenDeMesa, type CuerpoOrden } from "./ordenes.ts";
import { enviarCuentaACaja, quienCobra } from "../../modules/caja/caja.ts";
import { actualizarNotaPrivadaCuenta, CuentaError, obtenerCuenta } from "../../modules/cuentas/cuentas.ts";
import { PinError } from "../../modules/empleados/empleados.ts";
import { sesionAbierta } from "../../modules/empleados/sesion.ts";
import { totalEfectivoCuenta } from "../../modules/cuentas/totales.ts";
import { OrdenError } from "../../modules/ordenes/enviar.ts";
import { emitirPrecuentaCuenta, quienEmite } from "../../modules/precuenta/precuenta.ts";

/**
 * La mesa de una cuenta que todavía acepta consumo.
 *
 * `enviarOrden` resuelve la cuenta activa **por mesa**, así que sin esta guarda
 * pedir una orden sobre una cuenta ya cobrada abriría una cuenta nueva en la
 * misma mesa y respondería 201 como si nada hubiera pasado.
 */
function mesaDeCuentaActiva(db: Database.Database, cuentaId: number): number {
  const cuenta = db.prepare("SELECT mesa_id, estado FROM cuentas WHERE id = ?").get(cuentaId) as
    | { mesa_id: number; estado: string }
    | undefined;
  if (!cuenta) throw new CuentaError("cuenta_inexistente", "Cuenta inexistente");
  if (cuenta.estado !== "abierta" && cuenta.estado !== "precuenta_emitida") {
    throw new OrdenError("cuenta_cerrada", "La cuenta ya no acepta órdenes");
  }
  return cuenta.mesa_id;
}

export function rutasCuentas(deps: RutasDeps): Hono {
  const { db, config, printer } = deps;
  const rutas = new Hono();

  rutas.get("/:id", (c) => {
    const cuentaId = idDeRuta(c);
    const cuenta = obtenerCuenta(db, cuentaId);
    return c.json({ ...cuenta, totalCentavos: totalEfectivoCuenta(db, cuentaId) });
  });

  rutas.post("/:id/nota-privada", async (c) => {
    if (!sesionAbierta(db)) throw new PinError("credenciales_invalidas", "Hace falta sesión");
    const cuentaId = idDeRuta(c);
    const cuerpo = await leerJson<{ notaPrivada: unknown }>(c);
    const notaPrivada = textoOpcional(cuerpo.notaPrivada) ?? null;
    return c.json({ notaPrivada: actualizarNotaPrivadaCuenta(db, cuentaId, notaPrivada) });
  });

  rutas.post("/:id/ordenes", async (c) => {
    const cuentaId = idDeRuta(c);
    const cuerpo = await leerJson<CuerpoOrden>(c);
    const { cuerpo: salida, status } = await crearOrdenDeMesa(deps, cuerpo, () =>
      mesaDeCuentaActiva(db, cuentaId),
    );
    return c.json(salida, status);
  });

  rutas.post("/:id/precuenta", async (c) => {
    const cuentaId = idDeRuta(c);
    const pin = pinOpcional((await leerJson<{ pin: unknown }>(c)).pin);
    const emitida = await protegido(
      () => quienEmite(db, pin),
      () => emitirPrecuentaCuenta(db, cuentaId, pin, printer, config),
    );
    return c.json(emitida, 201);
  });

  rutas.post("/:id/enviar-caja", async (c) => {
    const cuentaId = idDeRuta(c);
    const pin = pinOpcional((await leerJson<{ pin: unknown }>(c)).pin);
    const handoff = await protegido(
      () => quienCobra(db, pin, config),
      () => enviarCuentaACaja(db, cuentaId, pin, config),
    );
    return c.json(handoff, 201);
  });

  return rutas;
}
