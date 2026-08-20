import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { escucharHttp, urlParaAbrir } from "../src/http/listen.ts";

const ocupados: { close: () => Promise<void> }[] = [];

afterEach(async () => {
  while (ocupados.length) {
    const s = ocupados.pop();
    if (s) await s.close();
  }
});

function dummyFetch(cuerpo: string) {
  return async () => new Response(cuerpo);
}

function ocuparPuerto(puerto = 0): Promise<{ puerto: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("otro-programa");
    });
    server.once("error", reject);
    server.listen(puerto, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("sin puerto"));
        return;
      }
      const close = () =>
        new Promise<void>((done, fail) => {
          server.close((err) => (err ? fail(err) : done()));
        });
      resolve({ puerto: addr.port, close });
    });
  });
}

describe("escucharHttp", () => {
  it("si el puerto está libre, escucha en el puerto configurado", async () => {
    const reserva = await ocuparPuerto(0);
    const puerto = reserva.puerto;
    await reserva.close();

    const escuchando = await escucharHttp({
      fetch: dummyFetch("restaurante"),
      puerto,
      hostname: "127.0.0.1",
    });
    ocupados.push({ close: () => new Promise((done, fail) => escuchando.server.close((e) => (e ? fail(e) : done()))) });

    expect(escuchando.puerto).toBe(puerto);
    const res = await fetch(`http://127.0.0.1:${puerto}/`);
    expect(await res.text()).toBe("restaurante");
    expect(escuchando.mensaje).toBe(`Restaurante en http://127.0.0.1:${puerto}`);
  });

  it("si el puerto está ocupado, no enlaza el mismo; usa el siguiente y lo anuncia", async () => {
    const ocupado = await ocuparPuerto(0);
    ocupados.push(ocupado);

    const escuchando = await escucharHttp({
      fetch: dummyFetch("restaurante"),
      puerto: ocupado.puerto,
      hostname: "127.0.0.1",
    });
    ocupados.push({ close: () => new Promise((done, fail) => escuchando.server.close((e) => (e ? fail(e) : done()))) });

    expect(escuchando.puerto).not.toBe(ocupado.puerto);
    expect(escuchando.puerto).toBe(ocupado.puerto + 1);

    const ajeno = await fetch(`http://127.0.0.1:${ocupado.puerto}/`);
    expect(await ajeno.text()).toBe("otro-programa");

    const propio = await fetch(`http://127.0.0.1:${escuchando.puerto}/`);
    expect(await propio.text()).toBe("restaurante");

    expect(escuchando.mensaje).toBe(
      `Restaurante en http://127.0.0.1:${escuchando.puerto} (el ${ocupado.puerto} estaba ocupado por otro programa)`,
    );
    expect(urlParaAbrir(escuchando)).toBe(`http://127.0.0.1:${escuchando.puerto}`);
    expect(urlParaAbrir(escuchando)).not.toBe(`http://127.0.0.1:${ocupado.puerto}`);
  });
});
