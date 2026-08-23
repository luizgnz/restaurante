export type LineaPedido = {
  id: number;
  nombre: string;
  cantidad: number;
  estado: string;
  nota?: string | null;
  sePuedeEditar: boolean;
};

export type PedidoEnCurso = {
  id: number;
  mesa: number | null;
  mesero: string;
  hace: string;
  espera_min?: number;
  abierto_en?: string;
  estado?: string;
  indicaciones?: string | null;
  lineas: LineaPedido[];
};

const ESTADO: Record<string, string> = {
  borrador: "Sin completar",
  parcialmente_enviado: "Sin completar",
  enviado: "En cocina",
  precuenta_emitida: "Precuenta emitida",
};

type Props = {
  pedidos: PedidoEnCurso[];
  onAbrir: (id: number) => void;
  onEnProceso: (lineaId: number) => void;
  mostrarEnProceso?: boolean;
};

export function Pedidos({ pedidos, onAbrir, onEnProceso, mostrarEnProceso }: Props) {
  return (
    <section>
      <h1>Órdenes</h1>
      <div className="kds">
        {pedidos.map((p) => (
          <article className="tarjeta" key={p.id}>
            <button className="pedido-cabecera" onClick={() => onAbrir(p.id)}>
              <strong>{p.mesa ? `Mesa ${p.mesa}` : "Sin mesa asignada"}</strong>
              <span className="pedido-estado">{p.estado ? (ESTADO[p.estado] ?? p.estado) : "Sin completar"}</span>
              <span>
                {p.mesero} · {p.hace}
              </span>
            </button>
            {p.indicaciones ? <p className="pedido-indicaciones">{p.indicaciones}</p> : null}
            {p.lineas.map((l) => (
              <div className="pedido-linea" key={l.id}>
                <span>
                  {l.cantidad} × {l.nombre}
                  {l.nota ? ` (${l.nota})` : ""}
                </span>
                {mostrarEnProceso && l.estado === "enviada" ? (
                  <button onClick={() => onEnProceso(l.id)}>En proceso</button>
                ) : null}
              </div>
            ))}
            {p.lineas.length === 0 ? <p className="login-odoo__ayuda">Sin productos aún</p> : null}
          </article>
        ))}
        {pedidos.length === 0 ? <p>No hay pedidos en curso</p> : null}
      </div>
    </section>
  );
}
