import {
  Beer,
  Beef,
  Coffee,
  Croissant,
  CupSoda,
  Fish,
  IceCreamCone,
  Pizza,
  Salad,
  Sandwich,
  Soup,
  Utensils,
  UtensilsCrossed,
  Wine,
  ChevronDown,
  MessageSquarePlus,
  Search,
  Send,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Select } from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import type { BorradorOrden } from "../lib/borradores.ts";
import { dinero } from "../../../src/modules/formato.ts";
import { ModalArmadoPlato, type SeleccionArmado, type SlotArmadoUi, type VarianteArmadoUi } from "./ModalArmadoPlato.tsx";

export type ProductoCarta = {
  id: number;
  nombre: string;
  precio_centavos: number;
  armable: number;
  configurable?: boolean;
  categoria_id?: number | null;
  categoria_nombre?: string | null;
  codigo?: string | null;
  color?: string | null;
  foto_data?: string | null;
};

/* Iconografía por categoría: cuando un producto no tiene foto, la tarjeta
   muestra el ícono de su categoría sobre un velo del color de la categoría,
   así la carta se recorre por color + forma sin leer un solo nombre.
   Las claves van normalizadas (minúsculas, sin tildes); para sumar una
   categoría nueva basta agregar una línea a este mapa. */
const ICONOS_CATEGORIA: Record<string, typeof Utensils> = {
  agua: CupSoda,
  almuerzo: UtensilsCrossed,
  asado: Beef,
  bar: Beer,
  bebida: CupSoda,
  cafe: Coffee,
  cafeteria: Coffee,
  caldo: Soup,
  carne: Beef,
  cazuela: Soup,
  cerveza: Beer,
  comida: UtensilsCrossed,
  dulce: IceCreamCone,
  entradas: UtensilsCrossed,
  ensalada: Salad,
  fondo: UtensilsCrossed,
  gaseosa: CupSoda,
  hamburguesa: Sandwich,
  helado: IceCreamCone,
  infusiones: Coffee,
  jugo: CupSoda,
  mariscos: Fish,
  "menu del dia": UtensilsCrossed,
  pan: Croissant,
  panaderia: Croissant,
  pasteleria: Croissant,
  parrilla: Beef,
  pescado: Fish,
  pizza: Pizza,
  postre: IceCreamCone,
  refresco: CupSoda,
  sandwich: Sandwich,
  sanguche: Sandwich,
  sopa: Soup,
  te: Coffee,
  trago: Beer,
  vino: Wine,
};
const ICONO_CATEGORIA_DEFAULT = Utensils;

