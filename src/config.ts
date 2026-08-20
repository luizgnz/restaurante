import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type PoliticaInventario =
  | "descuento_al_enviar"
  | "reserva_al_enviar_firme_al_precuenta"
  | "reserva_al_enviar_firme_al_enviar_caja";

export type AppConfig = {
  puerto: number;
  extra_nube: boolean;
  acceso_directo: boolean;
  url_updates: string;
  politica_inventario: PoliticaInventario;
  bloqueo_sin_stock: "permitir" | "avisar" | "bloquear";
  pin_al_enviar: boolean;
  pin_al_emitir_precuenta: boolean;
  pin_al_enviar_caja: boolean;
  tablet_cocina: boolean;
  enviar_a_caja_requiere_avanzado: boolean;
  precuenta_obligatoria_antes_de_caja: boolean;
  liberar_mesa_cuando: "al_enviar_a_caja" | "manual";
  bloqueo_inactividad_seg: number;
};

export function defaultConfig(): AppConfig {
  return {
    puerto: 8080,
    extra_nube: false,
    acceso_directo: false,
    url_updates: "",
    politica_inventario: "reserva_al_enviar_firme_al_enviar_caja",
    bloqueo_sin_stock: "avisar",
    pin_al_enviar: true,
    pin_al_emitir_precuenta: true,
    pin_al_enviar_caja: true,
    tablet_cocina: false,
    enviar_a_caja_requiere_avanzado: true,
    precuenta_obligatoria_antes_de_caja: true,
    liberar_mesa_cuando: "al_enviar_a_caja",
    bloqueo_inactividad_seg: 60,
  };
}

export function configPath(dir: string): string {
  return path.join(dir, "config.json");
}

export function saveConfig(dir: string, cfg: AppConfig): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(configPath(dir), `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
}

export function loadConfig(dir: string): AppConfig {
  const file = configPath(dir);
  if (!existsSync(file)) {
    const cfg = defaultConfig();
    saveConfig(dir, cfg);
    return cfg;
  }
  const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<AppConfig>;
  return { ...defaultConfig(), ...raw };
}
