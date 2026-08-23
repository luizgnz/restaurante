import { Plus, Send, Trash2 } from "lucide-react";
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

  function agregarLinea(productoId: number) {
    cambiarLineas([...lineasUi, { idUi: uuid(), productoId, cantidad: 1, nota: "" }]);
  }

  function cambiarCantidad(idUi: string, cantidad: number) {
    cambiarLineas(
      cantidad > 0
        ? actualizarLineaConstructor(lineasUi, idUi, { cantidad })
        : lineasUi.filter((linea) => linea.idUi !== idUi),
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
        <div className="carta">
          {productos.map((producto) => {
            return (
              <button
                type="button"
                key={producto.id}
                className="carta__item"
                style={producto.color ? { borderColor: producto.color } : undefined}
                onClick={() => agregarLinea(producto.id)}
              >
                {producto.foto_data ? <img src={producto.foto_data} alt="" className="carta__foto" /> : null}
                <strong>{producto.nombre}</strong>
                {producto.codigo ? <span>{producto.codigo}</span> : null}
                <span>${producto.precio_centavos}</span>
                <span className="constructor-orden__agregar">
                  <Plus size={18} aria-hidden="true" /> Agregar línea
                </span>
              </button>
            );
          })}
        </div>

        <aside className="tarjeta constructor-orden__resumen">
          <h2>Orden nueva</h2>
          {lineasUi.map((linea) => {
            const producto = productos.find((item) => item.id === linea.productoId);
            return (
              <div className="constructor-linea" key={linea.idUi}>
                <div className="constructor-linea__titulo">
                  <strong>{producto?.nombre ?? `Producto ${linea.productoId}`}</strong>
                  <button
                    type="button"
                    className="icono-secundario"
                    title="Quitar producto"
                    onClick={() => cambiarCantidad(linea.idUi, 0)}
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </div>
                <div className="modal-cantidad">
                  <button
                    type="button"
                    className="tactil"
                    aria-label="Quitar una unidad"
                    onClick={() => cambiarCantidad(linea.idUi, linea.cantidad - 1)}
                  >
                    −
                  </button>
                  <strong>{linea.cantidad}</strong>
                  <button
                    type="button"
                    className="tactil"
                    aria-label="Agregar una unidad"
                    onClick={() => cambiarCantidad(linea.idUi, linea.cantidad + 1)}
                  >
                    +
                  </button>
                </div>
                <label>
                  Nota del producto
                  <input
                    value={linea.nota}
                    onChange={(event) =>
                      cambiarLineas(actualizarLineaConstructor(lineasUi, linea.idUi, { nota: event.target.value }))
                    }
                  />
                </label>
              </div>
            );
          })}
          {lineasUi.length === 0 ? <p className="login-odoo__ayuda">Agrega productos para enviar.</p> : null}
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
      </div>
    </section>
  );
}
