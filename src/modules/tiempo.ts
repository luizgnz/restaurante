const UNIDADES: Record<number, string> = {
  1: "un",
  2: "dos",
};

export type NivelEspera = "ok" | "medio" | "alto" | "critico";

export function esperaMinutos(desdeIso: string, ahoraMs = Date.now()): number {
  return Math.max(0, Math.floor((ahoraMs - Date.parse(desdeIso)) / 60000));
}

export function nivelEspera(min: number): NivelEspera {
  if (min >= 25) return "critico";
  if (min >= 15) return "alto";
  if (min >= 8) return "medio";
  return "ok";
}

export function haceCuanto(desdeIso: string, ahoraMs = Date.now()): string {
  const min = esperaMinutos(desdeIso, ahoraMs);
  if (min <= 0) return "Hace un momento";
  if (min === 1) return "Hace un minuto";
  if (UNIDADES[min]) return `Hace ${UNIDADES[min]} minutos`;
  if (min < 60) return `Hace ${min} minutos`;
  const horas = Math.floor(min / 60);
  if (horas === 1) return "Hace una hora";
  return `Hace ${horas} horas`;
}
