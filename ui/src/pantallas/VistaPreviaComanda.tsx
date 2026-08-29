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
        <DialogFooter>
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
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog.tsx";
