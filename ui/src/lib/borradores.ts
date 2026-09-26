export type BorradorOrden = {
  version: 1;
  mesaId?: number;
  cuentaId?: number;
  tipoServicio?: "mesa" | "para_llevar";
  clienteNombre?: string;
  claveIdempotencia: string;
  lineas: Array<{
    productoId: number;
    cantidad: number;
    nota: string;
    contornos?: Array<{ slotPosicion: number; varianteId: number }>;
    contornosTexto?: string;
    /** Suplementos y extras de los contornos, calculados al armar el plato. */
    adicionalCentavos?: number;
  }>;
  indicaciones: string;
  actualizadoEn: string;
};

const PREFIJO = "restaurante.borrador";

export function nuevaClaveIdempotencia(
  entropia: Pick<Crypto, "getRandomValues"> | undefined = globalThis.crypto,
): string {
  const bytes = new Uint8Array(16);
  if (entropia?.getRandomValues) {
    entropia.getRandomValues(bytes);
  } else {
    // Último recurso para navegadores sin Web Crypto; la clave evita duplicar envíos.
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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
  if (d.tipoServicio !== undefined && d.tipoServicio !== "mesa" && d.tipoServicio !== "para_llevar") return null;
  if (d.clienteNombre !== undefined && typeof d.clienteNombre !== "string") return null;

  if (!Array.isArray(d.lineas)) return null;
  const lineas: BorradorOrden["lineas"] = [];
  for (const item of d.lineas) {
    if (typeof item !== "object" || item === null) return null;
    const l = item as Record<string, unknown>;
    if (!esEnteroPositivo(l.productoId)) return null;
    if (!esCantidadValida(l.cantidad)) return null;
    if (typeof l.nota !== "string") return null;
    const linea: BorradorOrden["lineas"][number] = { productoId: l.productoId, cantidad: l.cantidad, nota: l.nota };
    if (l.contornos !== undefined) {
      if (!Array.isArray(l.contornos)) return null;
      const contornos: Array<{ slotPosicion: number; varianteId: number }> = [];
      for (const seleccion of l.contornos) {
        if (typeof seleccion !== "object" || seleccion === null) return null;
        const s = seleccion as Record<string, unknown>;
        if (!esEnteroPositivo(s.slotPosicion) || !esEnteroPositivo(s.varianteId)) return null;
        contornos.push({ slotPosicion: s.slotPosicion, varianteId: s.varianteId });
      }
      linea.contornos = contornos;
    }
    if (l.contornosTexto !== undefined) {
      if (typeof l.contornosTexto !== "string") return null;
      linea.contornosTexto = l.contornosTexto;
    }
    if (l.adicionalCentavos !== undefined) {
      if (typeof l.adicionalCentavos !== "number" || !Number.isInteger(l.adicionalCentavos) || l.adicionalCentavos < 0) {
        return null;
      }
      linea.adicionalCentavos = l.adicionalCentavos;
    }
    lineas.push(linea);
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
  if (d.tipoServicio !== undefined) borrador.tipoServicio = d.tipoServicio;
  if (d.clienteNombre !== undefined) borrador.clienteNombre = d.clienteNombre;
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
