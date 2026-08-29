export type PrecuentaUi = {
  mesaNumero: number | null;
  numero: number;
  mesero: string;
  lineas: Array<{ nombre: string; cantidad: number; precioCentavos: number; nota: string | null }>;
  totalCentavos: number;
};

type Props = {
  restaurante: string;
  precuenta: PrecuentaUi;
  onCerrar: () => void;
};

export function PrecuentaEnPantalla({ restaurante, precuenta, onCerrar }: Props) {
  return (
    <DialogOverlay
      role="dialog"
      aria-modal="true"
      aria-label="Precuenta emitida"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCerrar();
      }}
    >
      <DialogContent className="ticket-papel">
        <p className="ticket-papel__local">{restaurante}</p>
        <h2 className="ticket-papel__tipo">PRECUENTA</h2>
        <p className="ticket-papel__referencia">
          {precuenta.mesaNumero != null ? `Mesa #${precuenta.mesaNumero}` : "Sin mesa"} · Precuenta #
          {precuenta.numero} · {precuenta.mesero}
        </p>
        <ul className="ticket-papel__lineas">
          {precuenta.lineas.map((linea, indice) => (
            <li key={`${linea.nombre}-${indice}`}>
              <span>
                <strong>
                  {linea.cantidad} × {linea.nombre}
                </strong>
                {linea.nota ? <span className="ticket-papel__nota"> ({linea.nota})</span> : null}
              </span>
              <span>${linea.cantidad * linea.precioCentavos}</span>
            </li>
          ))}
        </ul>
        <p className="ticket-papel__total">
          <strong>TOTAL</strong>
          <strong>${precuenta.totalCentavos}</strong>
        </p>
        <Button type="button" onClick={onCerrar}>
          Listo
        </Button>
      </DialogContent>
    </DialogOverlay>
  );
}
import { Button } from "@/components/ui/button.tsx";
import { DialogContent, DialogOverlay } from "@/components/ui/dialog.tsx";
