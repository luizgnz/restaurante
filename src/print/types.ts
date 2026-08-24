export type PrintJobKind = "comanda" | "precuenta" | "anulacion" | "correccion";

export type PrinterPort = {
  print(bytes: Uint8Array, contexto?: { kind: PrintJobKind }): Promise<void>;
};

export type TicketLinea = {
  nombre: string;
  cantidad: number;
  precio_centavos?: number;
  nota?: string | null;
  /** Selecciones de contorno ya formateadas ("Proteína: Pollo", "EXTRA: Pollo"). */
  contornos?: string[];
};

export type TicketComanda = {
  mesaNumero: number | null;
  ordenNumero?: number | null;
  mesero: string;
  indicaciones?: string | null;
  lineas: TicketLinea[];
};

export type TicketDiferencia = {
  nombre: string;
  delta: number;
  cantidadAnterior: number;
  cantidadNueva: number;
  notaAnterior?: string | null;
  notaNueva?: string | null;
};

export type TicketCorreccion = {
  mesaNumero: number | null;
  ordenNumero: number;
  mesero: string;
  esAnulacion: boolean;
  indicaciones?: string | null;
  /** True cuando esta corrección cambió (o borró) las indicaciones. */
  indicacionesCambiadas?: boolean;
  lineas: TicketDiferencia[];
};

export type TicketPrecuenta = {
  mesaNumero: number | null;
  mesero: string;
  /**
   * Los cubiertos son del pedido legacy. Una cuenta no los guarda, así que el
   * modelo nuevo los deja sin definir y el ticket omite la línea en vez de
   * imprimir un cero que nadie contó.
   */
  cubiertos?: number;
  lineas: TicketLinea[];
  totalCentavos: number;
  reimpresion?: boolean;
};
