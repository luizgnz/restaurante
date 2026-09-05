import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsearActividadDeLog, unirPausasCortas } from "../tools/recortar-video/actividad.ts";
import { ejecutarCli } from "../tools/recortar-video/cli.ts";
import { ejecutar } from "../tools/recortar-video/ffmpeg.ts";
import { formatearTiempo, parsearTiempo } from "../tools/recortar-video/tiempos.ts";

describe("parsearTiempo", () => {
  it("acepta reloj, segundos y formas cortas", () => {
    expect(parsearTiempo("2:10:00")).toBe(2 * 3600 + 10 * 60);
    expect(parsearTiempo("10:30")).toBe(10 * 60 + 30);
    expect(parsearTiempo("90")).toBe(90);
    expect(parsearTiempo("1h10m")).toBe(3600 + 600);
    expect(parsearTiempo("5s")).toBe(5);
    expect(parsearTiempo("1h")).toBe(3600);
  });

  it("formatea con horas", () => {
    expect(formatearTiempo(3723)).toBe("01:02:03");
  });
});

describe("actividad desde silencedetect", () => {
  it("encuentra el tramo sonoro entre silencios largos", () => {
    const log = `
[silencedetect @ 0x1] silence_start: 0
[silencedetect @ 0x1] silence_end: 10800 | silence_duration: 10800
[silencedetect @ 0x1] silence_start: 14400
[silencedetect @ 0x1] silence_end: 21600 | silence_duration: 7200
`;
    const r = parsearActividadDeLog(log, 21600, 90);
    expect(r.sugerido).toEqual({ inicio: 10800, fin: 14400 });
    expect(r.bloques).toHaveLength(1);
  });

  it("une pausas cortas dentro de la misma sesión", () => {
    const unidos = unirPausasCortas(
      [
        { inicio: 100, fin: 200 },
        { inicio: 230, fin: 400 },
        { inicio: 2000, fin: 2100 },
      ],
      90,
    );
    expect(unidos).toEqual([
      { inicio: 100, fin: 400 },
      { inicio: 2000, fin: 2100 },
    ]);
  });

  it("cierra un silencio que llega hasta el final", () => {
    const log = `
silence_start: 0
silence_end: 3
silence_start: 8
`;
    const r = parsearActividadDeLog(log, 12, 2);
    expect(r.sugerido).toEqual({ inicio: 3, fin: 8 });
  });
});

describe("cli extraer con video sintético", () => {
  let dir = "";
  let entrada = "";

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "recortar-video-test-"));
    entrada = join(dir, "largo.mp4");
    await ejecutar("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=160x120:r=10:d=12",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:duration=6",
      "-af",
      "adelay=3000|3000,apad=pad_dur=3",
      "-c:v",
      "libx264",
      "-g",
      "1",
      "-keyint_min",
      "1",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      entrada,
    ]);
  }, 30_000);

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("mapa señala el bloque con tono", async () => {
    const texto = await ejecutarCli(["mapa", entrada, "--pausa-max", "1", "--silencio-min", "1.5"]);
    expect(texto).toContain("★ sugerido");
    expect(texto).toMatch(/\d\) /);
  }, 30_000);

  it("extrae un rango manual sin analizar silencios", async () => {
    const salida = join(dir, "manual.mp4");
    const texto = await ejecutarCli(["extraer", entrada, "--desde", "3", "--hasta", "9", "-o", salida]);
    expect(texto).toContain("Listo:");
    const { stdout } = await ejecutar("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      salida,
    ]);
    const duracion = Number(stdout.trim());
    expect(duracion).toBeGreaterThan(5);
    expect(duracion).toBeLessThan(7.5);
  }, 30_000);

  it("extrae en automático el tramo con sonido", async () => {
    const salida = join(dir, "auto.mp4");
    const texto = await ejecutarCli([
      "extraer",
      entrada,
      "--auto",
      "--silencio-min",
      "1.5",
      "--pausa-max",
      "1",
      "-o",
      salida,
    ]);
    expect(texto).toContain("Listo:");
    const { stdout } = await ejecutar("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      salida,
    ]);
    const duracion = Number(stdout.trim());
    expect(duracion).toBeGreaterThan(4);
    expect(duracion).toBeLessThan(8);
  }, 30_000);

  it("escribe un mapa de texto", async () => {
    const texto = await ejecutarCli(["mapa", entrada, "--escribir-mapa", "--silencio-min", "1.5"]);
    expect(texto).toContain("Mapa guardado");
    const mapa = await readFile(join(dir, "largo.mapa.txt"), "utf8");
    expect(mapa).toContain("Duración:");
  }, 30_000);
});
