import type { TicketComanda, TicketCorreccion, TicketDiferencia, TicketPrecuenta } from "./types.ts";

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(`\x1b@${text}\n`);
}

function encabezadoMesa(ticket: TicketComanda): string {
  const mesa = ticket.mesaNumero === null ? "Sin mesa" : `Mesa ${ticket.mesaNumero}`;
  if (ticket.ordenNumero == null) return mesa;
  return `${mesa} · Orden ${ticket.ordenNumero}`;
}

export function textoComanda(ticket: TicketComanda): string {
  const indicaciones = ticket.indicaciones?.trim() ? `Indicaciones: ${ticket.indicaciones.trim()}\n` : "";
  const lineas = ticket.lineas
    .map((l) => {
      const nota = l.nota?.trim() ? ` (${l.nota.trim()})` : "";
      const contornos = (l.contornos ?? []).map((c) => `\n   ${c}`).join("");
      return `${l.cantidad} x ${l.nombre}${nota}${contornos}`;
    })
    .join("\n");
  return `COMANDA\n${encabezadoMesa(ticket)}\nMesero: ${ticket.mesero}\n${indicaciones}${lineas}`;
}

export function renderComanda(ticket: TicketComanda): Uint8Array {
  return encode(textoComanda(ticket));
}

function lineasDeDiferencia(diff: TicketDiferencia): string[] {
  const out: string[] = [];
  const notaAnterior = diff.notaAnterior?.trim() || null;
  const notaNueva = diff.notaNueva?.trim() || null;
  // El nombre no alcanza para identificar la línea cuando la orden lleva dos
  // veces el mismo producto: la nota es el discriminante que ve cocina.
  const conNota = (nota: string | null) => (nota ? `${diff.nombre} (${nota})` : diff.nombre);
  if (diff.cantidadNueva === 0 && diff.cantidadAnterior > 0) {
    out.push(`ANULADO: ${diff.cantidadAnterior} ${conNota(notaAnterior)}`);
    return out;
  }
  if (diff.delta < 0) out.push(`- ${-diff.delta} ${conNota(notaNueva ?? notaAnterior)}`);
  else if (diff.delta > 0) out.push(`+ ${diff.delta} ${conNota(notaNueva ?? notaAnterior)}`);
  if (notaAnterior !== notaNueva) {
    const antes = notaAnterior ? ` (antes: ${notaAnterior})` : "";
    out.push(
      notaNueva
        ? `NOTA CAMBIADA: ${diff.nombre}${antes} → ${notaNueva}`
        : `NOTA BORRADA: ${diff.nombre}${antes}`,
    );
  }
  return out;
}

export function textoCorreccion(ticket: TicketCorreccion): string {
  const mesa = ticket.mesaNumero === null ? "Sin mesa" : `Mesa ${ticket.mesaNumero}`;
  const titulo = ticket.esAnulacion ? "ANULACIÓN" : "CORRECCIÓN";
  const vigentes = ticket.indicaciones?.trim() || null;
  const encabezadoIndicaciones = vigentes ? `Indicaciones: ${vigentes}\n` : "";
  const cuerpo = ticket.lineas.flatMap(lineasDeDiferencia);
  // Un cambio que solo toca indicaciones también tiene que dejar cuerpo en el
  // papel, incluso si lo que hizo fue borrarlas.
  if (ticket.indicacionesCambiadas) {
    cuerpo.push(vigentes ? `INDICACIONES CAMBIADAS: ${vigentes}` : "INDICACIONES BORRADAS");
  }
  return `${titulo} · ${mesa} · Orden ${ticket.ordenNumero}\nMesero: ${ticket.mesero}\n${encabezadoIndicaciones}${cuerpo.join("\n")}`;
}

export function renderCorreccion(ticket: TicketCorreccion): Uint8Array {
  return encode(textoCorreccion(ticket));
}

export function textoPrecuenta(ticket: TicketPrecuenta): string {
  const mesa = ticket.mesaNumero === null ? "Sin mesa" : `Mesa ${ticket.mesaNumero}`;
  const header = ticket.reimpresion ? "PRECUENTA (reimpresión)" : "PRECUENTA";
  // Sin cubiertos no se imprime la línea: el pedido legacy los tiene y la cuenta
  // no, y un "Cubiertos: 0" en la mesa parece un dato, no un hueco.
  const cubiertos = ticket.cubiertos == null ? "" : `Cubiertos: ${ticket.cubiertos}\n`;
  const lineas = ticket.lineas
    .map((l) => {
      // El nombre no distingue dos líneas del mismo producto; la nota sí, y es lo
      // que el cliente reconoce de lo que pidió.
      const nota = l.nota?.trim() ? ` (${l.nota.trim()})` : "";
      return `${l.cantidad} x ${l.nombre}${nota}  ${l.precio_centavos ?? 0}`;
    })
    .join("\n");
  return `${header}\n${mesa}\n${cubiertos}Mesero: ${ticket.mesero}\n${lineas}\nTOTAL ${ticket.totalCentavos}\nEsto no es boleta ni factura. El documento tributario lo emite caja.`;
}

export function renderPrecuenta(ticket: TicketPrecuenta): Uint8Array {
  return encode(textoPrecuenta(ticket));
}

export function renderAnulacion(ticket: TicketComanda): Uint8Array {
  const mesa = ticket.mesaNumero === null ? "Sin mesa" : `Mesa ${ticket.mesaNumero}`;
  const lineas = ticket.lineas.map((l) => `ANULA ${l.cantidad} x ${l.nombre}`).join("\n");
  return encode(`ANULACION\n${mesa}\nMesero: ${ticket.mesero}\n${lineas}`);
}
