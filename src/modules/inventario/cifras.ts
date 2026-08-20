export function available(onHand: number, reserved: number): number {
  return onHand - reserved;
}

export function availableToAssemble(
  componentes: { cantidadReceta: number; disponible: number }[],
): number {
  if (componentes.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...componentes.map((c) => Math.floor(c.disponible / c.cantidadReceta)));
}
