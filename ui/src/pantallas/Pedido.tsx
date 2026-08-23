import { useState } from "react";

type Producto = {
  id: number;
  nombre: string;
  precio_centavos: number;
  armable: number;
  codigo?: string | null;
  color?: string | null;
  foto_data?: string | null;
};
type Linea = {
  id: number;
  producto_id?: number;
  nombre: string;
  cantidad: number;
  estado: string;
  nota?: string | null;
  sePuedeEditar?: boolean;
};

type Props = {
  productos: Producto[];
  lineas: Linea[];
  mesaNumero?: number | null;
  notaPrivada: string;
  indicaciones: string;
  sinMesa?: boolean;
  enviando?: boolean;
  onAgregar: (productoId: number) => void;
  onEnviar: () => void;
  onPrecuenta: () => void;
  onAsignarMesa?: () => void;
  onQuitar?: (lineaId: number) => void;
  onCantidad?: (lineaId: number, cantidad: number) => void;
  onNotaLinea?: (lineaId: number, nota: string) => void;
  onNotaPrivada: (nota: string) => void;
  onIndicaciones: (nota: string) => void;
  onGuardarNotas: (notas: { notaPrivada: string; indicaciones: string }) => void;
};

export function Pedido({
  productos,
  lineas,
  mesaNumero,
  notaPrivada,
  indicaciones,
  sinMesa,
  enviando,
  onAgregar,
  onEnviar,
  onPrecuenta,
  onAsignarMesa,
  onQuitar,
  onCantidad,
  onNotaLinea,
  onNotaPrivada,
  onIndicaciones,
  onGuardarNotas,
}: Props) {
  const titulo = mesaNumero ? `Orden de mesa #${mesaNumero}` : "Orden sin mesa";
  const hayNuevas = lineas.some((l) => l.estado === "nueva");
  const [productoAbierto, setProductoAbierto] = useState<number | null>(null);
  const producto = productos.find((p) => p.id === productoAbierto);
  const lineaAbierta = lineas.find((l) => l.producto_id === productoAbierto && l.sePuedeEditar);

  function abrirProducto(p: Producto) {
    if (productoAbierto !== null) return;
    if (!lineas.some((l) => l.producto_id === p.id && l.sePuedeEditar)) onAgregar(p.id);
    setProductoAbierto(p.id);
  }

  function sumar() {
    if (!producto) return;
    if (lineaAbierta && onCantidad) onCantidad(lineaAbierta.id, lineaAbierta.cantidad + 1);
    else onAgregar(producto.id);
  }

  function restar() {
    if (!lineaAbierta || !onCantidad) return;
    if (lineaAbierta.cantidad <= 1) {
      onCantidad(lineaAbierta.id, 0);
      setProductoAbierto(null);
      return;
    }
    onCantidad(lineaAbierta.id, lineaAbierta.cantidad - 1);
  }

  return (
    <div className="con-pedido">
      <section>
        <h1>{titulo}</h1>
        <div className="carta">
          {productos.map((p) => (
            <button
              key={p.id}
              className="carta__item"
              style={p.color ? { borderColor: p.color } : undefined}
              onClick={() => abrirProducto(p)}
            >
              {p.foto_data ? <img src={p.foto_data} alt="" className="carta__foto" /> : null}
              {p.nombre}
              {p.codigo ? (
                <>
                  <br />
                  {p.codigo}
                </>
              ) : null}
              <br />
              ${p.precio_centavos}
            </button>
          ))}
        </div>
      </section>
      <aside className="tarjeta">
        <h2>{titulo}</h2>
        {lineas.map((l) => (
          <div className="pedido-linea" key={l.id}>
            {l.sePuedeEditar && l.producto_id && onCantidad ? (
              <button
                type="button"
                className="pedido-linea__abrir"
                title="Cambiar cantidad"
                onClick={() => setProductoAbierto(l.producto_id ?? null)}
              >
                {l.cantidad} × {l.nombre} ({l.estado})
              </button>
            ) : (
              <span>
                {l.cantidad} × {l.nombre} ({l.estado})
              </span>
            )}
            {l.sePuedeEditar && onQuitar ? (
              <button type="button" className="peligro" onClick={() => onQuitar(l.id)}>
                Anular
              </button>
            ) : null}
            {onNotaLinea && l.sePuedeEditar ? (
              <input
                className="pedido-nota"
                placeholder="Nota del producto"
                defaultValue={l.nota ?? ""}
                onBlur={(e) => onNotaLinea(l.id, e.target.value)}
              />
            ) : l.nota ? (
              <span className="pedido-nota-fija">{l.nota}</span>
            ) : null}
          </div>
        ))}
        <label>
          Indicaciones del cliente
          <textarea
            className="pedido-nota-area"
            placeholder="Opcional. Va a cocina."
            value={indicaciones}
            onChange={(e) => onIndicaciones(e.target.value)}
            onBlur={(e) => onGuardarNotas({ indicaciones: e.target.value, notaPrivada })}
          />
        </label>
        <label>
          Nota privada
          <textarea
            className="pedido-nota-area"
            placeholder="Opcional. Solo en el POS."
            value={notaPrivada}
            onChange={(e) => onNotaPrivada(e.target.value)}
            onBlur={(e) => onGuardarNotas({ notaPrivada: e.target.value, indicaciones })}
          />
        </label>
        {sinMesa && onAsignarMesa ? <button onClick={onAsignarMesa}>Asignar mesa</button> : null}
        <button className="primario" onClick={onEnviar} disabled={!hayNuevas || enviando}>
          {enviando ? "Enviando…" : "Enviar"}
        </button>
        {!hayNuevas ? <p className="login-odoo__ayuda">Agrega productos para enviar a cocina.</p> : null}
        <button onClick={onPrecuenta}>Precuenta</button>
      </aside>
      {producto ? (
        <div
          className="modal-fondo"
          role="dialog"
          aria-modal="true"
          aria-label={`Cantidad de ${producto.nombre}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setProductoAbierto(null);
          }}
        >
          <div className="modal-caja">
            {producto.foto_data ? <img src={producto.foto_data} alt="" className="modal-foto" /> : null}
            <h2>{producto.nombre}</h2>
            <div className="modal-cantidad">
              <button type="button" className="tactil" aria-label="Quitar una unidad" onClick={restar}>
                −
              </button>
              <strong>{lineaAbierta?.cantidad ?? 0}</strong>
              <button type="button" className="tactil" aria-label="Agregar una unidad" onClick={sumar}>
                +
              </button>
            </div>
            <button type="button" className="primario tactil" onClick={() => setProductoAbierto(null)}>
              Listo
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
