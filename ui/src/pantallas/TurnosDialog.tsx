import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";

export type TurnoPlantilla = {
  id: number;
  nombre: string;
  horaInicio: string | null;
  horaFin: string | null;
  esPredeterminada: boolean;
  activa: boolean;
};

type Props = {
  turnos: TurnoPlantilla[];
  procesando: boolean;
  onCancelar: () => void;
  onGuardar: (turno: TurnoPlantilla) => Promise<void>;
};

const nuevo: TurnoPlantilla = { id: 0, nombre: "", horaInicio: null, horaFin: null, esPredeterminada: false, activa: true };

export function TurnosDialog({ turnos, procesando, onCancelar, onGuardar }: Props) {
  const [seleccionado, setSeleccionado] = useState<TurnoPlantilla>(turnos[0] ?? nuevo);
  useEffect(() => setSeleccionado(turnos[0] ?? nuevo), [turnos]);

  return (
    <Dialog aria-label="Configurar turnos" onOverlayClick={() => !procesando && onCancelar()}>
      <DialogContent className="w-[min(620px,94vw)]">
        <DialogHeader>
          <DialogTitle>Turnos operativos</DialogTitle>
          <DialogDescription>Los horarios sirven como referencia. El restaurante abre y cierra cada turno manualmente.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {turnos.map((turno) => (
            <Button key={turno.id} type="button" size="sm" variant={seleccionado.id === turno.id ? "secondary" : "outline"} onClick={() => setSeleccionado(turno)}>
              {turno.nombre}{turno.esPredeterminada ? " · Predeterminado" : ""}
            </Button>
          ))}
          <Button type="button" size="sm" variant={seleccionado.id === 0 ? "secondary" : "outline"} onClick={() => setSeleccionado(nuevo)}>Nuevo turno</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label className="sm:col-span-2">Nombre<Input maxLength={40} value={seleccionado.nombre} onChange={(event) => setSeleccionado({ ...seleccionado, nombre: event.target.value })} placeholder="Ej. Turno noche" /></Label>
          <Label>Hora de inicio (referencia)<Input type="time" value={seleccionado.horaInicio ?? ""} onChange={(event) => setSeleccionado({ ...seleccionado, horaInicio: event.target.value || null })} /></Label>
          <Label>Hora de fin (referencia)<Input type="time" value={seleccionado.horaFin ?? ""} onChange={(event) => setSeleccionado({ ...seleccionado, horaFin: event.target.value || null })} /></Label>
        </div>
        <label className="flex items-center gap-3 rounded-lg border p-3 text-sm"><Checkbox checked={seleccionado.esPredeterminada} onChange={(event) => setSeleccionado({ ...seleccionado, esPredeterminada: event.target.checked })} /><span>Usar por defecto al abrir una jornada</span></label>
        {seleccionado.id > 0 ? <label className="flex items-center gap-3 rounded-lg border p-3 text-sm"><Checkbox checked={seleccionado.activa} onChange={(event) => setSeleccionado({ ...seleccionado, activa: event.target.checked })} /><span>Turno activo</span></label> : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={procesando} onClick={onCancelar}>Cerrar</Button>
          <Button type="button" disabled={procesando || !seleccionado.nombre.trim()} onClick={() => onGuardar({ ...seleccionado, nombre: seleccionado.nombre.trim() })}>{procesando ? "Guardando…" : "Guardar turno"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
