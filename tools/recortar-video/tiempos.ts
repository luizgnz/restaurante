export type Intervalo = { inicio: number; fin: number };

export function parsearTiempo(valor: string): number {
  const texto = valor.trim();
  if (!texto) throw new Error("tiempo vacío");

  const horasMinutos = texto.match(/^(\d+)\s*h(?:oras?)?(?:\s*(\d+)\s*m(?:in(?:utos?)?)?)?(?:\s*(\d+)\s*s(?:eg(?:undos?)?)?)?$/i);
  if (horasMinutos) {
    const h = Number(horasMinutos[1]);
    const m = Number(horasMinutos[2] ?? 0);
    const s = Number(horasMinutos[3] ?? 0);
    return h * 3600 + m * 60 + s;
  }

  const soloMinutos = texto.match(/^(\d+)\s*m(?:in(?:utos?)?)?(?:\s*(\d+)\s*s(?:eg(?:undos?)?)?)?$/i);
  if (soloMinutos) {
    return Number(soloMinutos[1]) * 60 + Number(soloMinutos[2] ?? 0);
  }

  const soloSegundos = texto.match(/^(\d+(?:\.\d+)?)\s*s(?:eg(?:undos?)?)?$/i);
  if (soloSegundos) return Number(soloSegundos[1]);

  if (/^\d+(?:\.\d+)?$/.test(texto)) return Number(texto);

  const partes = texto.split(":");
  if (partes.length < 2 || partes.length > 3) {
    throw new Error(`tiempo no reconocido: ${valor}`);
  }
  if (partes.some((p) => p === "" || Number.isNaN(Number(p)))) {
    throw new Error(`tiempo no reconocido: ${valor}`);
  }

  const nums = partes.map(Number);
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  return nums[0] * 3600 + nums[1] * 60 + nums[2];
}

function formatearParteSegundos(s: number): string {
  const redondeado = Math.round(s * 1000) / 1000;
  if (Number.isInteger(redondeado)) return String(redondeado).padStart(2, "0");
  const [entero, frac] = redondeado.toFixed(3).split(".");
  return `${entero.padStart(2, "0")}.${frac}`;
}

export function formatearTiempo(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) segundos = 0;
  const total = Math.round(segundos * 1000) / 1000;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total - h * 3600 - m * 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${formatearParteSegundos(s)}`;
}

export function duracionDe(intervalo: Intervalo): number {
  return Math.max(0, intervalo.fin - intervalo.inicio);
}

export function recortarARango(intervalo: Intervalo, duracion: number): Intervalo {
  return {
    inicio: Math.min(duracion, Math.max(0, intervalo.inicio)),
    fin: Math.min(duracion, Math.max(0, intervalo.fin)),
  };
}

export function conMargen(intervalo: Intervalo, margen: number, duracion: number): Intervalo {
  return recortarARango(
    { inicio: intervalo.inicio - margen, fin: intervalo.fin + margen },
    duracion,
  );
}
