import { Pencil, Trash2 } from "lucide-react";
import type { CuentaDetalleUi, OrdenCuentaUi } from "./CuentaMesa.tsx";

type Props = {
  cuenta: CuentaDetalleUi;
  onEditarOrden: (orden: OrdenCuentaUi) => void;
  onAnularOrden: (orden: OrdenCuentaUi) => void;
  onCerrar: () => void;
};

export function ModalOrdenesCuenta({ cuenta, onEditarOrden, onAnularOrden, onCerrar }: Props) {
  return (
    <div
      className="modal-fondo"
      role="dialog"
      aria-modal="true"
      aria-label={`Órdenes de mesa #${cuenta.mesa.numero}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCerrar();
      }}
    >
      <div className="modal-caja ordenes-cuenta-modal">
        <h2>Cuenta de mesa #{cuenta.mesa.numero}</h2>
        {cuenta.ordenes.map((orden) => (
          <article className="ordenes-cuenta-modal__orden" key={orden.id}>
            <header className="ordenes-cuenta-modal__cabecera">
              <strong>Orden #{orden.numero}</strong>
              <span className="ordenes-cuenta-modal__acciones">
                <button
                  type="button"
                  className="icono-secundario"
                  title="Editar orden"
                  onClick={() => onEditarOrden(orden)}
                >
                  <Pencil size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icono-secundario peligro"
                  title="Anular orden"
                  onClick={() => onAnularOrden(orden)}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </span>
            </header>
            <p className="ordenes-cuenta-modal__productos">
              {orden.lineas
                .filter((linea) => linea.cantidad > 0)
                .map((linea) => `${linea.cantidad} × ${linea.nombre}${linea.nota ? ` (${linea.nota})` : ""}`)
                .join(", ")}
            </p>
          </article>
        ))}
        <button type="button" className="primario tactil" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
