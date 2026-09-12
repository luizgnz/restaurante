import {
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog.tsx";
import {
  ordenPuedeEditar,
  type CuentaDetalleUi,
  type OrdenCuentaUi,
} from "./CuentaMesa.tsx";

type Props = {
  cuenta: CuentaDetalleUi;
  ordenId?: number | null;
  onEditarOrden: (orden: OrdenCuentaUi) => void;
  onAnularOrden: (orden: OrdenCuentaUi) => void;
  onCerrar: () => void;
};

export function ModalOrdenesCuenta({ cuenta, ordenId = null, onEditarOrden, onAnularOrden, onCerrar }: Props) {
  const ordenes = ordenId == null ? cuenta.ordenes : cuenta.ordenes.filter((orden) => orden.id === ordenId);
  const ordenSeleccionada = ordenId == null ? null : ordenes[0] ?? null;
  const destino = cuenta.tipoServicio === "para_llevar"
    ? `Para llevar #${cuenta.numeroServicio}${cuenta.clienteNombre ? ` · ${cuenta.clienteNombre}` : ""}`
    : `Mesa ${cuenta.mesa.numero}`;
  const tituloCuenta = cuenta.tipoServicio === "para_llevar" ? destino : `Cuenta de mesa #${cuenta.mesa.numero}`;
  return (
    <Dialog
      aria-label={ordenSeleccionada ? `Acciones para Orden #${ordenSeleccionada.id}` : tituloCuenta}
      onOverlayClick={onCerrar}
    >
      <DialogContent className="ordenes-cuenta-modal">
        <header className="ordenes-cuenta-modal__titulo">
          <DialogTitle>{ordenSeleccionada ? `Orden #${ordenSeleccionada.id} · ${destino}` : tituloCuenta}</DialogTitle>
          <Button type="button" variant="ghost" size="icon" aria-label="Cerrar detalle de la orden" onClick={onCerrar}>
            <X size={20} aria-hidden="true" />
          </Button>
        </header>
        {ordenes.map((orden) => (
          <article className="ordenes-cuenta-modal__orden" key={orden.id}>
            <header className="ordenes-cuenta-modal__cabecera">
              <strong>Orden #{orden.id}</strong>
              {ordenSeleccionada ? null : <span className="ordenes-cuenta-modal__acciones">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="icono-secundario"
                  disabled={!ordenPuedeEditar(orden)}
                  title={ordenPuedeEditar(orden) ? "Editar orden" : "Cocina ya inició la orden; agrega una orden nueva"}
                  aria-label={`Editar Orden #${orden.id}`}
                  onClick={() => {
                    if (ordenPuedeEditar(orden)) onEditarOrden(orden);
                  }}
                >
                  <Pencil size={18} aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="icono-secundario"
                  disabled={!ordenPuedeEditar(orden)}
                  title={ordenPuedeEditar(orden) ? cuenta.tipoServicio === "para_llevar" ? "Anular orden · requiere Administración o encargado de turno" : "Anular orden · requiere motivo y PIN" : "Cocina ya inició la orden; la cancelación se resuelve desde Cocina"}
                  aria-label={`Anular Orden #${orden.id}`}
                  onClick={() => {
                    if (ordenPuedeEditar(orden)) onAnularOrden(orden);
                  }}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </Button>
              </span>}
            </header>
            <p className="ordenes-cuenta-modal__productos">
              {orden.lineas
                .filter((linea) => linea.cantidad > 0)
                .map((linea) => `${linea.cantidad} × ${linea.nombre}${linea.nota ? ` (${linea.nota})` : ""}`)
                .join(", ")}
            </p>
          </article>
        ))}
        {ordenSeleccionada && ordenPuedeEditar(ordenSeleccionada) ? (
          <div className="ordenes-cuenta-modal__acciones-principales">
            <Button
              type="button"
              title="Editar orden"
              onClick={() => onEditarOrden(ordenSeleccionada)}
            >
              <Pencil size={18} aria-hidden="true" /> Editar orden
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="ordenes-cuenta-modal__eliminar"
              title={cuenta.tipoServicio === "para_llevar" ? "Requiere Administración o encargado de turno" : "Requiere motivo y PIN"}
              onClick={() => onAnularOrden(ordenSeleccionada)}
            >
              <Trash2 size={18} aria-hidden="true" /> Anular orden
            </Button>
          </div>
        ) : ordenSeleccionada ? (
          <p className="ordenes-cuenta-modal__bloqueo">
            Cocina ya inició esta orden. Para cancelar un producto, repórtalo y resuélvelo desde Cocina.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
