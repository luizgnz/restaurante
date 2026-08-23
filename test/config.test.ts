import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig, loadConfig, normalizarConfig, saveConfig } from "../src/config.ts";

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
    expect(c.barra_ultimos_pedidos).toBe(true);
    expect(c.barra_atrasados).toBe(true);
    expect(c.nombre_local).toBe("Restaurante");
    expect(c.logo_data).toBeNull();
    expect(c.tipografia).toBe("sans");
    expect(c.tamano_ui).toBe("normal");
    expect(c.pin_habilitado).toBe(true);
    expect(c.pin_momento).toBe("enviar");
    expect(c.confirmar_comanda).toBe(false);
    expect(c.pin_al_anular).toBe(true);
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

  it("desactiva auditoría y justificación por defecto", () => {
    const cfg = defaultConfig();
    expect(cfg.auditoria_anulaciones).toBe(false);
    expect(cfg.justificacion_anulacion).toBe(false);
  });

  it("no permite justificación activa sin auditoría", () => {
    const cfg = normalizarConfig({
      ...defaultConfig(),
      auditoria_anulaciones: false,
      justificacion_anulacion: true,
    });
    expect(cfg.justificacion_anulacion).toBe(false);
  });
});
