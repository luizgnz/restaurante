import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { ConfigurablePrinter, diagnosticarImpresora } from "../src/print/network.ts";

describe("impresoras de red", () => {
  it("confirma conexión y envía una comanda aplicando la plantilla", async () => {
    const recibidos: Buffer[] = [];
    const server = createServer((socket) => socket.on("data", (chunk) => recibidos.push(Buffer.from(chunk))));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("servidor de prueba sin puerto");
    const config = defaultConfig();
    config.impresora_comanda = { habilitada: true, nombre: "Prueba", host: "127.0.0.1", puerto: address.port, ancho_mm: 80 };
    config.plantilla_comanda = { titulo: "COCINA NORTE", encabezado: "Turno tarde", pie: "Fin" };

    expect((await diagnosticarImpresora(config.impresora_comanda)).conectado).toBe(true);
    await new ConfigurablePrinter(config).print(new TextEncoder().encode("\x1b@COMANDA\nMesa 2\n"), { kind: "comanda" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const texto = Buffer.concat(recibidos).toString("utf8");
    expect(texto).toContain("Turno tarde");
    expect(texto).toContain("COCINA NORTE");
    expect(texto).toContain("Fin");
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
});
