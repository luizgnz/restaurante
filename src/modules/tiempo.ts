const UNIDADES: Record<number, string> = {
  1: "un",
  2: "dos",
};

export function haceCuanto(desdeIso: string, ahoraMs = Date.now()): string {
  const min = Math.max(0, Math.floor((ahoraMs - Date.parse(desdeIso)) / 60000));
  if (min <= 0) return "Hace un momento";
  if (min === 1) return "Hace un minuto";
  if (UNIDADES[min]) return `Hace ${UNIDADES[min]} minutos`;
  if (min < 60) return `Hace ${min} minutos`;
  const horas = Math.floor(min / 60);
  if (horas === 1) return "Hace una hora";
  return `Hace ${horas} horas`;
}
