export function maxPosicionMesa(tamanoMesa: number, tamanoMapa: number): number {
  if (tamanoMapa <= 0) return 0;
  return Math.max(0, Math.min(90, 100 - ((tamanoMesa + 8) / tamanoMapa) * 100));
}

export function posicionVisibleMesa(posicion: number, tamanoMesa: number, tamanoMapa: number): number {
  return Math.min(maxPosicionMesa(tamanoMesa, tamanoMapa), Math.max(0, posicion));
}
