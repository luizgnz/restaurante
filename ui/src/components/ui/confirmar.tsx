import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog.tsx";

type ConfirmarDialogProps = {
  titulo: string;
  descripcion?: string;
  confirmarTexto?: string;
  cancelarTexto?: string;
  /** Con `peligro` el botón de confirmar es destructivo (para acciones que borran datos). */
  peligro?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
};

/**
 * Confirmación única para las acciones destructivas (quitar piso, mesa,
 * slots...). Misma mecánica que el resto de diálogos: el padre la monta y
 * desmonta, y `onCancelar` también se dispara al tocar el fondo o Escape.
 */
export function ConfirmarDialog({
  titulo,
  descripcion,
  confirmarTexto = "Confirmar",
  cancelarTexto = "Cancelar",
  peligro = false,
  onConfirmar,
  onCancelar,
}: ConfirmarDialogProps) {
  return (
    <Dialog aria-label={titulo} onOverlayClick={onCancelar}>
      <DialogContent>
        <DialogTitle>{titulo}</DialogTitle>
        {descripcion ? <DialogDescription>{descripcion}</DialogDescription> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancelar}>
            {cancelarTexto}
          </Button>
          <Button type="button" variant={peligro ? "destructive" : "default"} onClick={onConfirmar}>
            {confirmarTexto}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
