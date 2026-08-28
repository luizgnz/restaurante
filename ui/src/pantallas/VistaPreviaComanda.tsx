import { Button } from "../components/ui/button.tsx";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "../components/ui/dialog.tsx";

type Props = {
  texto: string;
  onVolver: () => void;
  onContinuar: () => void;
};

export function VistaPreviaComanda({ texto, onVolver, onContinuar }: Props) {
  return (
    <Dialog onOverlayClick={onVolver}>
      <DialogContent className="ticket-preview" aria-label="Confirmar comanda">
        <DialogTitle>Confirmar comanda</DialogTitle>
        <pre className="ticket-preview__cuerpo">{texto}</pre>
        <DialogFooter className="form-odoo__acciones">
          <Button type="button" variant="outline" onClick={onVolver}>
            Volver
          </Button>
          <Button type="button" onClick={onContinuar}>
            Continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
