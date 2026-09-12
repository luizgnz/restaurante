import { afterEach, describe, expect, it, vi } from "vitest";
import { api, mensajeError } from "../ui/src/api.ts";

describe("cliente API de la interfaz", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("traduce un fallo de red a un mensaje comprensible", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));

    await expect(api("/api/cuentas")).rejects.toThrow(
      "No se pudo conectar con el sistema. La información se actualizará cuando vuelva la conexión.",
    );
  });

  it("extrae solo el mensaje al mostrar un error", () => {
    expect(mensajeError(new Error("No disponible"))).toBe("No disponible");
  });
});
