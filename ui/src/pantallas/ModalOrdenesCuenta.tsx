import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { DialogContent, DialogOverlay, DialogTitle } from "@/components/ui/dialog.tsx";
import type { CuentaDetalleUi, OrdenCuentaUi } from "./CuentaMesa.tsx";

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
  return (
    <DialogOverlay
      role="dialog"
      aria-modal="true"
      aria-label={ordenSeleccionada ? `Acciones para Orden #${ordenSeleccionada.numero}` : `Órdenes de mesa #${cuenta.mesa.numero}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCerrar();
      }}
    >
      <DialogContent className="ordenes-cuenta-modal">
        <DialogTitle>{ordenSeleccionada ? `Orden #${ordenSeleccionada.numero} · Mesa ${cuenta.mesa.numero}` : `Cuenta de mesa #${cuenta.mesa.numero}`}</DialogTitle>
        {ordenes.map((orden) => (
          <article className="ordenes-cuenta-modal__orden" key={orden.id}>
            <header className="ordenes-cuenta-modal__cabecera">
              <strong>Orden #{orden.numero}</strong>
              {ordenSeleccionada ? null : <span className="ordenes-cuenta-modal__acciones">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="icono-secundario"
                  title="Editar orden"
                  onClick={() => onEditarOrden(orden)}
                >
                  <Pencil size={18} aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="icono-secundario"
                  title="Anular orden"
                  onClick={() => onAnularOrden(orden)}
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
        {ordenSeleccionada ? (
          <div className="ordenes-cuenta-modal__acciones-principales">
            <Button type="button" variant="outline" onClick={() => onEditarOrden(ordenSeleccionada)}>
              <Pencil size={18} aria-hidden="true" /> Editar pedido
            </Button>
            <Button type="button" variant="destructive" onClick={() => onAnularOrden(ordenSeleccionada)}>
              <Trash2 size={18} aria-hidden="true" /> Eliminar pedido
            </Button>
          </div>
        ) : null}
        <Button type="button" onClick={onCerrar}>
          Cerrar
        </Button>
      </DialogContent>
    </DialogOverlay>
  );
}
