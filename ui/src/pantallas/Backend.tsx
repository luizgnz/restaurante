type Props = {
  onCrearProducto: () => void;
  onCategorias: () => void;
  onEditarMapa: () => void;
  onMesas: () => void;
};

export function Backend({ onCrearProducto, onCategorias, onEditarMapa, onMesas }: Props) {
  return (
    <section className="backend-odoo">
      <h1>Backend</h1>
      <p className="login-odoo__ayuda">Back-office del local. Módulo restaurante: carta y pisos.</p>
      <div className="backend-odoo__atajos">
        <button type="button" className="tactil primario" onClick={onCrearProducto}>
          Crear producto
        </button>
        <button type="button" className="tactil primario" onClick={onCategorias}>
          Categorías
        </button>
        <button type="button" className="tactil primario" onClick={onEditarMapa}>
          Editar mapa
        </button>
        <button type="button" className="tactil" onClick={onMesas}>
          Punto de venta
        </button>
      </div>
    </section>
  );
}
