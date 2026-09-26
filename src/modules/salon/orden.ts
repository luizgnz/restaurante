export const MESA_LADO = 96;

export type MesaOrdenada = {
  pos_x: number;
  pos_y: number;
  forma: "square";
  ancho: number;
  alto: number;
};

export function columnasPara(cantidad: number, anchoMapa?: number): number {
  if (cantidad <= 1) return 1;
  const deseadas = Math.min(5, Math.ceil(Math.sqrt(cantidad)));
  if (!anchoMapa || anchoMapa <= 0) return deseadas;
  return Math.min(deseadas, Math.max(1, Math.floor(anchoMapa / (MESA_LADO + 16))));
}

/** Reparte las mesas en cuadrícula por número, todas cuadradas y del mismo lado. */
export function ordenarMesas<T extends { numero: number }>(mesas: T[], anchoMapa?: number): (T & MesaOrdenada)[] {
  const orden = [...mesas].sort((a, b) => a.numero - b.numero);
  const columnas = columnasPara(orden.length, anchoMapa);
  const filas = Math.max(1, Math.ceil(orden.length / columnas));
  const pasoX = anchoMapa && anchoMapa > 0
    ? Math.max(anchoMapa * 0.9 / columnas, MESA_LADO + 16)
    : 90 / columnas;
  const inicioX = anchoMapa && anchoMapa > 0
    ? Math.min(anchoMapa * 0.04, Math.max(0, anchoMapa - 8 - (columnas - 1) * pasoX - MESA_LADO))
    : 4;
  const pasoY = Math.min(26, 88 / filas);
  return orden.map((mesa, i) => ({
    ...mesa,
    pos_x: redondear(anchoMapa && anchoMapa > 0
      ? ((inicioX + (i % columnas) * pasoX) / anchoMapa) * 100
      : inicioX + (i % columnas) * pasoX),
    pos_y: redondear(Math.min(90, 4 + Math.floor(i / columnas) * pasoY)),
    forma: "square" as const,
    ancho: MESA_LADO,
    alto: MESA_LADO,
  }));
}

function redondear(valor: number): number {
  return Math.round(valor * 10) / 10;
}
