export const MESA_LADO = 96;

export type MesaOrdenada = {
  pos_x: number;
  pos_y: number;
  forma: "square";
  ancho: number;
  alto: number;
};

export function columnasPara(cantidad: number): number {
  if (cantidad <= 1) return 1;
  return Math.min(5, Math.ceil(Math.sqrt(cantidad)));
}

/** Reparte las mesas en cuadrícula por número, todas cuadradas y del mismo lado. */
export function ordenarMesas<T extends { numero: number }>(mesas: T[]): (T & MesaOrdenada)[] {
  const orden = [...mesas].sort((a, b) => a.numero - b.numero);
  const columnas = columnasPara(orden.length);
  const filas = Math.max(1, Math.ceil(orden.length / columnas));
  const pasoX = 90 / columnas;
  const pasoY = Math.min(26, 88 / filas);
  return orden.map((mesa, i) => ({
    ...mesa,
    pos_x: redondear(4 + (i % columnas) * pasoX),
    pos_y: redondear(Math.min(90, 4 + Math.floor(i / columnas) * pasoY)),
    forma: "square" as const,
    ancho: MESA_LADO,
    alto: MESA_LADO,
  }));
}

function redondear(valor: number): number {
  return Math.round(valor * 10) / 10;
}
