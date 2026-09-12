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
  SolicitudError,
  textoOpcional,
  type RutasDeps,
} from "../entrada.ts";
import { corregirOrden, type ResultadoCorreccion } from "../../modules/ordenes/correcciones.ts";
import { enviarOrden, type ResultadoEnvio } from "../../modules/ordenes/enviar.ts";
import { versionVigenteOrden } from "../../modules/ordenes/ordenes.ts";

/** Un envío nuevo devuelve 201; un reintento con la misma clave, 200. */
function respuestaEnvio(db: Database.Database, envio: ResultadoEnvio) {
  const orden = db.prepare(
    `SELECT cu.tipo_servicio, cu.numero_servicio, cu.cliente_nombre
     FROM ordenes o JOIN cuentas cu ON cu.id = o.cuenta_id WHERE o.id = ?`,
  ).get(envio.ordenId) as { tipo_servicio: "mesa" | "para_llevar"; numero_servicio: number | null; cliente_nombre: string | null };
  return {
    cuerpo: {
      cuentaId: envio.cuentaId,
      ordenId: envio.ordenId,
      ordenNumero: envio.ordenId,
      comandaId: envio.comandaId,
      repetida: envio.repetida,
      avisos: envio.avisos,
      mesero: envio.mesero,
      tipoServicio: orden.tipo_servicio,
      numeroServicio: orden.numero_servicio,
      clienteNombre: orden.cliente_nombre,
    },
    status: (envio.repetida ? 200 : 201) as 200 | 201,
  };
}

function respuestaCorreccion(correccion: ResultadoCorreccion) {
  return { cuerpo: correccion, status: (correccion.repetida ? 200 : 201) as 200 | 201 };
}

export type CuerpoOrden = {
  mesaId: unknown;
  tipoServicio?: unknown;
  clienteNombre?: unknown;
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
  permitirParaLlevar = false,
): Promise<{ cuerpo: object; status: 200 | 201 }> {
  const clave = claveIdempotencia(cuerpo.claveIdempotencia);
  const lineas = lineasNuevas(cuerpo.lineas);
  const indicaciones = textoOpcional(cuerpo.indicaciones) ?? null;
  const pin = pinOpcional(cuerpo.pin);
  const mesero = await meseroDeOrden(deps.db, deps.config, pin);
  const tipoServicio = permitirParaLlevar && cuerpo.tipoServicio === "para_llevar" ? "para_llevar" : "mesa";
  if (
    permitirParaLlevar &&
    cuerpo.tipoServicio !== undefined &&
    cuerpo.tipoServicio !== "mesa" &&
    cuerpo.tipoServicio !== "para_llevar"
  ) {
    throw new SolicitudError("tipo_servicio_invalido", "Tipo de servicio inválido");
  }
  const envio = await enviarOrden(
    deps.db,
    {
      mesaId: tipoServicio === "mesa" ? resolverMesa() : 0,
      tipoServicio,
      clienteNombre: typeof cuerpo.clienteNombre === "string" ? cuerpo.clienteNombre : null,
      lineas,
      indicaciones,
      claveIdempotencia: clave,
      empleadoId: mesero.id,
    },
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
    const tipoServicio = cuerpo.tipoServicio === "para_llevar" ? "para_llevar" : "mesa";
    const mesaId = tipoServicio === "mesa"
      ? enteroPositivo(cuerpo.mesaId, "mesa_invalida", "Hace falta una mesa válida")
      : 0;
    const { cuerpo: salida, status } = await crearOrdenDeMesa(deps, cuerpo, () => mesaId, true);
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
   * Anular es la corrección que deja todas las cantidades vigentes en cero. Se
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
    const lineas = versionVigenteOrden(db, ordenId).map((linea) => ({
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
