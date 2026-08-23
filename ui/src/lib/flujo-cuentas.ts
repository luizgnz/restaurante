import type { CuentaDetalleUi } from "../pantallas/CuentaMesa.tsx";

export type ContextoOrden =
  | { tipo: "general" }
  | { tipo: "mesa"; mesaId: number; mesaNumero: number }
  | { tipo: "cuenta"; cuentaId: number; mesaId: number; mesaNumero: number };

export type CuentasConocidas = Record<number, CuentaDetalleUi>;

export function contextoNuevaOrdenDeCuenta(cuenta: CuentaDetalleUi): ContextoOrden {
  return {
    tipo: "cuenta",
    cuentaId: cuenta.id,
    mesaId: cuenta.mesa.id,
    mesaNumero: cuenta.mesa.numero,
  };
}

export function registrarCuentaConocida(
  conocidas: CuentasConocidas,
  cuenta: CuentaDetalleUi,
): CuentasConocidas {
  return { ...conocidas, [cuenta.mesa.id]: cuenta };
}

export function cuentaConocidaDeMesa(
  conocidas: CuentasConocidas,
  mesaId: number,
): CuentaDetalleUi | null {
  return conocidas[mesaId] ?? null;
}

export function estadoMesaConCuentas(
  estadoApi: string,
  conocidas: CuentasConocidas,
  mesaId: number,
): string {
  const cuenta = cuentaConocidaDeMesa(conocidas, mesaId);
  if (!cuenta) return estadoApi;
  if (cuenta.estado === "abierta") return "en_cocina";
  if (cuenta.estado === "precuenta_emitida") return "precuenta";
  if (cuenta.estado === "en_caja") return "en_caja";
  return estadoApi;
}

export function vistaTrasAccionCuenta(tipo: "precuenta" | "enviar-caja"): "pedido" | "plano" {
  return tipo === "enviar-caja" ? "plano" : "pedido";
}

export async function completarEnvioBorrador(input: {
  cuentaId: number;
  cargarCuenta: (cuentaId: number) => Promise<CuentaDetalleUi>;
  eliminarBorrador: () => void;
}): Promise<CuentaDetalleUi> {
  const cuenta = await input.cargarCuenta(input.cuentaId);
  input.eliminarBorrador();
  return cuenta;
}

export function mensajeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function ejecutarAccionModal(
  accion: () => Promise<void>,
  mostrarError: (error: string) => void,
): Promise<boolean> {
  mostrarError("");
  try {
    await accion();
    return true;
  } catch (error) {
    mostrarError(mensajeError(error));
    return false;
  }
}
