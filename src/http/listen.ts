import { serve } from "@hono/node-server";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

export type FetchFn = (request: Request) => Response | Promise<Response>;

export type Escucha = {
  server: Server;
  puerto: number;
  mensaje: string;
};

export function urlLocal(puerto: number): string {
  return `http://127.0.0.1:${puerto}`;
}

export function urlParaAbrir(enlazado: { puerto: number }): string {
  return urlLocal(enlazado.puerto);
}

export function mensajeArranque(puertoUsado: number, puertoPedido: number): string {
  if (puertoUsado === puertoPedido) {
    return `Restaurante en ${urlLocal(puertoUsado)}`;
  }
  return `Restaurante en ${urlLocal(puertoUsado)} (el ${puertoPedido} estaba ocupado por otro programa)`;
}

function esPuertoOcupado(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && err.code === "EADDRINUSE");
}

function enlazarUnaVez(fetch: FetchFn, puerto: number, hostname: string): Promise<{ server: Server; puerto: number }> {
  return new Promise((resolve, reject) => {
    let resuelto = false;
    const server = serve({ fetch, port: puerto, hostname }, (info: AddressInfo) => {
      resuelto = true;
      resolve({ server: server as Server, puerto: info.port });
    });
    server.once("error", (err) => {
      if (resuelto) return;
      server.close(() => reject(err));
    });
  });
}

export async function escucharHttp(opts: {
  fetch: FetchFn;
  puerto: number;
  hostname?: string;
  maxIntentos?: number;
}): Promise<Escucha> {
  const hostname = opts.hostname ?? "0.0.0.0";
  const maxIntentos = opts.maxIntentos ?? 20;
  const tope = Math.min(opts.puerto + maxIntentos - 1, 65535);
  for (let candidato = opts.puerto; candidato <= tope; candidato++) {
    try {
      const { server, puerto } = await enlazarUnaVez(opts.fetch, candidato, hostname);
      return { server, puerto, mensaje: mensajeArranque(puerto, opts.puerto) };
    } catch (err) {
      if (!esPuertoOcupado(err)) throw err;
    }
  }
  throw new Error(
    `No se pudo iniciar Restaurante: el puerto ${opts.puerto} está ocupado (EADDRINUSE) y no hay otro libre cerca.`,
  );
}
