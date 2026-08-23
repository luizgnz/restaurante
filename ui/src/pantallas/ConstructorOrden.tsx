import { Send, Trash2 } from "lucide-react";
import { useState } from "react";
import type { BorradorOrden } from "../lib/borradores.ts";

export type ProductoCarta = {
  id: number;
  nombre: string;
  precio_centavos: number;
  armable: number;
  codigo?: string | null;
  color?: string | null;
  foto_data?: string | null;
};

export type ConstructorOrdenProps = {
  mesaFija?: { id: number; numero: number };
  cuentaId?: number;
  mesasSeleccionables?: Array<{ id: number; numero: number; estado: "libre" | "ocupada" }>;
  productos: ProductoCarta[];
  borrador: BorradorOrden;
  onCambiar: (borrador: BorradorOrden) => void;
  onEnviar: (borrador: BorradorOrden) => Promise<void>;
  onCancelar: () => void;
};

export type LineaConstructorUi = BorradorOrden["lineas"][number] & { idUi: string };

function uuid() {
  return globalThis.crypto?.randomUUID?.() ?? `ui-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function crearLineasConstructor(
  lineas: BorradorOrden["lineas"],
  generarId: () => string = uuid,
): LineaConstructorUi[] {
  return lineas.map((linea) => ({ ...linea, idUi: generarId() }));
}

export function actualizarLineaConstructor(
  lineas: LineaConstructorUi[],
  idUi: string,
  patch: Partial<Omit<LineaConstructorUi, "idUi">>,
): LineaConstructorUi[] {
  return lineas.map((linea) => (linea.idUi === idUi ? { ...linea, ...patch } : linea));
}

export function lineasPersistibles(lineas: LineaConstructorUi[]): BorradorOrden["lineas"] {
  return lineas
    .filter((linea) => linea.cantidad > 0)
    .map(({ productoId, cantidad, nota }) => ({ productoId, cantidad, nota }));
}

/**
 * Revela el control de un producto sin sumar unidades. Descarta los revelados
 * anteriores que quedaron en cero: solo siguen activos los que tienen unidades
 * y el último que se tocó.
 */
export function revelarProducto(
  lineas: LineaConstructorUi[],
  productoId: number,
  generarId: () => string = uuid,
): LineaConstructorUi[] {
  if (lineas.some((linea) => linea.productoId === productoId)) return lineas;
  return [...lineas.filter((linea) => linea.cantidad > 0), { idUi: generarId(), productoId, cantidad: 0, nota: "" }];
}

export function ConstructorOrden({
  mesaFija,
  cuentaId,
  mesasSeleccionables = [],
  productos,
  borrador,
  onCambiar,
  onEnviar,
  onCancelar,
}: ConstructorOrdenProps) {
  const [enviando, setEnviando] = useState(false);
  const [lineasUi, setLineasUi] = useState(() => crearLineasConstructor(borrador.lineas));
  const titulo = mesaFija ? `Nueva orden · Mesa #${mesaFija.numero}` : "Nueva orden";
  const mesaId = mesaFija?.id ?? borrador.mesaId;

  function cambiar(patch: Partial<BorradorOrden>) {
    onCambiar({ ...borrador, ...patch, actualizadoEn: new Date().toISOString() });
  }

  function cambiarLineas(lineas: LineaConstructorUi[]) {
    setLineasUi(lineas);
    cambiar({ lineas: lineasPersistibles(lineas) });
  }

  function mostrarProducto(productoId: number) {
    cambiarLineas(revelarProducto(lineasUi, productoId));
  }

  function sumarProducto(productoId: number) {
    const linea = lineasUi.find((item) => item.productoId === productoId);
    if (linea) {
      cambiarLineas(actualizarLineaConstructor(lineasUi, linea.idUi, { cantidad: linea.cantidad + 1 }));
      return;
    }
    cambiarLineas([...lineasUi, { idUi: uuid(), productoId, cantidad: 1, nota: "" }]);
  }

  function restarProducto(productoId: number) {
    const linea = lineasUi.find((item) => item.productoId === productoId);
    if (!linea) return;
    cambiarLineas(
      linea.cantidad > 1
        ? actualizarLineaConstructor(lineasUi, linea.idUi, { cantidad: linea.cantidad - 1 })
        : lineasUi.filter((item) => item.idUi !== linea.idUi),
    );
  }

  async function enviar() {
    const lineas = lineasPersistibles(lineasUi);
    if (enviando || !mesaId || lineas.length === 0) return;
    setEnviando(true);
    try {
      await onEnviar({ ...borrador, mesaId, cuentaId, lineas });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="constructor-orden">
      <header className="constructor-orden__cabecera">
        <h1>{titulo}</h1>
        {!mesaFija ? (
          <label>
            Mesa
            <select
              aria-label="Mesa para la nueva orden"
              value={borrador.mesaId ?? ""}
              onChange={(event) => cambiar({ mesaId: Number(event.target.value) || undefined })}
            >
              <option value="">Selecciona una mesa</option>
              {mesasSeleccionables
                .filter((mesa) => mesa.estado === "libre")
                .map((mesa) => (
                  <option key={mesa.id} value={mesa.id}>
                    Mesa #{mesa.numero}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
      </header>

      <div className="constructor-orden__cuerpo">
        <aside className="tarjeta constructor-orden__resumen">
          <h2>Orden nueva</h2>
          {lineasUi
            .filter((linea) => linea.cantidad > 0)
            .map((linea) => {
              const producto = productos.find((item) => item.id === linea.productoId);
              return (
                <div className="constructor-linea" key={linea.idUi}>
                  <div className="constructor-linea__titulo">
                    <strong>
                      {linea.cantidad} × {producto?.nombre ?? `Producto ${linea.productoId}`}
                    </strong>
                    <button
                      type="button"
                      className="icono-secundario"
                      title="Quitar producto"
                      onClick={() => cambiarLineas(lineasUi.filter((item) => item.idUi !== linea.idUi))}
                    >
                      <Trash2 size={18} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          {lineasPersistibles(lineasUi).length === 0 ? (
            <p className="login-odoo__ayuda">Toca un producto del menú para agregarlo.</p>
          ) : null}
          <label>
            Indicaciones del cliente
            <textarea
              className="pedido-nota-area"
              placeholder="Opcional. Va a cocina."
              value={borrador.indicaciones}
              onChange={(event) => cambiar({ indicaciones: event.target.value })}
            />
          </label>
          <div className="constructor-orden__acciones">
            <button type="button" onClick={onCancelar}>
              Cancelar
            </button>
            <button
              type="button"
              className="primario"
              disabled={!mesaId || lineasPersistibles(lineasUi).length === 0 || enviando}
              onClick={enviar}
            >
              <Send size={18} aria-hidden="true" /> {enviando ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </aside>

        <div className="carta constructor-orden__carta">
          {productos.map((producto) => {
            const linea = lineasUi.find((item) => item.productoId === producto.id);
            return (
              <div
                key={producto.id}
                role="button"
                tabIndex={0}
                className={`carta__item${linea ? " is-on" : ""}`}
                style={producto.color ? { borderColor: producto.color } : undefined}
                onClick={() => mostrarProducto(producto.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    mostrarProducto(producto.id);
                  }
                }}
              >
                {producto.foto_data ? <img src={producto.foto_data} alt="" className="carta__foto" /> : null}
                <strong>{producto.nombre}</strong>
                {producto.codigo ? <span>{producto.codigo}</span> : null}
                <span>${producto.precio_centavos}</span>
                {linea ? (
                  <span className="carta__cantidad" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      aria-label={`Quitar una unidad de ${producto.nombre}`}
                      onClick={() => restarProducto(producto.id)}
                    >
                      −
                    </button>
                    <strong>{linea.cantidad}</strong>
                    <button
                      type="button"
                      aria-label={`Agregar una unidad de ${producto.nombre}`}
                      onClick={() => sumarProducto(producto.id)}
                    >
                      +
                    </button>
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
