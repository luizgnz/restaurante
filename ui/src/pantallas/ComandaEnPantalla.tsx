export type ComandaUi = {
  mesaNumero: number | null;
  ordenNumero: number;
  mesero: string;
  indicaciones: string | null;
  lineas: Array<{ nombre: string; cantidad: number; nota: string | null; contornos?: string[] }>;
};

type Props = {
  restaurante: string;
  comanda: ComandaUi;
  onCerrar: () => void;
};

export function ComandaEnPantalla({ restaurante, comanda, onCerrar }: Props) {
  return (
    <DialogOverlay
      role="dialog"
      aria-modal="true"
      aria-label="Comanda enviada"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCerrar();
      }}
    >
      <DialogContent className="ticket-papel">
        <p className="ticket-papel__local">{restaurante}</p>
        <h2 className="ticket-papel__tipo">COMANDA</h2>
        <p className="ticket-papel__referencia">
          {comanda.mesaNumero != null ? `Mesa #${comanda.mesaNumero}` : "Sin mesa"} · Orden #{comanda.ordenNumero} ·{" "}
          {comanda.mesero}
        </p>
        <ul className="ticket-papel__lineas">
          {comanda.lineas.map((linea, indice) => (
            <li key={`${linea.nombre}-${indice}`}>
              <span>
                <strong>
                  {linea.cantidad} × {linea.nombre}
                </strong>
                {linea.nota ? <span className="ticket-papel__nota"> ({linea.nota})</span> : null}
                {(linea.contornos ?? []).map((contorno) => (
                  <span className="ticket-papel__nota" key={contorno}>
                    {contorno}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
        {comanda.indicaciones ? <p className="ticket-papel__indicaciones">{comanda.indicaciones}</p> : null}
        <Button type="button" onClick={onCerrar}>
          Listo
        </Button>
      </DialogContent>
    </DialogOverlay>
  );
}
import { Button } from "@/components/ui/button.tsx";
import { DialogContent, DialogOverlay } from "@/components/ui/dialog.tsx";
