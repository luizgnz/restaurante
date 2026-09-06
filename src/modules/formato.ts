/**
 * Formato compartido por backend y UI: el mismo número debe verse igual en la
 * pantalla del mesero, en la precuenta en pantalla y en el ticket impreso.
 *
 * Los campos `*_centavos` del sistema guardan la unidad menor de la moneda
 * local (en CLP, el peso mismo); `dinero` solo agrega el separador de miles.
 */

const NUMERO_CL = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

export function dinero(monto: number): string {
  return `$${NUMERO_CL.format(Math.round(monto))}`;
}

export function fechaCorta(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return fecha.toLocaleString("es-CL", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
