import { useState } from "react";
import { Ban } from "lucide-react";
import { dinero } from "../../../src/modules/formato.ts";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";

type Props = {
  mesaNumero: number;
  totalCentavos: number;
  onConfirmar: (motivo: string) => void;
  onCancelar: () => void;
};

export function ConfirmarCancelarCuenta({ mesaNumero, totalCentavos, onConfirmar, onCancelar }: Props) {
  const [motivo, setMotivo] = useState("");
  const valido = motivo.trim().length > 0;
  return (
    <Dialog aria-label="Cancelar cuenta" onOverlayClick={onCancelar}>
      <DialogContent>
        <DialogTitle>¿Cancelar la cuenta de la Mesa #{mesaNumero}?</DialogTitle>
        <DialogDescription>
          La mesa queda libre y no se cobra nada ({dinero(totalCentavos)}). Según la configuración del sistema, los
          ingredientes de lo ya preparado vuelven al inventario o se registran como merma. Solo un administrador
          puede confirmar esta acción con su PIN.
        </DialogDescription>
        <label>
          Motivo de la cancelación
          <Textarea
            value={motivo}
            placeholder="Ej.: los clientes se retiraron sin pedir"
            onChange={(event) => setMotivo(event.target.value)}
            autoFocus
          />
        </label>
        {!valido ? <p role="status">El motivo es obligatorio: queda registrado en la auditoría.</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancelar}>
            Volver
          </Button>
          <Button type="button" variant="destructive" disabled={!valido} onClick={() => onConfirmar(motivo.trim())}>
            <Ban size={18} aria-hidden="true" /> Cancelar cuenta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
