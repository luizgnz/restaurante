import type { TicketComanda, TicketPrecuenta } from "./types.ts";

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(`\x1b@${text}\n`);
}

export function renderComanda(ticket: TicketComanda): Uint8Array {
  const mesa = ticket.mesaNumero === null ? "Sin mesa" : `Mesa ${ticket.mesaNumero}`;
  const lineas = ticket.lineas.map((l) => `${l.cantidad} x ${l.nombre}`).join("\n");
  return encode(`COMANDA\n${mesa}\nMesero: ${ticket.mesero}\n${lineas}`);
}

export function renderPrecuenta(ticket: TicketPrecuenta): Uint8Array {
  const mesa = ticket.mesaNumero === null ? "Sin mesa" : `Mesa ${ticket.mesaNumero}`;
  const header = ticket.reimpresion ? "PRECUENTA (reimpresión)" : "PRECUENTA";
  const lineas = ticket.lineas
    .map((l) => `${l.cantidad} x ${l.nombre}  ${l.precio_centavos ?? 0}`)
    .join("\n");
  return encode(
    `${header}\n${mesa}\nCubiertos: ${ticket.cubiertos}\nMesero: ${ticket.mesero}\n${lineas}\nTOTAL ${ticket.totalCentavos}\nEsto no es boleta ni factura. El documento tributario lo emite caja.`,
  );
}

export function renderAnulacion(ticket: TicketComanda): Uint8Array {
  const mesa = ticket.mesaNumero === null ? "Sin mesa" : `Mesa ${ticket.mesaNumero}`;
  const lineas = ticket.lineas.map((l) => `ANULA ${l.cantidad} x ${l.nombre}`).join("\n");
  return encode(`ANULACION\n${mesa}\nMesero: ${ticket.mesero}\n${lineas}`);
}
