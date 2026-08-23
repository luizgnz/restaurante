import { Hono } from "hono";
import { leerJson, SolicitudError, type RutasDeps } from "../entrada.ts";
import { crearGrupo, crearVariante, listarContornos } from "../../modules/contornos/contornos.ts";

export function rutasContornos(deps: RutasDeps): Hono {
  const { db } = deps;
  const rutas = new Hono();

  rutas.get("/", (c) => c.json(listarContornos(db)));

  rutas.post("/grupos", async (c) => {
    const body = await leerJson<{ nombre: unknown }>(c);
    if (typeof body.nombre !== "string") throw new SolicitudError("nombre_requerido", "Hace falta el nombre");
    return c.json(crearGrupo(db, { nombre: body.nombre }), 201);
  });

  rutas.post("/variantes", async (c) => {
    const body = await leerJson<{
      grupoId: unknown;
      nombre: unknown;
      suplementoCentavos: unknown;
      extraCentavos: unknown;
    }>(c);
    if (typeof body.grupoId !== "number" || !Number.isInteger(body.grupoId)) {
      throw new SolicitudError("grupo_requerido", "Hace falta el grupo");
    }
    if (typeof body.nombre !== "string") throw new SolicitudError("nombre_requerido", "Hace falta el nombre");
    const suplementoCentavos = typeof body.suplementoCentavos === "number" ? body.suplementoCentavos : 0;
    const extraCentavos = typeof body.extraCentavos === "number" ? body.extraCentavos : 0;
    const creada = crearVariante(db, { grupoId: body.grupoId, nombre: body.nombre, suplementoCentavos, extraCentavos });
    return c.json(creada, 201);
  });

  return rutas;
}
