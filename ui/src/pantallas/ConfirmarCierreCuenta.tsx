type Props = {
  mesaNumero: number;
  totalCentavos: number;
  onConfirmar: () => void;
  onCancelar: () => void;
};

export function ConfirmarCierreCuenta({ mesaNumero, totalCentavos, onConfirmar, onCancelar }: Props) {
  return (
    <Dialog aria-label="Confirmar cierre de cuenta" onOverlayClick={onCancelar}>
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
    </Dialog>
  );
}
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog.tsx";
