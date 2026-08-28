import { useState } from "react";
import { Button } from "../components/ui/button.tsx";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";
import { Textarea } from "../components/ui/textarea.tsx";

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
              <Button type="button" variant="destructive" className="peligro" onClick={() => onQuitar(l.id)}>
                Anular
              </Button>
            ) : null}
            {onNotaLinea && l.sePuedeEditar ? (
              <Input
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
        <Label>
          Indicaciones del cliente
          <Textarea
            className="pedido-nota-area"
            placeholder="Opcional. Va a cocina."
            value={indicaciones}
            onChange={(e) => onIndicaciones(e.target.value)}
            onBlur={(e) => onGuardarNotas({ indicaciones: e.target.value, notaPrivada })}
          />
        </Label>
        <Label>
          Nota privada
          <Textarea
            className="pedido-nota-area"
            placeholder="Opcional. Solo en el POS."
            value={notaPrivada}
            onChange={(e) => onNotaPrivada(e.target.value)}
            onBlur={(e) => onGuardarNotas({ notaPrivada: e.target.value, indicaciones })}
          />
        </Label>
        {sinMesa && onAsignarMesa ? (
          <Button variant="secondary" onClick={onAsignarMesa}>
            Asignar mesa
          </Button>
        ) : null}
        <Button className="primario" onClick={onEnviar} disabled={!hayNuevas || enviando}>
          {enviando ? "Enviando…" : "Enviar"}
        </Button>
        {!hayNuevas ? <p className="login-odoo__ayuda">Agrega productos para enviar a cocina.</p> : null}
        <Button variant="secondary" onClick={onPrecuenta}>
          Precuenta
        </Button>
      </aside>
      {producto ? (
        <Dialog aria-label={`Cantidad de ${producto.nombre}`} onOverlayClick={() => setProductoAbierto(null)}>
          <DialogContent>
            {producto.foto_data ? <img src={producto.foto_data} alt="" className="modal-foto" /> : null}
            <DialogTitle>{producto.nombre}</DialogTitle>
            <div className="modal-cantidad">
              <Button type="button" variant="secondary" className="tactil" aria-label="Quitar una unidad" onClick={restar}>
                −
              </Button>
              <strong>{lineaAbierta?.cantidad ?? 0}</strong>
              <Button type="button" variant="secondary" className="tactil" aria-label="Agregar una unidad" onClick={sumar}>
                +
              </Button>
            </div>
            <Button type="button" className="primario tactil" onClick={() => setProductoAbierto(null)}>
              Listo
            </Button>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
