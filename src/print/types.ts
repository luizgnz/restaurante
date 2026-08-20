export type PrintJobKind = "comanda" | "precuenta" | "anulacion";

export type PrinterPort = {
  print(bytes: Uint8Array): Promise<void>;
};

export type TicketLinea = { nombre: string; cantidad: number; precio_centavos?: number };

export type TicketComanda = {
  mesaNumero: number | null;
  mesero: string;
  lineas: TicketLinea[];
};

export type TicketPrecuenta = {
  mesaNumero: number | null;
  mesero: string;
  cubiertos: number;
  lineas: TicketLinea[];
  totalCentavos: number;
  reimpresion?: boolean;
};
