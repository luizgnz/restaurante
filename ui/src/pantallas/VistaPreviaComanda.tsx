type Props = {
  texto: string;
  onVolver: () => void;
  onContinuar: () => void;
};

export function VistaPreviaComanda({ texto, onVolver, onContinuar }: Props) {
  return (
    <DialogOverlay
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar comanda"
      onClick={(e) => {
        if (e.target === e.currentTarget) onVolver();
      }}
    >
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
    </DialogOverlay>
  );
}
import { Button } from "@/components/ui/button.tsx";
import { DialogContent, DialogFooter, DialogOverlay, DialogTitle } from "@/components/ui/dialog.tsx";
