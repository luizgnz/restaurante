type Props = {
  mesaNumero: number;
  totalCentavos: number;
  onConfirmar: () => void;
  onCancelar: () => void;
};

export function ConfirmarCierreCuenta({ mesaNumero, totalCentavos, onConfirmar, onCancelar }: Props) {
  return (
    <DialogOverlay
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar cierre de cuenta"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancelar();
      }}
    >
      <DialogContent>
        <DialogTitle>¿Cerrar cuenta?</DialogTitle>
        <DialogDescription>
          La cuenta de Mesa #{mesaNumero} por ${totalCentavos} se envía a caja y la mesa queda libre.
        </DialogDescription>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button type="button" onClick={onConfirmar}>
            Cerrar cuenta
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogOverlay>
  );
}
import { Button } from "@/components/ui/button.tsx";
import { DialogContent, DialogDescription, DialogFooter, DialogOverlay, DialogTitle } from "@/components/ui/dialog.tsx";
