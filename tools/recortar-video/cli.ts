import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parsearActividadDeLog } from "./actividad.ts";
import { extraerRango, extraerSinSilencios, sondear, detectarSilencio, salidaPorDefecto } from "./ffmpeg.ts";
import {
  conMargen,
  duracionDe,
  formatearTiempo,
  parsearTiempo,
  type Intervalo,
} from "./tiempos.ts";

type Args = {
  comando: string;
  archivo?: string;
  flags: Record<string, string | boolean>;
};

function ayuda(): string {
  return `Recortar o mapear videos largos (p. ej. 6 h de grabación con 1 h útil).

Uso:
  npm run video -- mapa <archivo>
  npm run video -- extraer <archivo> --auto
  npm run video -- extraer <archivo> --desde 2:10:00 --hasta 3:10:00
  npm run video -- extraer <archivo> --desde 2:10:00 --duracion 1h
  npm run video -- extraer <archivo> --sin-silencios

Comandos:
  mapa      Detecta tramos con sonido y muestra un índice del video
  extraer   Corta un rango (manual o el bloque de actividad más largo)

Opciones:
  --desde, --from          Inicio (2:10:00, 1h10m, segundos)
  --hasta, --to            Fin absoluto
  --duracion               Duración desde --desde
  --auto                   Extrae el bloque de actividad más largo
  --bloque N               Extrae el bloque N del mapa (1 = primero)
  --sin-silencios          Une todos los tramos con sonido y descarta silencios
  --margen 5s              Añade margen al bloque automático
  --pausa-max 90           Une actividad separada por pausas ≤ N segundos
  --umbral -30             Umbral de silencio en dB (más alto = más sensible)
  --silencio-min 2         Silencio mínimo en segundos para considerarlo vacío
  -o, --salida             Archivo de salida
  --preciso                Recodifica (corte más exacto; más lento)
  --escribir-mapa          En 'mapa', guarda un .mapa.txt junto al video
`;
}

function parsearArgs(argv: string[]): Args {
  const flags: Record<string, string | boolean> = {};
  const posicionales: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      flags.help = true;
      continue;
    }
    if (a === "-o") {
      flags.salida = argv[++i] ?? "";
      continue;
    }
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      if (v !== undefined) {
        flags[k] = v;
        continue;
      }
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags[k] = next;
        i++;
      } else {
        flags[k] = true;
      }
      continue;
    }
    posicionales.push(a);
  }
  return { comando: posicionales[0] ?? "help", archivo: posicionales[1], flags };
}

