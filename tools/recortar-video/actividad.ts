import { duracionDe, type Intervalo } from "./tiempos.ts";

export function parsearSilencios(log: string): {
  intervalos: Intervalo[];
  silencioAbierto: number | null;
} {
  const intervalos: Intervalo[] = [];
  let abierto: number | null = null;
  for (const linea of log.split(/\r?\n/)) {
    const start = linea.match(/silence_start:\s*(-?[\d.]+)/);
    if (start) {
      abierto = Math.max(0, Number(start[1]));
      continue;
    }
    const end = linea.match(/silence_end:\s*(-?[\d.]+)/);
    if (end && abierto !== null) {
      const fin = Number(end[1]);
      intervalos.push({ inicio: abierto, fin: Math.max(abierto, fin) });
      abierto = null;
    }
  }
  return { intervalos, silencioAbierto: abierto };
}

export function silenciarHastaElFinal(
  parseado: { intervalos: Intervalo[]; silencioAbierto: number | null },
  duracion: number,
): Intervalo[] {
  const out = [...parseado.intervalos];
  if (parseado.silencioAbierto !== null) {
    out.push({ inicio: parseado.silencioAbierto, fin: duracion });
  }
  return out.filter((i) => i.fin > i.inicio);
}

export function actividadDesdeSilencios(silencios: Intervalo[], duracion: number): Intervalo[] {
  const ordenados = [...silencios]
    .map((s) => ({
      inicio: Math.max(0, s.inicio),
      fin: Math.min(duracion, s.fin),
    }))
    .filter((s) => s.fin > s.inicio)
    .sort((a, b) => a.inicio - b.inicio);

  const actividad: Intervalo[] = [];
  let t = 0;
  for (const silencio of ordenados) {
    if (silencio.inicio > t) actividad.push({ inicio: t, fin: silencio.inicio });
    t = Math.max(t, silencio.fin);
  }
  if (t < duracion) actividad.push({ inicio: t, fin: duracion });
  return actividad.filter((a) => duracionDe(a) >= 0.05);
}

export function unirPausasCortas(intervalos: Intervalo[], pausaMax: number): Intervalo[] {
  if (intervalos.length === 0) return [];
  const ordenados = [...intervalos].sort((a, b) => a.inicio - b.inicio);
  const out: Intervalo[] = [{ ...ordenados[0] }];
  for (let i = 1; i < ordenados.length; i++) {
    const actual = ordenados[i];
    const ultimo = out[out.length - 1];
    if (actual.inicio - ultimo.fin <= pausaMax) {
      ultimo.fin = Math.max(ultimo.fin, actual.fin);
    } else {
      out.push({ ...actual });
    }
  }
  return out;
}

export function bloqueMasLargo(intervalos: Intervalo[]): Intervalo | null {
  if (intervalos.length === 0) return null;
  return intervalos.reduce((mejor, actual) =>
    duracionDe(actual) > duracionDe(mejor) ? actual : mejor,
  );
}

export function parsearActividadDeLog(
  log: string,
  duracion: number,
  pausaMax: number,
): {
  silencios: Intervalo[];
  actividad: Intervalo[];
  bloques: Intervalo[];
  sugerido: Intervalo | null;
} {
  const silencios = silenciarHastaElFinal(parsearSilencios(log), duracion);
  const actividad = actividadDesdeSilencios(silencios, duracion);
  const bloques = unirPausasCortas(actividad, pausaMax);
  return { silencios, actividad, bloques, sugerido: bloqueMasLargo(bloques) };
}
