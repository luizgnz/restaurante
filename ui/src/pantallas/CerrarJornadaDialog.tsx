import { useState } from "react";
import { AlertTriangle, CheckCheck, Clock3, LockKeyhole } from "lucide-react";
import { Alerta } from "@/components/ui/alerta.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";

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
  onActualizarEntregas: () => Promise<void>;
  onCancelar: () => void;
  onConfirmar: (input: { usuario: string; password: string; cierreEn?: string }) => Promise<void>;
};

function fechaLocalParaInput(): string {
  const ahora = new Date();
  const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function CerrarJornadaDialog({ resumen, procesando, error, onActualizarEntregas, onCancelar, onConfirmar }: Props) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [corregirHora, setCorregirHora] = useState(false);
  const [cierreLocal, setCierreLocal] = useState(fechaLocalParaInput);
  const bloqueada = resumen.tareasCocinaPendientes > 0 || resumen.incidenciasPendientes > 0
    || resumen.ordenesListas > 0 || resumen.pedidosParaLlevarPendientes > 0;

  return (
    <Dialog aria-label="Cerrar jornada" onOverlayClick={() => !procesando && onCancelar()}>
      <DialogContent className="w-[min(560px,94vw)]">
        <DialogHeader>
          <DialogTitle>Cerrar jornada</DialogTitle>
          <DialogDescription>
            Revisa el servicio completo. Las cuentas abiertas se cerrarán juntas, sin imprimir precuentas una por una.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/40 p-3"><dt className="text-xs text-muted-foreground">Cuentas abiertas</dt><dd className="mt-1 text-xl font-semibold">{resumen.cuentasActivas}</dd></div>
          <div className="rounded-lg border bg-muted/40 p-3"><dt className="text-xs text-muted-foreground">Cuentas vacías</dt><dd className="mt-1 text-xl font-semibold">{resumen.cuentasVacias}</dd></div>
          <div className="rounded-lg border bg-muted/40 p-3"><dt className="text-xs text-muted-foreground">Órdenes</dt><dd className="mt-1 text-xl font-semibold">{resumen.ordenes}</dd></div>
        </dl>

        {resumen.ordenesListas > 0 ? (
          <Alerta tono="aviso">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Hay {resumen.ordenesListas} {resumen.ordenesListas === 1 ? "orden lista" : "órdenes listas"} sin confirmar.</span>
              <Button type="button" size="sm" variant="outline" disabled={procesando} onClick={onActualizarEntregas}>
                <CheckCheck size={16} aria-hidden="true" /> Marcar todas entregadas
              </Button>
            </div>
          </Alerta>
        ) : null}
        {resumen.tareasCocinaPendientes > 0 ? <Alerta tono="aviso">Cocina todavía tiene {resumen.tareasCocinaPendientes} tareas en preparación.</Alerta> : null}
        {resumen.incidenciasPendientes > 0 ? <Alerta tono="aviso">Hay {resumen.incidenciasPendientes} incidencias pendientes de respuesta.</Alerta> : null}
        {resumen.pedidosParaLlevarPendientes > 0 ? <Alerta tono="aviso">Hay {resumen.pedidosParaLlevarPendientes} pedidos para llevar sin retirar.</Alerta> : null}

        {!bloqueada ? (
          <div className="rounded-lg border border-border bg-secondary/45 p-3 text-sm">
            <strong>Qué hará el sistema</strong>
            <p className="mt-1 text-muted-foreground">
              Enviará las cuentas con productos a Caja, anulará las cuentas vacías y creará un respaldo antes de cerrar.
            </p>
          </div>
        ) : null}

        <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
          <Checkbox checked={corregirHora} onChange={(event) => setCorregirHora(event.target.checked)} />
          <span><strong className="flex items-center gap-1.5"><Clock3 size={16} aria-hidden="true" /> Corregir hora efectiva</strong><span className="mt-1 block text-muted-foreground">Úsalo si la jornada terminó antes y se está registrando el cierre tarde.</span></span>
        </label>
        {corregirHora ? (
          <Label>Fecha y hora efectiva<Input type="datetime-local" value={cierreLocal} max={fechaLocalParaInput()} onChange={(event) => setCierreLocal(event.target.value)} /></Label>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Label>Usuario autorizado<Input autoComplete="username" value={usuario} onChange={(event) => setUsuario(event.target.value)} /></Label>
          <Label>Contraseña<Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Label>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><LockKeyhole size={15} aria-hidden="true" /> Debe autorizar Administración o un encargado.</p>
        {error ? <Alerta>{error}</Alerta> : null}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={procesando} onClick={onCancelar}>Volver</Button>
          <Button
            type="button"
            variant="destructive"
            disabled={procesando || bloqueada || !usuario.trim() || !password}
            onClick={() => onConfirmar({
              usuario: usuario.trim(),
              password,
              cierreEn: corregirHora && cierreLocal ? new Date(cierreLocal).toISOString() : undefined,
            })}
          >
            <AlertTriangle size={17} aria-hidden="true" /> {procesando ? "Cerrando…" : "Cerrar todas y finalizar jornada"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
