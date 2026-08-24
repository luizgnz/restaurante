import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type PoliticaInventario =
  | "descuento_al_enviar"
  | "reserva_al_enviar_firme_al_precuenta"
  | "reserva_al_enviar_firme_al_enviar_caja";

export type TipografiaPos = "sans" | "serif" | "redondeada";
export type TamanoUi = "compacto" | "normal" | "grande";
export type PinMomento = "crear_orden" | "enviar";

export type ImpresoraRedConfig = {
  habilitada: boolean;
  nombre: string;
  host: string;
  puerto: number;
  ancho_mm: 58 | 80;
};

export type PlantillaImpresion = {
  titulo: string;
  encabezado: string;
  pie: string;
};

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
  barra_ultimos_pedidos: boolean;
  barra_atrasados: boolean;
  nombre_local: string;
  logo_data: string | null;
  tipografia: TipografiaPos;
  tamano_ui: TamanoUi;
  pin_habilitado: boolean;
  pin_momento: PinMomento;
  confirmar_comanda: boolean;
  pin_al_anular: boolean;
  auditoria_anulaciones: boolean;
  justificacion_anulacion: boolean;
  impresora_comanda: ImpresoraRedConfig;
  impresora_boleta: ImpresoraRedConfig;
  plantilla_comanda: PlantillaImpresion;
  plantilla_boleta: PlantillaImpresion;
  servidor_red_habilitado: boolean;
  nombre_servidor: string;
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
    enviar_a_caja_requiere_avanzado: false,
    precuenta_obligatoria_antes_de_caja: true,
    liberar_mesa_cuando: "al_enviar_a_caja",
    bloqueo_inactividad_seg: 60,
    barra_ultimos_pedidos: true,
    barra_atrasados: true,
    nombre_local: "Restaurante",
    logo_data: null,
    tipografia: "sans",
    tamano_ui: "normal",
    pin_habilitado: true,
    pin_momento: "enviar",
    confirmar_comanda: false,
    pin_al_anular: true,
    auditoria_anulaciones: false,
    justificacion_anulacion: false,
    impresora_comanda: {
      habilitada: false,
      nombre: "Cocina",
      host: "",
      puerto: 9100,
      ancho_mm: 80,
    },
    impresora_boleta: {
      habilitada: false,
      nombre: "Caja",
      host: "",
      puerto: 9100,
      ancho_mm: 80,
    },
    plantilla_comanda: {
      titulo: "COMANDA",
      encabezado: "",
      pie: "",
    },
    plantilla_boleta: {
      titulo: "COMPROBANTE",
      encabezado: "",
      pie: "Gracias por su visita",
    },
    servidor_red_habilitado: true,
    nombre_servidor: "Restaurante",
  };
}

export function normalizarConfig(cfg: AppConfig): AppConfig {
  const defaults = defaultConfig();
  return {
    ...sincronizarPinEnviar(cfg),
    justificacion_anulacion: cfg.auditoria_anulaciones && cfg.justificacion_anulacion,
    impresora_comanda: { ...defaults.impresora_comanda, ...cfg.impresora_comanda },
    impresora_boleta: { ...defaults.impresora_boleta, ...cfg.impresora_boleta },
    plantilla_comanda: { ...defaults.plantilla_comanda, ...cfg.plantilla_comanda },
    plantilla_boleta: { ...defaults.plantilla_boleta, ...cfg.plantilla_boleta },
  };
}

export function sincronizarPinEnviar(cfg: AppConfig): AppConfig {
  return { ...cfg, pin_al_enviar: cfg.pin_habilitado && cfg.pin_momento === "enviar" };
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
  return normalizarConfig({ ...defaultConfig(), ...raw });
}
