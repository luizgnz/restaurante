type Producto = { id: number; nombre: string; precio_centavos: number; armable: number };
type Linea = { id: number; nombre: string; cantidad: number; estado: string; sePuedeEditar?: boolean };

type Props = {
  productos: Producto[];
  lineas: Linea[];
  sinMesa?: boolean;
  onAgregar: (productoId: number) => void;
  onEnviar: () => void;
  onPrecuenta: () => void;
  onCaja: () => void;
  onAsignarMesa?: () => void;
  onQuitar?: (lineaId: number) => void;
  onCantidad?: (lineaId: number, cantidad: number) => void;
};

export function Pedido({
  productos,
  lineas,
  sinMesa,
  onAgregar,
  onEnviar,
  onPrecuenta,
  onCaja,
  onAsignarMesa,
  onQuitar,
  onCantidad,
}: Props) {
  return (
    <div className="con-pedido">
      <section>
        <h1>Carta</h1>
        <div className="carta">
          {productos.map((p) => (
            <button key={p.id} onClick={() => onAgregar(p.id)}>
              {p.nombre}
              <br />
              ${p.precio_centavos} · armable {Number.isFinite(p.armable) ? p.armable : "∞"}
            </button>
          ))}
        </div>
      </section>
      <aside className="tarjeta">
        <h2>Pedido</h2>
        {lineas.map((l) => (
          <div className="pedido-linea" key={l.id}>
            <span>
              {l.cantidad} × {l.nombre} ({l.estado})
            </span>
            {l.sePuedeEditar && onCantidad ? (
              <>
                <button type="button" onClick={() => onCantidad(l.id, l.cantidad - 1)}>
                  −
                </button>
                <button type="button" onClick={() => onCantidad(l.id, l.cantidad + 1)}>
                  +
                </button>
              </>
            ) : null}
            {l.sePuedeEditar && onQuitar ? (
              <button type="button" className="peligro" onClick={() => onQuitar(l.id)}>
                Anular
              </button>
            ) : null}
          </div>
        ))}
        {sinMesa && onAsignarMesa ? <button onClick={onAsignarMesa}>Asignar mesa</button> : null}
        <button className="primario" onClick={onEnviar}>
          Enviar
        </button>
        <button onClick={onPrecuenta}>Precuenta</button>
        <button className="peligro" onClick={onCaja}>
          Enviar a caja
        </button>
      </aside>
    </div>
  );
}
