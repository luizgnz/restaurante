type Props = {
  mesaNumero: number;
  totalCentavos: number;
  onConfirmar: () => void;
  onCancelar: () => void;
};

export function ConfirmarCierreCuenta({ mesaNumero, totalCentavos, onConfirmar, onCancelar }: Props) {
  return (
    <div
      className="modal-fondo"
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar cierre de cuenta"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancelar();
      }}
    >
      <div className="modal-caja">
        <h2>¿Cerrar cuenta?</h2>
        <p className="login-odoo__ayuda">
          La cuenta de Mesa #{mesaNumero} por ${totalCentavos} se envía a caja y la mesa queda libre.
        </p>
        <div className="form-odoo__acciones">
          <button type="button" className="tactil" onClick={onCancelar}>
            Cancelar
          </button>
          <button type="button" className="primario tactil" onClick={onConfirmar}>
            Cerrar cuenta
          </button>
        </div>
      </div>
    </div>
  );
}
