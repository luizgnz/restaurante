import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCheck,
  ChefHat,
  CircleOff,
  Clock,
  Play,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alerta } from "@/components/ui/alerta.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Dialog, DialogContent } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Select } from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { etiquetaEtapa, tonoEtapa } from "../lib/estados.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { esperaMinutos } from "../../../src/modules/tiempo.ts";

export type IncidenciaCocinaUi = {
  id: number;
  comandaId: number;
  ordenId: number;
  comandaLineaId: number | null;
  tipo: "rechazo" | "sugerencia";
  alcance: "linea" | "orden";
  motivo: string;
  propuesta: string | null;
  estado: "pendiente" | "aceptada" | "eliminada";
  mesa: number;
  ordenNumero: number;
  producto: string | null;
  productoReemplazoId?: number | null;
  productoReemplazo?: string | null;
};

export type LineaKdsUi = {
  id: number;
  etapa: string;
  esAviso: boolean;
  nombre: string;
  cantidad: number;
  delta: number | null;
  nota: string | null;
  contornos?: string[];
};

export type TarjetaKdsUi = {
  id: number;
  tipo: "legacy" | "orden" | "correccion" | "anulacion";
  referencia: string;
  mesa: number | null;
  tipoServicio?: "mesa" | "para_llevar";
  numeroServicio?: number | null;
  clienteNombre?: string | null;
  mesero: string;
  envioN: number;
  ordenId: number | null;
  ordenNumero: number | null;
  numeroVersion: number | null;
  esAnulacion: boolean;
  creadaEn: string;
  indicaciones: string | null;
  lineas: LineaKdsUi[];
  incidencias: IncidenciaCocinaUi[];
};

type NuevaIncidencia = {
  comandaId: number;
  comandaLineaId: number | null;
  tipo: "rechazo" | "sugerencia";
  alcance: "linea" | "orden";
  motivo: string;
  propuesta: string | null;
  productoReemplazoId?: number | null;
};

type Props = {
  tarjetas: TarjetaKdsUi[];
  cargando?: boolean;
  onCambiarEtapa: (comandaId: number, etapa: "en_proceso" | "listo") => Promise<void>;
  onCrearIncidencia: (incidencia: NuevaIncidencia) => Promise<void>;
  onCancelarProducto?: (comandaLineaId: number, motivo: string) => Promise<void>;
  productos?: Array<{ id: number; nombre: string }>;
};

type ModalIncidencia = {
  comandaId: number;
  comandaLineaId: number | null;
  alcance: "linea" | "orden";
  objetivo: string;
  tipo: "rechazo" | "sugerencia";
};

function cantidad(linea: LineaKdsUi): string {
  if (linea.delta == null) return `${linea.cantidad}`;
  return `${linea.delta > 0 ? "+" : ""}${linea.delta}`;
}

/** La tarjeta ya no tiene nada por cocinar: todas sus líneas fueron
 *  listas, entregadas o canceladas. Sale del tablero. */
function esEntregada(tarjeta: TarjetaKdsUi): boolean {
  const tareas = tarjeta.lineas.filter((linea) => !linea.esAviso);
  return tareas.length === 0 || tareas.every((linea) => linea.etapa === "listo" || linea.etapa === "servido" || linea.etapa === "cancelado");
}

/** Descripción acotada de lo pedido, para la fila de la tabla. */
function descripcionOrden(tarjeta: TarjetaKdsUi): string {
  return tarjeta.lineas
    .filter((linea) => !linea.esAviso && linea.etapa !== "cancelado")
    .map((linea) => {
      const base = `${cantidad(linea)} × ${linea.nombre}`;
      return linea.nota ? `${base} (${linea.nota})` : base;
    })
    .join(", ");
}

/** Primera línea de la fila: el número de orden manda. */
function tituloOrden(tarjeta: TarjetaKdsUi): string {
  const orden = tarjeta.ordenId ?? tarjeta.ordenNumero ?? tarjeta.envioN;
  if (tarjeta.tipo === "correccion") return `Orden #${orden} · Corrección #${tarjeta.numeroVersion}`;
  if (tarjeta.tipo === "anulacion") return `Orden #${orden} · Anulación`;
  return `Orden #${orden}`;
}

