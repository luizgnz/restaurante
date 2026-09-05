import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { formatearTiempo, type Intervalo } from "./tiempos.ts";

export class FfmpegError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
  }
}

export async function ejecutar(
  bin: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const hijo = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    hijo.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    hijo.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    hijo.on("error", (err) => {
      reject(
        new FfmpegError(
          `No se pudo ejecutar ${bin}. Instala ffmpeg (incluye ffprobe).`,
          String(err),
        ),
      );
    });
    hijo.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const cola = stderr.trim().split("\n").slice(-8).join("\n");
      reject(
        new FfmpegError(
          `${bin} falló con código ${code}${cola ? `:\n${cola}` : ""}`,
          stderr,
        ),
      );
    });
  });
}

export type InfoVideo = {
  duracion: number;
  tieneAudio: boolean;
  tieneVideo: boolean;
};

export async function sondear(ruta: string): Promise<InfoVideo> {
  const { stdout } = await ejecutar("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_type",
    "-of",
    "json",
    ruta,
  ]);
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: { codec_type?: string }[];
  };
  const duracion = Number(parsed.format?.duration ?? 0);
  const streams = parsed.streams ?? [];
  return {
    duracion,
    tieneAudio: streams.some((s) => s.codec_type === "audio"),
    tieneVideo: streams.some((s) => s.codec_type === "video"),
  };
}

export async function detectarSilencio(
  ruta: string,
  umbralDb: number,
  silencioMin: number,
): Promise<string> {
  const filtro = `silencedetect=noise=${umbralDb}dB:d=${silencioMin}`;
  const { stderr } = await ejecutar("ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-vn",
    "-i",
    ruta,
    "-af",
    filtro,
    "-f",
    "null",
    "-",
  ]);
  return stderr;
}

export async function extraerRango(opciones: {
  entrada: string;
  salida: string;
  intervalo: Intervalo;
  preciso: boolean;
}): Promise<void> {
  await mkdir(dirname(opciones.salida), { recursive: true });
  const duracion = opciones.intervalo.fin - opciones.intervalo.inicio;
  if (duracion <= 0) throw new Error("el rango a extraer está vacío");

  const args = [
    "-y",
    "-hide_banner",
    "-ss",
    formatearTiempo(opciones.intervalo.inicio),
    "-i",
    opciones.entrada,
    "-t",
    formatearTiempo(duracion),
  ];
  if (opciones.preciso) {
    args.push("-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart");
  } else {
    args.push("-c", "copy", "-avoid_negative_ts", "make_zero");
  }
  args.push(opciones.salida);
  await ejecutar("ffmpeg", args);
}

export async function extraerSinSilencios(opciones: {
  entrada: string;
  salida: string;
  intervalos: Intervalo[];
  preciso: boolean;
}): Promise<void> {
  if (opciones.intervalos.length === 0) {
    throw new Error("no hay tramos con actividad para unir");
  }
  if (opciones.intervalos.length === 1) {
    await extraerRango({ ...opciones, intervalo: opciones.intervalos[0] });
    return;
  }

  const dir = await mkdtemp(join(tmpdir(), "recortar-video-"));
  try {
    const partes: string[] = [];
    for (const [i, intervalo] of opciones.intervalos.entries()) {
      const parte = join(dir, `parte-${String(i).padStart(3, "0")}.mp4`);
      await extraerRango({
        entrada: opciones.entrada,
        salida: parte,
        intervalo,
        preciso: opciones.preciso,
      });
      partes.push(parte);
    }
    const lista = join(dir, "lista.txt");
    await writeFile(
      lista,
      partes.map((p) => `file '${p.replaceAll("'", "'\\''")}'`).join("\n"),
    );
    await mkdir(dirname(opciones.salida), { recursive: true });
    await ejecutar("ffmpeg", [
      "-y",
      "-hide_banner",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      lista,
      "-c",
      "copy",
      opciones.salida,
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function salidaPorDefecto(entrada: string, sufijo = "importante"): string {
  const base = basename(entrada);
  const punto = base.lastIndexOf(".");
  const nombre = punto > 0 ? base.slice(0, punto) : base;
  const ext = punto > 0 ? base.slice(punto) : ".mp4";
  return join(dirname(entrada), `${nombre}.${sufijo}${ext}`);
}
