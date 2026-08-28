import { Plus, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import type { BorradorOrden } from "../lib/borradores.ts";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";
import { Select, SelectItem } from "../components/ui/select.tsx";
import { Textarea } from "../components/ui/textarea.tsx";

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

  const mesasLibres = mesasSeleccionables.filter((mesa) => mesa.estado === "libre");

  return (
    <section className="constructor-orden flex flex-col gap-4">
      <header className="constructor-orden__cabecera flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-2xl font-semibold tracking-tight">{titulo}</h1>
        {!mesaFija ? (
          <Label className="min-w-56">
            Mesa
            <Select
              aria-label="Mesa para la nueva orden"
              value={borrador.mesaId ? String(borrador.mesaId) : undefined}
              onValueChange={(value) => cambiar({ mesaId: Number(value) || undefined })}
              placeholder="Selecciona una mesa"
            >
              {mesasLibres.map((mesa) => (
                <SelectItem key={mesa.id} value={String(mesa.id)}>
                  Mesa #{mesa.numero}
                </SelectItem>
              ))}
            </Select>
            <span className="sr-only">{mesasLibres.map((mesa) => `Mesa #${mesa.numero}`).join(", ")}</span>
          </Label>
        ) : null}
      </header>

      <div className="constructor-orden__cuerpo grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="carta grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
          {productos.map((producto) => {
            return (
              <button
                type="button"
                key={producto.id}
                className="carta__item flex flex-col items-start gap-1 rounded-3xl border border-border bg-card p-3 text-left shadow-sm transition-transform hover:-translate-y-0.5"
                style={producto.color ? { borderColor: producto.color } : undefined}
                onClick={() => agregarLinea(producto.id)}
              >
                {producto.foto_data ? <img src={producto.foto_data} alt="" className="carta__foto size-16 rounded-2xl object-cover" /> : null}
                <strong>{producto.nombre}</strong>
                {producto.codigo ? <span className="text-xs text-muted-foreground">{producto.codigo}</span> : null}
                <span className="text-sm text-muted-foreground">${producto.precio_centavos}</span>
                <span className="constructor-orden__agregar inline-flex items-center gap-1 text-sm font-semibold">
                  <Plus size={16} aria-hidden="true" /> Agregar línea
                </span>
              </button>
            );
          })}
        </div>

        <aside className="tarjeta constructor-orden__resumen flex flex-col gap-3 rounded-3xl border border-border bg-card p-4 shadow-sm">
          <h2 className="m-0 text-lg font-semibold">Orden nueva</h2>
          {lineasUi.map((linea) => {
            const producto = productos.find((item) => item.id === linea.productoId);
            return (
              <div className="constructor-linea flex flex-col gap-2 border-b border-border py-3 last:border-0" key={linea.idUi}>
                <div className="constructor-linea__titulo flex items-center justify-between gap-2">
                  <strong>{producto?.nombre ?? `Producto ${linea.productoId}`}</strong>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="icono-secundario"
                    title="Quitar producto"
                    onClick={() => cambiarCantidad(linea.idUi, 0)}
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </Button>
                </div>
                <div className="modal-cantidad flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Quitar una unidad"
                    onClick={() => cambiarCantidad(linea.idUi, linea.cantidad - 1)}
                  >
                    −
                  </Button>
                  <strong className="min-w-8 text-center text-xl">{linea.cantidad}</strong>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Agregar una unidad"
                    onClick={() => cambiarCantidad(linea.idUi, linea.cantidad + 1)}
                  >
                    +
                  </Button>
                </div>
                <Label>
                  Nota del producto
                  <Input
                    value={linea.nota}
                    onChange={(event) =>
                      cambiarLineas(actualizarLineaConstructor(lineasUi, linea.idUi, { nota: event.target.value }))
                    }
                  />
                </Label>
              </div>
            );
          })}
          {lineasUi.length === 0 ? <p className="login-odoo__ayuda text-sm text-muted-foreground">Agrega productos para enviar.</p> : null}
          <Label>
            Indicaciones del cliente
            <Textarea
              className="pedido-nota-area"
              placeholder="Opcional. Va a cocina."
              value={borrador.indicaciones}
              onChange={(event) => cambiar({ indicaciones: event.target.value })}
            />
          </Label>
          <div className="constructor-orden__acciones flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancelar}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!mesaId || lineasPersistibles(lineasUi).length === 0 || enviando}
              onClick={enviar}
            >
              <Send size={18} aria-hidden="true" /> {enviando ? "Enviando…" : "Enviar"}
            </Button>
          </div>
        </aside>
      </div>
    </section>
  );
}