function flagTexto(flags: Record<string, string | boolean>, ...nombres: string[]): string | undefined {
  for (const n of nombres) {
    const v = flags[n];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function flagBool(flags: Record<string, string | boolean>, nombre: string): boolean {
  return flags[nombre] === true || flags[nombre] === "true";
}

function numeroFlag(
  flags: Record<string, string | boolean>,
  nombre: string,
  defecto: number,
): number {
  const v = flags[nombre];
  if (typeof v !== "string") return defecto;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`--${nombre} no es un número: ${v}`);
  return n;
}

function pintarMapa(opciones: {
  archivo: string;
  duracion: number;
  bloques: Intervalo[];
  sugerido: Intervalo | null;
}): string {
  const lineas: string[] = [];
  lineas.push(`Video: ${opciones.archivo}`);
  lineas.push(`Duración: ${formatearTiempo(opciones.duracion)}`);
  lineas.push("");
  if (opciones.bloques.length === 0) {
    lineas.push("No se detectó actividad de audio. Usa --desde y --hasta a mano.");
    return lineas.join("\n");
  }
  lineas.push("Bloques con actividad (pausas cortas unidas):");
  lineas.push("");
  for (const [i, b] of opciones.bloques.entries()) {
    const n = i + 1;
    const marca = opciones.sugerido && b === opciones.sugerido ? "  ★ sugerido" : "";
    lineas.push(
      `  ${n}) ${formatearTiempo(b.inicio)} → ${formatearTiempo(b.fin)}   (${formatearTiempo(duracionDe(b))})${marca}`,
    );
  }
  const util = opciones.bloques.reduce((acc, b) => acc + duracionDe(b), 0);
  lineas.push("");
  lineas.push(`Actividad total: ${formatearTiempo(util)}`);
  lineas.push(`Sobrante estimado: ${formatearTiempo(opciones.duracion - util)}`);
  if (opciones.sugerido) {
    lineas.push("");
    lineas.push("Para extraer el bloque sugerido:");
    lineas.push(`  npm run video -- extraer "${opciones.archivo}" --auto`);
    lineas.push("");
    lineas.push("Para extraer un bloque concreto:");
    lineas.push(`  npm run video -- extraer "${opciones.archivo}" --bloque 1`);
    lineas.push("");
    lineas.push("Para un rango exacto:");
    lineas.push(
      `  npm run video -- extraer "${opciones.archivo}" --desde ${formatearTiempo(opciones.sugerido.inicio)} --hasta ${formatearTiempo(opciones.sugerido.fin)}`,
    );
  }
  return lineas.join("\n");
}

async function analizar(archivo: string, flags: Record<string, string | boolean>) {
  const info = await sondear(archivo);
  if (info.duracion <= 0) throw new Error("no se pudo leer la duración del video");
  if (!info.tieneAudio) {
    return {
      info,
      bloques: [] as Intervalo[],
      sugerido: null as Intervalo | null,
      actividad: [] as Intervalo[],
    };
  }
  const umbral = numeroFlag(flags, "umbral", -30);
  const silencioMin = numeroFlag(flags, "silencio-min", 2);
  const pausaMax = numeroFlag(flags, "pausa-max", 90);
  const log = await detectarSilencio(archivo, umbral, silencioMin);
  const parsed = parsearActividadDeLog(log, info.duracion, pausaMax);
  return { info, ...parsed };
}

function intervaloManual(
  flags: Record<string, string | boolean>,
  duracion: number,
): Intervalo {
  const desdeTexto = flagTexto(flags, "desde", "from");
  const hastaTexto = flagTexto(flags, "hasta", "to");
  const duracionTexto = flagTexto(flags, "duracion", "duración");
  if (!desdeTexto) throw new Error("indica --desde y --hasta (o --duracion), o usa --auto");
  const inicio = parsearTiempo(desdeTexto);
  let fin: number;
  if (hastaTexto) fin = parsearTiempo(hastaTexto);
  else if (duracionTexto) fin = inicio + parsearTiempo(duracionTexto);
  else throw new Error("indica --hasta o --duracion");
  if (fin <= inicio) throw new Error("el fin debe ser posterior al inicio");
  return {
    inicio: Math.max(0, inicio),
    fin: Math.min(duracion, fin),
  };
}

export async function ejecutarCli(argv: string[]): Promise<string> {
  const args = parsearArgs(argv);
  if (args.comando === "help" || flagBool(args.flags, "help") || args.comando === "--help") {
    return ayuda();
  }
  if (args.comando !== "mapa" && args.comando !== "extraer") {
    throw new Error(`comando desconocido: ${args.comando}\n\n${ayuda()}`);
  }
  if (!args.archivo) throw new Error("indica el archivo de video");

  if (args.comando === "mapa") {
    const analisis = await analizar(args.archivo, args.flags);
    const texto = pintarMapa({
      archivo: args.archivo,
      duracion: analisis.info.duracion,
      bloques: analisis.bloques,
      sugerido: analisis.sugerido,
    });
    if (flagBool(args.flags, "escribir-mapa")) {
      const destino = args.archivo.replace(/\.[^.]+$/, "") + ".mapa.txt";
      await writeFile(destino, texto + "\n");
      return `${texto}\n\nMapa guardado en ${destino}`;
    }
    return texto;
  }

  const preciso = flagBool(args.flags, "preciso");
  const salida =
    flagTexto(args.flags, "salida", "output") ??
    salidaPorDefecto(args.archivo, flagBool(args.flags, "sin-silencios") ? "sin-silencios" : "importante");

  if (flagBool(args.flags, "sin-silencios")) {
    const analisis = await analizar(args.archivo, args.flags);
    if (analisis.actividad.length === 0) {
      throw new Error("no hay audio con actividad; no se puede usar --sin-silencios");
    }
    await extraerSinSilencios({
      entrada: args.archivo,
      salida,
      intervalos: analisis.actividad,
      preciso,
    });
    return `Listo: ${salida}\nTramos unidos: ${analisis.actividad.length}\nDuración aproximada: ${formatearTiempo(analisis.actividad.reduce((a, i) => a + duracionDe(i), 0))}`;
  }

  let intervalo: Intervalo;
  const bloqueTexto = flagTexto(args.flags, "bloque");
  const margenTexto = flagTexto(args.flags, "margen");
  const margen = margenTexto ? parsearTiempo(margenTexto) : 0;

  if (flagBool(args.flags, "auto") || bloqueTexto) {
    const analisis = await analizar(args.archivo, args.flags);
    if (analisis.bloques.length === 0) {
      throw new Error(
        "no se detectó un bloque de actividad. Prueba --desde/--hasta, o baja --umbral (p. ej. -40).",
      );
    }
    if (bloqueTexto) {
      const n = Number(bloqueTexto);
      if (!Number.isInteger(n) || n < 1 || n > analisis.bloques.length) {
        throw new Error(`--bloque debe ser un número entre 1 y ${analisis.bloques.length}`);
      }
      intervalo = analisis.bloques[n - 1];
    } else {
      intervalo = analisis.sugerido!;
    }
    if (margen > 0) intervalo = conMargen(intervalo, margen, analisis.info.duracion);
  } else {
    const info = await sondear(args.archivo);
    if (info.duracion <= 0) throw new Error("no se pudo leer la duración del video");
    intervalo = intervaloManual(args.flags, info.duracion);
  }

  await extraerRango({ entrada: args.archivo, salida, intervalo, preciso });
  return `Listo: ${salida}\nRango: ${formatearTiempo(intervalo.inicio)} → ${formatearTiempo(intervalo.fin)} (${formatearTiempo(duracionDe(intervalo))})`;
}

export async function main(): Promise<void> {
  try {
    const texto = await ejecutarCli(process.argv.slice(2));
    process.stdout.write(texto.endsWith("\n") ? texto : texto + "\n");
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    process.stderr.write(mensaje + "\n");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
