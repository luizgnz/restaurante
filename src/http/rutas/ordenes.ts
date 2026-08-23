import type Database from "better-sqlite3";
import { Hono } from "hono";
import {
  cambiosDeLinea,
  claveIdempotencia,
  enteroPositivo,
  idDeRuta,
  leerJson,
  lineasNuevas,
  meseroDeOrden,
  pinOpcional,
  textoOpcional,
  type RutasDeps,
} from "../entrada.ts";
import { corregirOrden, type ResultadoCorreccion } from "../../modules/ordenes/correcciones.ts";
import { enviarOrden, type ResultadoEnvio } from "../../modules/ordenes/enviar.ts";
import { versionEfectivaOrden } from "../../modules/ordenes/ordenes.ts";

/** Un envío nuevo devuelve 201; un reintento con la misma clave, 200. */
function respuestaEnvio(db: Database.Database, envio: ResultadoEnvio) {
  const orden = db.prepare("SELECT numero FROM ordenes WHERE id = ?").get(envio.ordenId) as { numero: number };
  return {
    cuerpo: {
      cuentaId: envio.cuentaId,
      ordenId: envio.ordenId,
      ordenNumero: orden.numero,
      comandaId: envio.comandaId,
      repetida: envio.repetida,
    },
    status: (envio.repetida ? 200 : 201) as 200 | 201,
  };
}

function respuestaCorreccion(correccion: ResultadoCorreccion) {
  return { cuerpo: correccion, status: (correccion.repetida ? 200 : 201) as 200 | 201 };
}

export type CuerpoOrden = {
  mesaId: unknown;
  claveIdempotencia: unknown;
  pin: unknown;
  lineas: unknown;
  indicaciones: unknown;
};

type CuerpoCorreccion = {
  claveIdempotencia: unknown;
  pin: unknown;
  lineas: unknown;
  indicaciones: unknown;
  motivo: unknown;
};

/**
 * Crea la orden de una mesa sobre su cuenta activa, la que ya exista o la que
 * nazca con el envío. Se comparte con `POST /api/cuentas/:id/ordenes`.
 *
 * `resolverMesa` se llama **después** de autorizar, no antes: cuando la mesa se
 * deduce de una cuenta, mirarla primero le diría a cualquiera qué ids de cuenta
 * existen y en qué estado están.
 */
export async function crearOrdenDeMesa(
  deps: RutasDeps,
  cuerpo: Partial<CuerpoOrden>,
  resolverMesa: () => number,
): Promise<{ cuerpo: object; status: 200 | 201 }> {
  const clave = claveIdempotencia(cuerpo.claveIdempotencia);
  const lineas = lineasNuevas(cuerpo.lineas);
  const indicaciones = textoOpcional(cuerpo.indicaciones) ?? null;
  const pin = pinOpcional(cuerpo.pin);
  const mesero = await meseroDeOrden(deps.db, deps.config, pin);
  const envio = await enviarOrden(
    deps.db,
    { mesaId: resolverMesa(), lineas, indicaciones, claveIdempotencia: clave, empleadoId: mesero.id },
    deps.printer,
    deps.config,
  );
  return respuestaEnvio(deps.db, envio);
}

export function rutasOrdenes(deps: RutasDeps): Hono {
  const { db, config, printer } = deps;
  const rutas = new Hono();

  rutas.post("/", async (c) => {
    const cuerpo = await leerJson<CuerpoOrden>(c);
    const mesaId = enteroPositivo(cuerpo.mesaId, "mesa_invalida", "Hace falta una mesa válida");
    const { cuerpo: salida, status } = await crearOrdenDeMesa(deps, cuerpo, () => mesaId);
    return c.json(salida, status);
  });

  rutas.post("/:id/correcciones", async (c) => {
    const ordenId = idDeRuta(c);
    const cuerpo = await leerJson<CuerpoCorreccion>(c);
    const correccion = await corregirOrden(
      db,
      {
        ordenId,
        lineas: cambiosDeLinea(cuerpo.lineas),
        indicaciones: textoOpcional(cuerpo.indicaciones),
        motivo: textoOpcional(cuerpo.motivo),
        claveIdempotencia: claveIdempotencia(cuerpo.claveIdempotencia),
        pin: pinOpcional(cuerpo.pin) ?? "",
      },
      printer,
      config,
    );
    const { cuerpo: salida, status } = respuestaCorreccion(correccion);
    return c.json(salida, status);
  });

  /**
   * Anular es la corrección que deja todas las cantidades efectivas en cero. Se
   * arma desde la versión vigente, no desde el envío original: lo que se anula
   * es lo que el cliente tiene delante.
   *
   * Las notas se repiten tal cual para que la corrección registre solo el cambio
   * de cantidad; mandarlas vacías las borraría de la historia.
   *
   * Si la orden no existe, la lista sale vacía y el rechazo lo da el servicio
   * después de validar el PIN: adelantarse acá delataría qué ids existen.
   */
  rutas.post("/:id/anular", async (c) => {
    const ordenId = idDeRuta(c);
    const cuerpo = await leerJson<CuerpoCorreccion>(c);
    const clave = claveIdempotencia(cuerpo.claveIdempotencia);
    const lineas = versionEfectivaOrden(db, ordenId).map((linea) => ({
      lineaClave: linea.lineaClave,
      productoId: linea.productoId,
      ordenLineaId: linea.ordenLineaId,
      cantidad: 0,
      nota: linea.nota,
    }));
    const correccion = await corregirOrden(
      db,
      { ordenId, lineas, motivo: textoOpcional(cuerpo.motivo), claveIdempotencia: clave, pin: pinOpcional(cuerpo.pin) ?? "" },
      printer,
      config,
    );
    const { cuerpo: salida, status } = respuestaCorreccion(correccion);
    return c.json(salida, status);
  });

  return rutas;
}
