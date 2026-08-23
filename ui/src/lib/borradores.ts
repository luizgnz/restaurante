export type BorradorOrden = {
  version: 1;
  mesaId?: number;
  cuentaId?: number;
  claveIdempotencia: string;
  lineas: Array<{ productoId: number; cantidad: number; nota: string }>;
  indicaciones: string;
  actualizadoEn: string;
};

const PREFIJO = "restaurante.borrador";

export function claveBorrador(
  contexto: { tipo: "general" } | { tipo: "mesa"; mesaId: number } | { tipo: "cuenta"; cuentaId: number },
): string {
  switch (contexto.tipo) {
    case "general":
      return `${PREFIJO}:general`;
    case "mesa":
      return `${PREFIJO}:mesa:${contexto.mesaId}`;
    case "cuenta":
      return `${PREFIJO}:cuenta:${contexto.cuentaId}`;
  }
}

function esEnteroPositivo(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isInteger(valor) && valor > 0;
}

function esCantidadValida(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 0;
}

function parsearBorrador(raw: unknown): BorradorOrden | null {
  if (typeof raw !== "object" || raw === null) return null;
  const d = raw as Record<string, unknown>;

  if (d.version !== 1) return null;

  if (
    typeof d.claveIdempotencia !== "string" ||
    d.claveIdempotencia.length === 0 ||
    d.claveIdempotencia.trim().length === 0
  ) {
    return null;
  }
  const claveIdempotencia = d.claveIdempotencia;

  if (typeof d.indicaciones !== "string") return null;
  if (typeof d.actualizadoEn !== "string" || !d.actualizadoEn) return null;

  if (d.mesaId !== undefined && !esEnteroPositivo(d.mesaId)) return null;
  if (d.cuentaId !== undefined && !esEnteroPositivo(d.cuentaId)) return null;

  if (!Array.isArray(d.lineas)) return null;
  const lineas: BorradorOrden["lineas"] = [];
  for (const item of d.lineas) {
    if (typeof item !== "object" || item === null) return null;
    const l = item as Record<string, unknown>;
    if (!esEnteroPositivo(l.productoId)) return null;
    if (!esCantidadValida(l.cantidad)) return null;
    if (typeof l.nota !== "string") return null;
    lineas.push({ productoId: l.productoId, cantidad: l.cantidad, nota: l.nota });
  }

  const borrador: BorradorOrden = {
    version: 1,
    claveIdempotencia,
    lineas,
    indicaciones: d.indicaciones,
    actualizadoEn: d.actualizadoEn,
  };
  if (d.mesaId !== undefined) borrador.mesaId = d.mesaId;
  if (d.cuentaId !== undefined) borrador.cuentaId = d.cuentaId;
  return borrador;
}

export function cargarBorrador(storage: Storage, clave: string): BorradorOrden | null {
  const raw = storage.getItem(clave);
  if (raw === null) return null;

  try {
    const borrador = parsearBorrador(JSON.parse(raw));
    if (borrador === null) {
      storage.removeItem(clave);
      return null;
    }
    return borrador;
  } catch {
    storage.removeItem(clave);
    return null;
  }
}

export function guardarBorrador(storage: Storage, clave: string, value: BorradorOrden): void {
  storage.setItem(clave, JSON.stringify(value));
}

export function eliminarBorrador(storage: Storage, clave: string): void {
  storage.removeItem(clave);
}
