import { Socket } from "node:net";
import type { AppConfig, ImpresoraRedConfig, PlantillaImpresion } from "../config.ts";
import { ConsolePrinter } from "./console.ts";
import type { PrinterPort, PrintJobKind } from "./types.ts";

const TIMEOUT_MS = 3_000;

function destinoValido(destino: ImpresoraRedConfig): void {
  if (!destino.host.trim()) throw new Error("Indica la dirección IP o nombre de la impresora");
  if (!Number.isInteger(destino.puerto) || destino.puerto < 1 || destino.puerto > 65535) {
    throw new Error("El puerto de la impresora no es válido");
  }
}

export function enviarAImpresoraRed(
  destino: ImpresoraRedConfig,
  bytes: Uint8Array,
  timeoutMs = TIMEOUT_MS,
): Promise<number> {
  destinoValido(destino);
  const inicio = Date.now();
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let terminado = false;
    const cerrar = (error?: Error) => {
      if (terminado) return;
      terminado = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(Date.now() - inicio);
    };
    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => cerrar(new Error("La impresora no respondió antes del tiempo límite")));
    socket.once("error", (error) => cerrar(new Error(`No se pudo conectar: ${error.message}`)));
    socket.connect(destino.puerto, destino.host.trim(), () => {
      socket.write(bytes, (error) => {
        if (error) cerrar(new Error(`No se pudo enviar la impresión: ${error.message}`));
        else socket.end(() => cerrar());
      });
    });
  });
}

export async function diagnosticarImpresora(destino: ImpresoraRedConfig): Promise<{ conectado: boolean; latenciaMs: number | null; mensaje: string }> {
  try {
    const latenciaMs = await enviarAImpresoraRed(destino, new Uint8Array(), TIMEOUT_MS);
    return { conectado: true, latenciaMs, mensaje: `Conexión confirmada en ${latenciaMs} ms` };
  } catch (error) {
    return { conectado: false, latenciaMs: null, mensaje: error instanceof Error ? error.message : String(error) };
  }
}

function aplicarPlantilla(bytes: Uint8Array, plantilla: PlantillaImpresion): Uint8Array {
  const decoder = new TextDecoder();
  let texto = decoder.decode(bytes);
  const prefijo = texto.startsWith("\x1b@") ? "\x1b@" : "";
  if (prefijo) texto = texto.slice(prefijo.length);
  const lineas = texto.replace(/\n$/, "").split("\n");
  if (plantilla.titulo.trim() && lineas.length > 0) lineas[0] = plantilla.titulo.trim();
  const resultado = [
    plantilla.encabezado.trim(),
    ...lineas,
    plantilla.pie.trim(),
  ].filter(Boolean).join("\n");
  return new TextEncoder().encode(`${prefijo}${resultado}\n`);
}

export class ConfigurablePrinter implements PrinterPort {
  private readonly consola = new ConsolePrinter();

  constructor(private readonly config: AppConfig) {}

  async print(bytes: Uint8Array, contexto?: { kind: PrintJobKind }): Promise<void> {
    const esBoleta = contexto?.kind === "precuenta";
    const destino = esBoleta ? this.config.impresora_boleta : this.config.impresora_comanda;
    const plantilla = esBoleta ? this.config.plantilla_boleta : this.config.plantilla_comanda;
    const salida = aplicarPlantilla(bytes, plantilla);
    if (!destino.habilitada) {
      await this.consola.print(salida);
      return;
    }
    await enviarAImpresoraRed(destino, salida);
  }
}

export function textoPrueba(tipo: "comanda" | "boleta", config: AppConfig): Uint8Array {
  const plantilla = tipo === "comanda" ? config.plantilla_comanda : config.plantilla_boleta;
  const base = tipo === "comanda"
    ? "COMANDA\nMesa 4 · Orden 18\nMesero: Usuario de prueba\n2 x Producto de prueba\n   Sin cebolla"
    : "COMPROBANTE\nMesa 4\n1 x Producto de prueba  5000\nTOTAL 5000\nDocumento de prueba, no tributario";
  return aplicarPlantilla(new TextEncoder().encode(`\x1b@${base}\n`), plantilla);
}
