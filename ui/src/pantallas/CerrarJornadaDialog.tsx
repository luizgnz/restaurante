import { Alerta } from "@/components/ui/alerta.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog.tsx";

export type ResumenCierreJornada = {
  cuentasActivas: number;
  cuentasTotales: number;
  ordenes: number;
  tareasCocinaPendientes: number;
  incidenciasPendientes: number;
  ordenesListas: number;
  pedidosParaLlevarPendientes: number;
  cuentasVacias: number;
};

type Props = {
  resumen: ResumenCierreJornada;
  procesando: boolean;
  error?: string;
  onCancelar: () => void;
  onConfirmar: () => Promise<void>;
};

export function CerrarJornadaDialog({ resumen, procesando, error, onCancelar, onConfirmar }: Props) {
  const hayCuentasAbiertas = resumen.cuentasActivas > 0;

  return (
    <Dialog aria-label="Cerrar turno" onOverlayClick={() => !procesando && onCancelar()}>
      <DialogContent className="w-[min(440px,94vw)]">
        <DialogTitle>Cerrar turno</DialogTitle>
        {hayCuentasAbiertas ? (
          <Alerta tono="aviso">Hay mesas abiertas. Cierra todas las cuentas antes de cerrar el turno.</Alerta>
        ) : (
          <DialogDescription>Se guardará un respaldo al cerrar el turno.</DialogDescription>
        )}
        {error ? <Alerta>{error}</Alerta> : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={procesando} onClick={onCancelar}>Volver</Button>
          {!hayCuentasAbiertas ? (
            <Button type="button" disabled={procesando} onClick={onConfirmar}>
              {procesando ? "Cerrando…" : "Cerrar turno"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
