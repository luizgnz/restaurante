export type LineaPedido = {
  id: number;
  nombre: string;
  cantidad: number;
  estado: string;
  sePuedeEditar: boolean;
};

export type PedidoEnCurso = {
  id: number;
  mesa: number | null;
  mesero: string;
  hace: string;
  lineas: LineaPedido[];
};

type Props = {
  tabletCocina: boolean;
  pedidos: PedidoEnCurso[];
  onAbrir: (id: number) => void;
  onQuitar: (lineaId: number) => void;
  onEnProceso: (lineaId: number) => void;
  onCantidad?: (lineaId: number, cantidad: number) => void;
  onTablet: (on: boolean) => void;
};

export function Pedidos({ tabletCocina, pedidos, onAbrir, onQuitar, onEnProceso, onCantidad, onTablet }: Props) {
  return (
    <section>
      <h1>Pedidos</h1>
      <label className="switch-tablet">
        <input type="checkbox" checked={tabletCocina} onChange={(e) => onTablet(e.target.checked)} />
        Tablet en cocina (permite anular o cambiar si aún no está en proceso)
      </label>
      {!tabletCocina ? (
        <p className="login-odoo__ayuda">Ticket en papel: lo enviado no se anula ni se cambia (no hay cómo verificarlo en cocina).</p>
      ) : null}
      <div className="kds">
        {pedidos.map((p) => (
          <article className="tarjeta" key={p.id}>
            <button className="pedido-cabecera" onClick={() => onAbrir(p.id)}>
              <strong>{p.mesa ? `Mesa ${p.mesa}` : "Sin mesa"}</strong>
              <span>
                {p.mesero} · {p.hace}
              </span>
            </button>
            {p.lineas.map((l) => (
              <div className="pedido-linea" key={l.id}>
                <span>
                  {l.cantidad} × {l.nombre}
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
                {l.sePuedeEditar ? (
                  <button className="peligro" onClick={() => onQuitar(l.id)}>
                    Anular
                  </button>
                ) : null}
                {tabletCocina && l.estado === "enviada" ? (
                  <button onClick={() => onEnProceso(l.id)}>En proceso</button>
                ) : null}
              </div>
            ))}
          </article>
        ))}
        {pedidos.length === 0 ? <p>No hay pedidos en curso</p> : null}
      </div>
    </section>
  );
}
