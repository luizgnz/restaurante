type Props = {
  texto: string;
  onVolver: () => void;
  onContinuar: () => void;
};

export function VistaPreviaComanda({ texto, onVolver, onContinuar }: Props) {
  return (
    <div
      className="modal-fondo"
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar comanda"
      onClick={(e) => {
        if (e.target === e.currentTarget) onVolver();
      }}
    >
      <div className="modal-caja ticket-preview">
        <h2>Confirmar comanda</h2>
        <pre className="ticket-preview__cuerpo">{texto}</pre>
        <div className="form-odoo__acciones">
          <button type="button" onClick={onVolver}>
            Volver
          </button>
          <button type="button" className="primario" onClick={onContinuar}>
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}