function estadoOrden(tarjeta: TarjetaKdsUi): { etiqueta: string; tono: "secondary" | "warning" | "success" } {
  const tareas = tarjeta.lineas.filter((linea) => !linea.esAviso && linea.etapa !== "cancelado");
  if (tareas.length > 0 && tareas.every((linea) => linea.etapa === "por_preparar")) {
    return { etiqueta: "Enviada a cocina", tono: "secondary" };
  }
  if (tareas.length > 0 && tareas.every((linea) => linea.etapa === "listo" || linea.etapa === "servido")) {
    return { etiqueta: "Lista", tono: "success" };
  }
  return { etiqueta: "En preparación", tono: "warning" };
}

/** Segunda línea, en letra propia y sin grueso: dónde está la mesa. */
function mesaTexto(tarjeta: TarjetaKdsUi): string {
  if (tarjeta.tipoServicio === "para_llevar") {
    return `Para llevar #${tarjeta.numeroServicio}${tarjeta.clienteNombre ? ` · ${tarjeta.clienteNombre}` : ""}`;
  }
  return tarjeta.mesa == null ? "Sin mesa" : `Mesa #${tarjeta.mesa}`;
}

export function Kds({ tarjetas, cargando, onCambiarEtapa, onCrearIncidencia, onCancelarProducto = async () => undefined, productos = [] }: Props) {
  const [modal, setModal] = useState<ModalIncidencia | null>(null);
  const [seleccionadaId, setSeleccionadaId] = useState<number | null>(null);
  const [nuevas, setNuevas] = useState<ReadonlySet<number>>(new Set());
  const conocidasRef = useRef<Set<number> | null>(null);

  // Alerta de llegada: una orden que no estaba en el tablero se enciende en
  // ámbar unos segundos y después queda normal. La primera tanda de datos
  // (incluido el tablero vacío al montar) no parpadea.
  useEffect(() => {
    if (tarjetas.length === 0) return;
    if (conocidasRef.current === null) {
      conocidasRef.current = new Set(tarjetas.map((tarjeta) => tarjeta.id));
      return;
    }
    const entrantes = [...new Set(tarjetas.map((tarjeta) => tarjeta.id))].filter(
      (id) => !conocidasRef.current!.has(id),
    );
    if (entrantes.length === 0) return;
    conocidasRef.current = new Set([...conocidasRef.current, ...entrantes]);
    setNuevas((prev) => {
      const next = new Set(prev);
      entrantes.forEach((id) => next.add(id));
      return next;
    });
    window.setTimeout(() => {
      setNuevas((prev) => {
        const next = new Set(prev);
        entrantes.forEach((id) => next.delete(id));
        return next;
      });
    }, 6000);
  }, [tarjetas]);
  const [motivo, setMotivo] = useState("");
  const [propuesta, setPropuesta] = useState("");
  const [productoReemplazoId, setProductoReemplazoId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [cancelando, setCancelando] = useState<LineaKdsUi | null>(null);
  const [motivoCancelacion, setMotivoCancelacion] = useState("Ingrediente no disponible");
  const [detalleCancelacion, setDetalleCancelacion] = useState("");
  const [mostrarListas, setMostrarListas] = useState(false);
  // Tablero operativo: las listas salen del flujo principal y se consultan
  // desde su contador, sin formar una tercera columna vacía.
  const activas = [...tarjetas]
    .sort((a, b) => Date.parse(b.creadaEn) - Date.parse(a.creadaEn) || b.id - a.id)
    .filter((tarjeta) => !esEntregada(tarjeta));
  const listas = [...tarjetas]
    .filter((tarjeta) => {
      const tareas = tarjeta.lineas.filter((linea) => !linea.esAviso && linea.etapa !== "cancelado");
      return tareas.length > 0 && tareas.every((linea) => linea.etapa === "listo");
    })
    .sort((a, b) => Date.parse(b.creadaEn) - Date.parse(a.creadaEn));
  const porPreparar = activas.filter((tarjeta) => tarjeta.lineas.some((linea) => !linea.esAviso && linea.etapa === "por_preparar"));
  const enProceso = activas.filter((tarjeta) => !porPreparar.includes(tarjeta));
  const seleccionada = tarjetas.find((tarjeta) => tarjeta.id === seleccionadaId) ?? null;

  function abrirModal(tarjeta: TarjetaKdsUi, tipo: "rechazo" | "sugerencia", linea?: LineaKdsUi) {
    setModal({
      comandaId: tarjeta.id,
      comandaLineaId: linea?.id ?? null,
      alcance: linea ? "linea" : "orden",
      objetivo: linea ? linea.nombre : tarjeta.referencia,
      tipo,
    });
    setMotivo("");
    setPropuesta("");
    setProductoReemplazoId(null);
    setError("");
  }

  async function guardarIncidencia() {
    if (!modal || guardando) return;
    if (!motivo.trim()) {
      setError("Indica por qué cocina no puede preparar lo solicitado.");
      return;
    }
    if (modal.tipo === "sugerencia" && modal.alcance === "linea" && !productoReemplazoId) {
      setError("Selecciona el producto que reemplazará al solicitado.");
      return;
    }
    if (modal.tipo === "sugerencia" && modal.alcance === "orden" && !propuesta.trim()) {
      setError("Escribe el cambio que propones al cliente.");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      await onCrearIncidencia({
        comandaId: modal.comandaId,
        comandaLineaId: modal.comandaLineaId,
        tipo: modal.tipo,
        alcance: modal.alcance,
        motivo: motivo.trim(),
        propuesta: modal.tipo === "sugerencia"
          ? modal.alcance === "linea"
            ? `Reemplazar por ${productos.find((producto) => producto.id === productoReemplazoId)?.nombre ?? "otro producto"}${propuesta.trim() ? `. ${propuesta.trim()}` : ""}`
            : propuesta.trim()
          : null,
        productoReemplazoId: modal.tipo === "sugerencia" && modal.alcance === "linea" ? productoReemplazoId : null,
      });
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="page-shell kds-page cocina-page">
      <header className="page-header">
        <div><span className="page-eyebrow">Vista del cocinero</span><p>Recibe pedidos, prepara cada producto y avisa al mesero cuando haya un problema.</p></div>
        <Button type="button" variant="outline" onClick={() => setMostrarListas(true)}>
          <CheckCheck size={17} aria-hidden="true" /> Órdenes listas <Badge variant="secondary">{listas.length}</Badge>
        </Button>
      </header>

      <div className="kds-tablero" aria-label="Órdenes activas en cocina">
        {([['por_preparar', 'Por preparar', porPreparar], ['en_proceso', 'En proceso', enProceso]] as const).map(([clave, titulo, grupo]) => (
          <section className={`kds-columna is-${clave}`} key={clave} aria-labelledby={`kds-${clave}`}>
            <header><span className="kds-columna__punto" aria-hidden="true" /><h2 id={`kds-${clave}`}>{titulo}</h2><Badge variant="secondary">{grupo.length}</Badge></header>
            <div className="kds-columna__lista">
              {cargando && tarjetas.length === 0 ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-36 w-full rounded-lg" />) : null}
              {grupo.map((tarjeta) => {
                const pendiente = tarjeta.incidencias.some((incidencia) => incidencia.estado === "pendiente");
                return <Card className={`kds-tarjeta${pendiente ? " is-bloqueada" : ""}${nuevas.has(tarjeta.id) ? " is-nueva" : ""}`} key={tarjeta.id}>
                  <button type="button" className="kds-tarjeta__detalle" aria-label={`Abrir ${tituloOrden(tarjeta)} de ${mesaTexto(tarjeta)}`} onClick={() => setSeleccionadaId(tarjeta.id)}>
                    <span className="kds-tarjeta__cabecera"><strong>{tituloOrden(tarjeta)}</strong><span className="chip-espera"><Clock size={12} aria-hidden="true" />{esperaMinutos(tarjeta.creadaEn)}</span></span>
                    <span className="tabla-ordenes__mesa">{mesaTexto(tarjeta)}</span>
                    <span className="kds-tarjeta__productos">{descripcionOrden(tarjeta)}</span>
                    {tarjeta.tipoServicio === "para_llevar" ? <Badge variant="secondary">Empacar para llevar</Badge> : null}
                    {pendiente ? <Badge variant="warning">Esperando respuesta</Badge> : null}
                  </button>
                  <Button type="button" disabled={pendiente} onClick={() => onCambiarEtapa(tarjeta.id, clave === "por_preparar" ? "en_proceso" : "listo")}>
                    {clave === "por_preparar" ? <><Play size={17} aria-hidden="true" /> Empezar</> : <><CheckCheck size={17} aria-hidden="true" /> Marcar lista</>}
                  </Button>
                </Card>;
              })}
              {!cargando && grupo.length === 0 ? <div className="kds-columna__vacia"><ChefHat size={24} aria-hidden="true" /><span>Sin órdenes</span></div> : null}
            </div>
          </section>
        ))}
      </div>

      {mostrarListas ? <Dialog aria-label="Órdenes listas" onOverlayClick={() => setMostrarListas(false)}>
        <DialogContent className="inventario-modal w-[min(560px,calc(100vw-1.5rem))] p-[1.4rem]">
          <header className="cocina-orden-modal__cabecera"><div><span className="page-eyebrow">Fuera del tablero</span><h2>Órdenes listas</h2></div><Button type="button" variant="ghost" size="icon" aria-label="Cerrar" onClick={() => setMostrarListas(false)}><X size={20} /></Button></header>
          <div className="kds-listas">{listas.map((tarjeta) => <button type="button" key={tarjeta.id} onClick={() => { setMostrarListas(false); setSeleccionadaId(tarjeta.id); }}><strong>{tituloOrden(tarjeta)}</strong><span>{mesaTexto(tarjeta)}</span><span className="chip-espera"><Clock size={12} />{esperaMinutos(tarjeta.creadaEn)}</span></button>)}{listas.length === 0 ? <p>No hay órdenes listas para retirar.</p> : null}</div>
        </DialogContent>
      </Dialog> : null}

      {modal ? (
        <Dialog
          aria-label={modal.tipo === "sugerencia" ? "Sugerir un cambio" : "Marcar como no disponible"}
          onOverlayClick={() => setModal(null)}
        >
          <DialogContent className="inventario-modal cocina-incidencia-modal w-[min(440px,calc(100vw-1.5rem))] p-[1.4rem]">
            <span className="page-eyebrow">{modal.alcance === "orden" ? "Orden completa" : "Producto"}</span>
            <h2>{modal.tipo === "sugerencia" ? "Sugerir un cambio" : "Marcar como no disponible"}</h2>
            <p><strong>{modal.objetivo}</strong></p>
            <label>Motivo<Textarea autoFocus rows={3} value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Ej.: no queda aguacate" /></label>
            {modal.tipo === "sugerencia" && modal.alcance === "linea" ? <>
              <label>Producto de reemplazo<Select value={productoReemplazoId ?? ""} onChange={(event) => setProductoReemplazoId(Number(event.target.value) || null)}>
                <option value="">Selecciona un producto</option>
                {productos.filter((producto) => producto.nombre !== modal.objetivo).map((producto) => <option key={producto.id} value={producto.id}>{producto.nombre}</option>)}
              </Select></label>
              <label>Detalle opcional<Textarea rows={2} value={propuesta} onChange={(event) => setPropuesta(event.target.value)} placeholder="Ej.: mantener los mismos contornos" /></label>
            </> : null}
            {modal.tipo === "sugerencia" && modal.alcance === "orden" ? <label>Cambio sugerido<Textarea rows={3} value={propuesta} onChange={(event) => setPropuesta(event.target.value)} placeholder="Describe el cambio para los productos afectados" /></label> : null}
            {error ? <Alerta>{error}</Alerta> : null}
            <div className="inventario-modal__acciones">
              <Button type="button" variant="outline" onClick={() => setModal(null)}>Cancelar</Button>
              <Button type="button" disabled={guardando} onClick={guardarIncidencia}>{guardando ? "Enviando…" : "Avisar al mesero"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
      {seleccionada ? (
        <Dialog aria-label={`Orden de la ${seleccionada.referencia}`} onOverlayClick={() => setSeleccionadaId(null)}>
          <DialogContent className="inventario-modal cocina-orden-modal w-[min(560px,calc(100vw-1.5rem))] p-[1.4rem]">
            <header className="cocina-orden-modal__cabecera">
              <div>
                <span className="page-eyebrow">Orden completa</span>
                <h2>{tituloOrden(seleccionada)}</h2>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Cerrar orden" onClick={() => setSeleccionadaId(null)}>
                <X size={20} aria-hidden="true" />
              </Button>
            </header>
            <p className="cocina-orden-modal__meta">
              <span>{mesaTexto(seleccionada)}</span>
              <span className="chip-espera">
                <Clock size={12} aria-hidden="true" /> {esperaMinutos(seleccionada.creadaEn)}
              </span>
              <Badge variant={estadoOrden(seleccionada).tono}>{estadoOrden(seleccionada).etiqueta}</Badge>
            </p>
            {seleccionada.indicaciones ? <p className="cocina-indicaciones">{seleccionada.indicaciones}</p> : null}
            <ul className="cocina-orden-modal__lineas">
              {seleccionada.lineas.filter((linea) => !linea.esAviso).map((linea) => (
                <li className={`cocina-linea etapa-${linea.etapa}`} key={linea.id}>
                  <div className="cocina-linea__principal">
                    <strong>{cantidad(linea)} × {linea.nombre}</strong>
                    {linea.etapa === "por_preparar" ? null : <Badge variant={tonoEtapa(linea.etapa)}>{etiquetaEtapa(linea.etapa)}</Badge>}
                  </div>
                  {linea.nota ? <p className="cocina-linea__nota">Nota: {linea.nota}</p> : null}
                  {(linea.contornos ?? []).length > 0 ? <div className="kds-contornos">{linea.contornos!.map((contorno) => <em key={contorno}>{contorno}</em>)}</div> : null}
                  {seleccionada.tipo === "orden" && ["por_preparar", "en_proceso", "listo", "servido"].includes(linea.etapa) ? (
                    <div className="cocina-linea__acciones">
                      <Button type="button" size="sm" variant="outline" onClick={() => { abrirModal(seleccionada, "sugerencia", linea); setSeleccionadaId(null); }}>
                        <ArrowRightLeft size={16} aria-hidden="true" /> Proponer reemplazo
                      </Button>
                      {linea.etapa !== "por_preparar" ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => { setCancelando(linea); setSeleccionadaId(null); setMotivoCancelacion("Ingrediente no disponible"); setDetalleCancelacion(""); setError(""); }}>
                          <Trash2 size={16} aria-hidden="true" /> Cancelar y devolver stock
                        </Button>
                      ) : (
                        <Button type="button" size="sm" variant="outline" onClick={() => { abrirModal(seleccionada, "rechazo", linea); setSeleccionadaId(null); }}>
                          <CircleOff size={16} aria-hidden="true" /> No se puede preparar
                        </Button>
                      )}
                    </div>
                  ) : null}
                  {seleccionada.incidencias.filter((incidencia) => incidencia.comandaLineaId === linea.id).map((incidencia) => (
                    <AvisoIncidencia incidencia={incidencia} key={incidencia.id} />
                  ))}
                </li>
              ))}
            </ul>
            {(() => {
              const tareas = seleccionada.lineas.filter((linea) => !linea.esAviso && linea.etapa !== "cancelado");
              const porPreparar = tareas.filter((linea) => linea.etapa === "por_preparar").length;
              const tieneTrabajoActivo = tareas.some((linea) => linea.etapa === "por_preparar" || linea.etapa === "en_proceso");
              const bloqueada = seleccionada.incidencias.some((incidencia) => incidencia.estado === "pendiente");
              const ordenIncidente = seleccionada.incidencias.find((incidencia) => incidencia.comandaLineaId == null);
              const tipo = seleccionada.tipo === "orden";
              return (
                <>
                  {ordenIncidente ? <AvisoIncidencia incidencia={ordenIncidente} /> : null}
                  {bloqueada ? <Alerta>Cocina hizo una solicitud: el mesero debe responder antes de avanzar la orden.</Alerta> : null}
                  {!bloqueada && tieneTrabajoActivo ? (
                    <div className="cocina-orden-modal__acciones">
                      <div className="cocina-orden-modal__acciones-principales">
                      {porPreparar > 0 ? (
                        <Button type="button" onClick={() => onCambiarEtapa(seleccionada.id, "en_proceso")}>
                          <Play size={18} aria-hidden="true" /> Comenzar orden
                        </Button>
                      ) : (
                        <Button type="button" variant="success" onClick={() => onCambiarEtapa(seleccionada.id, "listo")}>
                          <CheckCheck size={18} aria-hidden="true" /> Lista completa
                        </Button>
                      )}
                      </div>
                      {tipo ? <p className="cocina-orden-modal__ayuda">Los problemas se reportan en el producto afectado.</p> : null}
                    </div>
                  ) : null}
                </>
              );
            })()}
          </DialogContent>
        </Dialog>
      ) : null}
      {cancelando ? (
        <Dialog aria-label="Cancelar producto y devolver stock" onOverlayClick={() => setCancelando(null)}>
          <DialogContent className="inventario-modal w-[min(440px,calc(100vw-1.5rem))] p-[1.4rem]">
            <span className="page-eyebrow">Acción de Cocina</span>
            <h2>Cancelar {cancelando.nombre}</h2>
            <p>La receta completa volverá al inventario y la acción quedará registrada.</p>
            <label>Motivo<Select value={motivoCancelacion} onChange={(event) => setMotivoCancelacion(event.target.value)}>
              <option>Ingrediente no disponible</option>
              <option>No se puede terminar</option>
              <option>Preparación incorrecta</option>
              <option>Solicitud del cliente</option>
              <option>Otro</option>
            </Select></label>
            <label><span>Detalle <small>(opcional)</small></span><Textarea rows={2} value={detalleCancelacion} onChange={(event) => setDetalleCancelacion(event.target.value)} /></label>
            {error ? <Alerta>{error}</Alerta> : null}
            <div className="inventario-modal__acciones">
              <Button type="button" variant="outline" onClick={() => setCancelando(null)}>Volver</Button>
              <Button type="button" disabled={guardando} onClick={async () => {
                setGuardando(true); setError("");
                try {
                  await onCancelarProducto(cancelando.id, [motivoCancelacion, detalleCancelacion.trim()].filter(Boolean).join(": "));
                  setCancelando(null); setSeleccionadaId(null);
                } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
                finally { setGuardando(false); }
              }}>{guardando ? "Cancelando…" : "Cancelar y devolver stock"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}

function AvisoIncidencia({ incidencia }: { incidencia: IncidenciaCocinaUi }) {
  return (
    <div className={`cocina-incidencia is-${incidencia.estado}`}>
      {incidencia.tipo === "sugerencia" ? <ArrowRightLeft size={17} aria-hidden="true" /> : <AlertTriangle size={17} aria-hidden="true" />}
      <div>
        <strong>{incidencia.estado === "aceptada" ? "Sugerencia aceptada por el cliente" : incidencia.tipo === "sugerencia" ? "Esperando respuesta del mesero" : "Rechazo enviado al mesero"}</strong>
        <span>{incidencia.motivo}</span>
        {incidencia.propuesta ? <em>Cambio: {incidencia.propuesta}</em> : null}
      </div>
    </div>
  );
}