function normalizarCategoria(nombre?: string | null): string {
  return (nombre ?? "")
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function iconoCategoria(categoriaNombre?: string | null): typeof Utensils {
  const clave = normalizarCategoria(categoriaNombre);
  if (!clave) return ICONO_CATEGORIA_DEFAULT;
  return ICONOS_CATEGORIA[clave] ?? ICONOS_CATEGORIA[clave.replace(/s$/, "")] ?? ICONO_CATEGORIA_DEFAULT;
}

/* Color estable por categoría para las que no definen color en administración:
   FNV-1a sobre el nombre normalizado → matiz HSL de tono medio. El velo y el
   tinte del ícono los calcula CSS con color-mix para cuidar el contraste. */
export function colorCategoria(categoriaNombre?: string | null): string {
  const clave = normalizarCategoria(categoriaNombre) || "sin categoria";
  let hash = 0x811c9dc5;
  for (let i = 0; i < clave.length; i += 1) {
    hash ^= clave.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `hsl(${hash % 360} 62% 46%)`;
}

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
    .map(({ productoId, cantidad, nota, contornos, contornosTexto, adicionalCentavos }) => ({
      productoId,
      cantidad,
      nota,
      ...(contornos ? { contornos } : {}),
      ...(contornosTexto ? { contornosTexto } : {}),
      ...(adicionalCentavos ? { adicionalCentavos } : {}),
    }));
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
  const [resumenAbierto, setResumenAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [busquedaAbierta, setBusquedaAbierta] = useState(false);
  const [indicacionesAbiertas, setIndicacionesAbiertas] = useState(Boolean(borrador.indicaciones));
  const [categoria, setCategoria] = useState<string | "todas">("todas");
  const titulo = mesaFija ? `Nueva orden · Mesa #${mesaFija.numero}` : "Nueva orden";
  const mesaId = mesaFija?.id ?? borrador.mesaId;
  const cantidadProductos = lineasUi.reduce((total, linea) => total + Math.max(0, linea.cantidad), 0);
  const totalOrden = lineasUi.reduce((total, linea) => {
    if (linea.cantidad <= 0) return total;
    const unitario = (productos.find((item) => item.id === linea.productoId)?.precio_centavos ?? 0) + (linea.adicionalCentavos ?? 0);
    return total + unitario * linea.cantidad;
  }, 0);
  const categorias = [...new Set(productos.map((producto) => producto.categoria_nombre?.trim()).filter((nombre): nombre is string => Boolean(nombre)))].sort((a, b) => a.localeCompare(b, "es"));
  const termino = busqueda.trim().toLocaleLowerCase("es");
  const productosVisibles = productos.filter((producto) => {
    if (categoria !== "todas" && producto.categoria_nombre?.trim() !== categoria) return false;
    return !termino || producto.nombre.toLocaleLowerCase("es").includes(termino) || producto.codigo?.toLocaleLowerCase("es").includes(termino);
  });

  function cambiar(patch: Partial<BorradorOrden>) {
    onCambiar({ ...borrador, ...patch, actualizadoEn: new Date().toISOString() });
  }

  function cambiarLineas(lineas: LineaConstructorUi[]) {
    setLineasUi(lineas);
    cambiar({ lineas: lineasPersistibles(lineas) });
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
    sumarProducto(producto.id);
  }

  function confirmarArmado(selecciones: SeleccionArmado[], resumen: string, adicionalCentavos: number) {
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
        adicionalCentavos,
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

  const cintaResumen = (
    <Button
      type="button"
      size="lg"
      className="constructor-orden__abrir-resumen"
      aria-expanded={resumenAbierto}
      aria-controls="resumen-orden"
      aria-label={`Ver resumen de la orden, ${cantidadProductos} ${cantidadProductos === 1 ? "producto" : "productos"}, total ${dinero(totalOrden)}`}
      onClick={() => setResumenAbierto(true)}
    >
      <ShoppingBag size={20} aria-hidden="true" />
      <span>Orden</span>
      <strong>{cantidadProductos} {cantidadProductos === 1 ? "producto" : "productos"}</strong>
      <span className="constructor-orden__cinta-total">{dinero(totalOrden)}</span>
      <ChevronDown size={18} aria-hidden="true" />
    </Button>
  );

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
            <Select
              aria-label="Mesa para la nueva orden"
              value={borrador.mesaId ?? ""}
              onChange={(event) => cambiar({ mesaId: Number(event.target.value) || undefined })}
            >
              <option value="">Selecciona una mesa</option>
              {[...mesasSeleccionables]
                .sort((a, b) => a.numero - b.numero)
                .map((mesa) => (
                  <option key={mesa.id} value={mesa.id}>
                    Mesa #{mesa.numero} · {mesa.estado === "libre" ? "Libre" : "En servicio"}
                  </option>
                ))}
            </Select>
          </label>
        ) : null}
      </header>

      <div className="constructor-orden__cuerpo">
        <div className="constructor-orden__catalogo">
          <div className="constructor-orden__catalogo-cabecera">
            <div>
              <span className="constructor-orden__eyebrow">Carta</span>
              <h2>Productos</h2>
            </div>
            <Badge variant="secondary">
              {productos.length} {productos.length === 1 ? "producto" : "productos"}
            </Badge>
          </div>
          <div className="constructor-catalogo__herramientas">
            {!busquedaAbierta ? (
              <Button type="button" variant="outline" size="icon" aria-label="Buscar producto" title="Buscar producto" onClick={() => setBusquedaAbierta(true)}>
                <Search size={18} aria-hidden="true" />
              </Button>
            ) : (
              <label className="inventario-busqueda">
                <Search size={18} aria-hidden="true" />
                <span className="sr-only">Buscar producto</span>
                <Input autoFocus type="search" value={busqueda} placeholder="Buscar producto" onChange={(event) => setBusqueda(event.target.value)} />
                <Button type="button" variant="ghost" size="icon" aria-label="Cerrar búsqueda" onClick={() => { setBusqueda(""); setBusquedaAbierta(false); }}>
                  <X size={17} aria-hidden="true" />
                </Button>
              </label>
            )}
            <div className="constructor-categorias" role="tablist" aria-label="Categorías de la carta">
              <Button type="button" role="tab" aria-selected={categoria === "todas"} size="sm" variant={categoria === "todas" ? "secondary" : "ghost"} onClick={() => setCategoria("todas")}>Todas</Button>
              {categorias.map((nombre) => (
                <Button
                  key={nombre}
                  type="button"
                  role="tab"
                  aria-selected={categoria === nombre}
                  size="sm"
                  variant={categoria === nombre ? "secondary" : "ghost"}
                  onClick={() => setCategoria(nombre)}
                >
                  {nombre}
                </Button>
              ))}
            </div>
          </div>
          <div className="carta constructor-orden__carta">
          {productosVisibles.map((producto) => {
            const linea = lineasUi.find((item) => item.productoId === producto.id);
            const IconoCategoria = iconoCategoria(producto.categoria_nombre);
            return (
              <div
                key={producto.id}
                role="button"
                tabIndex={0}
                className={`carta__item${linea ? " is-on" : ""}`}
                style={
                  {
                    "--product-color": producto.color?.trim() || colorCategoria(producto.categoria_nombre),
                  } as CSSProperties
                }
                onClick={() => tocarProducto(producto)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter") {
                    event.preventDefault();
                    tocarProducto(producto);
                  } else if (event.key === " ") {
                    event.preventDefault();
                  }
                }}
                onKeyUp={(event) => {
                  if (event.target === event.currentTarget && event.key === " ") tocarProducto(producto);
                }}
              >
                {producto.foto_data ? (
                  <img src={producto.foto_data} alt="" className="carta__foto" />
                ) : (
                  <span className="carta__icono" aria-hidden="true">
                    <IconoCategoria size={36} strokeWidth={1.75} />
                  </span>
                )}
                <span className="carta__contenido">
                  <strong>{producto.nombre}</strong>
                  {producto.codigo ? <span>{producto.codigo}</span> : null}
                  {producto.configurable ? <Badge>Personalizable</Badge> : null}
                  <span className="carta__precio">{dinero(producto.precio_centavos)}</span>
                </span>
                {linea ? (
                  <span className="carta__cantidad" onClick={(event) => event.stopPropagation()}>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-9 rounded-full text-base"
                      aria-label={`Quitar una unidad de ${producto.nombre}`}
                      onClick={() => restarProducto(producto.id)}
                    >
                      −
                    </Button>
                    <strong>{linea.cantidad}</strong>
                    <Button
                      type="button"
                      variant="default"
                      size="icon"
                      className="size-9 rounded-full text-base"
                      aria-label={`Agregar una unidad de ${producto.nombre}`}
                      onClick={() => sumarProducto(producto.id)}
                    >
                      +
                    </Button>
                  </span>
                ) : null}
              </div>
            );
          })}
          </div>
          {productosVisibles.length === 0 ? <div className="empty-state">No hay productos en esta categoría o búsqueda.</div> : null}
        </div>
      </div>
    </section>
    {typeof document === "undefined" ? cintaResumen : createPortal(cintaResumen, document.body)}
    {resumenAbierto ? (
      <Dialog aria-label="Resumen de la orden" onOverlayClick={() => setResumenAbierto(false)}>
        <DialogContent
          id="resumen-orden"
          placement="bottom"
          className="constructor-orden__resumen constructor-orden__resumen-emergente"
        >
          <div className="constructor-orden__resumen-cabecera">
            <div>
              <span className="constructor-orden__eyebrow">Resumen</span>
              <DialogTitle>Orden nueva</DialogTitle>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="constructor-orden__cerrar-movil"
              aria-label="Cerrar resumen de la orden"
              onClick={() => setResumenAbierto(false)}
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
                    <span className="constructor-linea__precio">
                      {dinero(((producto?.precio_centavos ?? 0) + (linea.adicionalCentavos ?? 0)) * linea.cantidad)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      className="icono-secundario"
                      title="Quitar producto"
                      aria-label={`Quitar ${producto?.nombre ?? `producto ${linea.productoId}`} de la orden`}
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
          ) : (
            <div className="constructor-orden__total">
              <span>Total estimado</span>
              <strong>{dinero(totalOrden)}</strong>
            </div>
          )}
          {!indicacionesAbiertas ? (
            <Button type="button" variant="ghost" size="sm" className="constructor-orden__agregar-nota" onClick={() => setIndicacionesAbiertas(true)}>
              <MessageSquarePlus size={17} aria-hidden="true" /> Agregar indicaciones
            </Button>
          ) : (
            <label className="constructor-orden__indicaciones">
              Indicaciones para cocina
              <Textarea
                className="pedido-nota-area"
                placeholder="Ej.: sin sal, alergia o preparación especial"
                value={borrador.indicaciones}
                onChange={(event) => cambiar({ indicaciones: event.target.value })}
              />
              {!borrador.indicaciones ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setIndicacionesAbiertas(false)}>Ocultar</Button>
              ) : null}
            </label>
          )}
          <div className="constructor-orden__acciones">
            <Button type="button" variant="outline" onClick={onCancelar}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!mesaId || lineasPersistibles(lineasUi).length === 0 || enviando}
              onClick={enviar}
            >
              <Send size={18} aria-hidden="true" />{" "}
              {enviando ? "Enviando…" : totalOrden > 0 ? `Enviar · ${dinero(totalOrden)}` : "Enviar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    ) : null}
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
