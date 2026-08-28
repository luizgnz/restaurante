import { Button } from "../components/ui/button.tsx";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "../components/ui/dialog.tsx";

type Props = {
  texto: string;
  onVolver: () => void;
  onContinuar: () => void;
};

export function VistaPreviaComanda({ texto, onVolver, onContinuar }: Props) {
  return (
    <Dialog aria-label="Confirmar comanda" onOverlayClick={onVolver}>
      <DialogContent className="ticket-preview">
        <DialogTitle>Confirmar comanda</DialogTitle>
        <pre className="ticket-preview__cuerpo">{texto}</pre>
        <DialogFooter className="form-odoo__acciones">
          <Button type="button" variant="secondary" onClick={onVolver}>
            Volver
          </Button>
          <Button type="button" className="primario" onClick={onContinuar}>
            Continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
