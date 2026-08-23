import { ChevronDown, Send, ShoppingBag, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { CSSProperties } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import type { BorradorOrden } from "../lib/borradores.ts";
import { ModalArmadoPlato, type SeleccionArmado, type SlotArmadoUi, type VarianteArmadoUi } from "./ModalArmadoPlato.tsx";

export type ProductoCarta = {
  id: number;
  nombre: string;
  precio_centavos: number;
  armable: number;
  configurable?: boolean;
  codigo?: string | null;
  color?: string | null;
  foto_data?: string | null;
};

export type ConfigContornosUi = {
  grupos: Array<{ id: number; nombre: string; variantes: VarianteArmadoUi[] }>;
  variantes: VarianteArmadoUi[];
};

export type ConstructorOrdenProps = {
  mesaFija?: { id: number; numero: number };
  cuentaId?: number;
  mesasSeleccionables?: Array<{ id: number; numero: number; estado: "libre" | "ocupada" }>;
  productos: ProductoCarta[];
  borrador: BorradorOrden;
  contornos?: ConfigContornosUi | null;
  onSlotsDeProducto?: (productoId: number) => Promise<SlotArmadoUi[]>;
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
    .map(({ productoId, cantidad, nota, contornos, contornosTexto }) => ({
      productoId,
      cantidad,
      nota,
      ...(contornos ? { contornos } : {}),
      ...(contornosTexto ? { contornosTexto } : {}),
    }));
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
  contornos,
  onSlotsDeProducto,
  onCambiar,
  onEnviar,
  onCancelar,
}: ConstructorOrdenProps) {
  const [enviando, setEnviando] = useState(false);
  const [lineasUi, setLineasUi] = useState(() => crearLineasConstructor(borrador.lineas));
  const [armado, setArmado] = useState<{ producto: ProductoCarta; slots: SlotArmadoUi[] } | null>(null);
  const [resumenMovilAbierto, setResumenMovilAbierto] = useState(false);
  const titulo = mesaFija ? `Nueva orden · Mesa #${mesaFija.numero}` : "Nueva orden";
  const mesaId = mesaFija?.id ?? borrador.mesaId;
  const cantidadProductos = lineasUi.reduce((total, linea) => total + Math.max(0, linea.cantidad), 0);

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

  async function tocarProducto(producto: ProductoCarta) {
    if (producto.configurable && contornos && onSlotsDeProducto) {
      const slots = await onSlotsDeProducto(producto.id);
      if (slots.length > 0) {
        setArmado({ producto, slots });
        return;
      }
    }
    mostrarProducto(producto.id);
  }

  function confirmarArmado(selecciones: SeleccionArmado[], resumen: string) {
    if (!armado) return;
    cambiarLineas([
      ...lineasUi,
      {
        idUi: uuid(),
        productoId: armado.producto.id,
        cantidad: 1,
        nota: "",
        contornos: selecciones,
        contornosTexto: resumen,
      },
    ]);
    setArmado(null);
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
    <>
    <section className="constructor-orden">
      <header className="constructor-orden__cabecera">
        <div>
          <span className="constructor-orden__eyebrow">Toma de pedido</span>
          <h1>{titulo}</h1>
          <p>Selecciona productos y revisa la orden antes de enviarla.</p>
        </div>
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
        <Card className={`tarjeta constructor-orden__resumen${resumenMovilAbierto ? " is-mobile-open" : ""}`}>
          <div className="constructor-orden__resumen-cabecera">
            <div>
              <span className="constructor-orden__eyebrow">Resumen</span>
              <h2>Orden nueva</h2>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="constructor-orden__cerrar-movil"
              aria-label="Cerrar orden"
              onClick={() => setResumenMovilAbierto(false)}
            >
              <X size={20} aria-hidden="true" />
            </Button>
          </div>
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
                    <Button
                      type="button"
                      variant="ghost"
                      className="icono-secundario"
                      title="Quitar producto"
                      onClick={() => cambiarLineas(lineasUi.filter((item) => item.idUi !== linea.idUi))}
                    >
                      <Trash2 size={18} aria-hidden="true" />
                    </Button>
                  </div>
                  {linea.contornosTexto ? <span className="pedido-nota-fija">{linea.contornosTexto}</span> : null}
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
            <Button type="button" variant="outline" onClick={onCancelar}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="primario"
              disabled={!mesaId || lineasPersistibles(lineasUi).length === 0 || enviando}
              onClick={enviar}
            >
              <Send size={18} aria-hidden="true" /> {enviando ? "Enviando…" : "Enviar"}
            </Button>
          </div>
        </Card>

        <div className="constructor-orden__catalogo">
          <div className="constructor-orden__catalogo-cabecera">
            <div>
              <span className="constructor-orden__eyebrow">Carta</span>
              <h2>Productos</h2>
            </div>
            <Badge variant="secondary">{productos.length} disponibles</Badge>
          </div>
          <div className="carta constructor-orden__carta">
          {productos.map((producto) => {
            const linea = lineasUi.find((item) => item.productoId === producto.id);
            return (
              <div
                key={producto.id}
                role="button"
                tabIndex={0}
                className={`carta__item${linea ? " is-on" : ""}`}
                style={producto.color ? ({ "--product-color": producto.color } as CSSProperties) : undefined}
                onClick={() => tocarProducto(producto)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    tocarProducto(producto);
                  }
                }}
              >
                {producto.foto_data ? <img src={producto.foto_data} alt="" className="carta__foto" /> : null}
                <span className="carta__contenido">
                  <strong>{producto.nombre}</strong>
                  {producto.codigo ? <span>{producto.codigo}</span> : null}
                  <span className="carta__precio">${producto.precio_centavos}</span>
                  {producto.configurable ? <Badge>Personalizable</Badge> : null}
                </span>
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
      </div>
      <Button
        type="button"
        size="lg"
        className="constructor-orden__abrir-resumen"
        onClick={() => setResumenMovilAbierto(true)}
      >
        <ShoppingBag size={20} aria-hidden="true" />
        Ver orden · {cantidadProductos} {cantidadProductos === 1 ? "producto" : "productos"}
        <ChevronDown size={18} aria-hidden="true" />
      </Button>
      {resumenMovilAbierto ? (
        <button
          type="button"
          className="constructor-orden__velo"
          aria-label="Cerrar resumen"
          onClick={() => setResumenMovilAbierto(false)}
        />
      ) : null}
    </section>
    {armado && contornos ? (
      <ModalArmadoPlato
        productoNombre={armado.producto.nombre}
        slots={armado.slots}
        variantes={contornos.variantes}
        onConfirmar={confirmarArmado}
        onCancelar={() => setArmado(null)}
      />
    ) : null}
    </>
  );
}
