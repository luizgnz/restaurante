export function ultimosPedidos<T extends { abierto_en?: string }>(pedidos: T[], n = 5): T[] {
  return [...pedidos]
    .sort((a, b) => Date.parse(b.abierto_en ?? "") - Date.parse(a.abierto_en ?? ""))
    .slice(0, n);
}

export function pedidosAtrasados<T extends { espera_min: number }>(pedidos: T[], n = 5): T[] {
  return [...pedidos].sort((a, b) => b.espera_min - a.espera_min).slice(0, n);
}
