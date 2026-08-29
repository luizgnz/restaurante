import type { CuentaDetalleUi } from "../pantallas/CuentaMesa.tsx";

export type ContextoOrden =
  | { tipo: "general" }
  | { tipo: "mesa"; mesaId: number; mesaNumero: number }
  | { tipo: "cuenta"; cuentaId: number; mesaId: number; mesaNumero: number };

export function contextoNuevaOrdenDeCuenta(cuenta: CuentaDetalleUi): ContextoOrden {
  return {
    tipo: "cuenta",
    cuentaId: cuenta.id,
    mesaId: cuenta.mesa.id,
    mesaNumero: cuenta.mesa.numero,
  };
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
