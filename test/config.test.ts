import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig, loadConfig, saveConfig } from "../src/config.ts";

describe("config", () => {
  it("default: puerto 8080, extra nube off, inventario reserva→firme en caja", () => {
    const c = defaultConfig();
    expect(c.puerto).toBe(8080);
    expect(c.extra_nube).toBe(false);
    expect(c.acceso_directo).toBe(false);
    expect(c.politica_inventario).toBe("reserva_al_enviar_firme_al_enviar_caja");
    expect(c.pin_al_enviar).toBe(true);
    expect(c.pin_al_emitir_precuenta).toBe(true);
    expect(c.pin_al_enviar_caja).toBe(true);
    expect(c.tablet_cocina).toBe(false);
    expect(c.enviar_a_caja_requiere_avanzado).toBe(true);
    expect(c.precuenta_obligatoria_antes_de_caja).toBe(true);
    expect(c.liberar_mesa_cuando).toBe("al_enviar_a_caja");
    expect(c.bloqueo_inactividad_seg).toBe(60);
  });

  it("crea config.json con defaults si no existe", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rest-cfg-"));
    const loaded = loadConfig(dir);
    expect(loaded.puerto).toBe(8080);
    const raw = JSON.parse(readFileSync(path.join(dir, "config.json"), "utf8"));
    expect(raw.extra_nube).toBe(false);
  });

  it("persiste cambios de puerto", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rest-cfg-"));
    const c = loadConfig(dir);
    saveConfig(dir, { ...c, puerto: 9090 });
    expect(loadConfig(dir).puerto).toBe(9090);
  });
});
