import { AlertTriangle, ArrowRightLeft, CheckCheck, ChefHat, CircleOff, Play } from "lucide-react";
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
import { esperaMinutos, nivelEspera, textoEspera } from "../../../src/modules/tiempo.ts";

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
  mesero: string;
  envioN: number;
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
  return tareas.length > 0 && tareas.every((linea) => linea.etapa === "listo" || linea.etapa === "servido" || linea.etapa === "cancelado");
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
  const orden = tarjeta.ordenNumero ?? tarjeta.envioN;
  if (tarjeta.tipo === "correccion") return `Orden #${orden} · Corrección #${tarjeta.numeroVersion}`;
  if (tarjeta.tipo === "anulacion") return `Orden #${orden} · Anulación`;
  return `Orden #${orden}`;
}

/** Segunda línea, en letra propia y sin grueso: dónde está la mesa. */
function mesaTexto(tarjeta: TarjetaKdsUi): string {
  return tarjeta.mesa == null ? "Sin mesa" : `Mesa #${tarjeta.mesa}`;
}

export function Kds({ tarjetas, cargando, onCambiarEtapa, onCrearIncidencia, productos = [] }: Props) {
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
  // Tabla: las órdenes más nuevas arriba; las que ya no tienen nada por
  // cocinar desaparecen del tablero.
  const activas = [...tarjetas]
    .sort((a, b) => Date.parse(b.creadaEn) - Date.parse(a.creadaEn) || b.id - a.id)
    .filter((tarjeta) => !esEntregada(tarjeta));
  const seleccionada = activas.find((tarjeta) => tarjeta.id === seleccionadaId) ?? null;

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
        <div><span className="page-eyebrow">Vista del cocinero</span><h1>Cocina</h1><p>Recibe pedidos, prepara cada producto y avisa al mesero cuando haya un problema.</p></div>
      </header>

      <div className="tabla-ordenes" role="table" aria-label="Órdenes en cocina, de la más nueva a la más vieja">
        <div role="row" className="tabla-ordenes__fila tabla-ordenes__fila--cabecera">
          <span role="columnheader">Orden</span>
          <span role="columnheader">Mesero</span>
          <span role="columnheader">Espera</span>
          <span role="columnheader">Productos</span>
        </div>
        {cargando && tarjetas.length === 0 ? (
          <div aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="mb-1.5 h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          activas.map((tarjeta) => {
            const espera = esperaMinutos(tarjeta.creadaEn);
            const nivel = nivelEspera(espera);
            const pendiente = tarjeta.incidencias.some((incidencia) => incidencia.estado === "pendiente");
            return (
              <button
                type="button"
                role="row"
                className={`tabla-ordenes__fila tactil${pendiente ? " is-bloqueada" : ""}${nuevas.has(tarjeta.id) ? " is-nueva" : ""}`}
                key={tarjeta.id}
                aria-label={`Abrir ${tituloOrden(tarjeta)} de la ${mesaTexto(tarjeta)}`}
                onClick={() => setSeleccionadaId(tarjeta.id)}
              >
                <span role="cell" className="tabla-ordenes__orden">
                  <strong>{tituloOrden(tarjeta)}</strong>
                  <span className="tabla-ordenes__mesa">{mesaTexto(tarjeta)}</span>
                  {pendiente ? <Badge variant="danger">Cocina esperando respuesta</Badge> : null}
                </span>
                <span role="cell">{tarjeta.mesero}</span>
                <span role="cell"><span className={`chip-espera espera-${nivel}`}>{textoEspera(espera)}</span></span>
                <span role="cell" className="tabla-ordenes__descripcion">{descripcionOrden(tarjeta)}</span>
              </button>
            );
          })
        )}
        {!cargando && activas.length === 0 ? <div className="empty-state"><ChefHat size={32} aria-hidden="true" /><strong>No hay pedidos en cocina</strong><span>Los pedidos nuevos aparecerán automáticamente.</span></div> : null}
      </div>

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
          <DialogContent className="inventario-modal w-[min(560px,calc(100vw-1.5rem))] p-[1.4rem]">
            <span className="page-eyebrow">Orden completa</span>
            <h2>{tituloOrden(seleccionada)}</h2>
            <p className="cocina-orden-modal__meta">
              {mesaTexto(seleccionada)} · Mesero: {seleccionada.mesero}
              <span className={`chip-espera espera-${nivelEspera(esperaMinutos(seleccionada.creadaEn))}`}>
                {textoEspera(esperaMinutos(seleccionada.creadaEn))}
              </span>
            </p>
            {seleccionada.indicaciones ? <p className="cocina-indicaciones">{seleccionada.indicaciones}</p> : null}
            <ul className="cocina-orden-modal__lineas">
              {seleccionada.lineas.filter((linea) => !linea.esAviso).map((linea) => (
                <li className={`cocina-linea etapa-${linea.etapa}`} key={linea.id}>
                  <div className="cocina-linea__principal">
                    <strong>{cantidad(linea)} × {linea.nombre}</strong>
                    <Badge variant={tonoEtapa(linea.etapa)}>{etiquetaEtapa(linea.etapa)}</Badge>
                  </div>
                  {linea.nota ? <p className="cocina-linea__nota">Nota: {linea.nota}</p> : null}
                  {(linea.contornos ?? []).length > 0 ? <div className="kds-contornos">{linea.contornos!.map((contorno) => <em key={contorno}>{contorno}</em>)}</div> : null}
                  {seleccionada.incidencias.filter((incidencia) => incidencia.comandaLineaId === linea.id).map((incidencia) => (
                    <AvisoIncidencia incidencia={incidencia} key={incidencia.id} />
                  ))}
                </li>
              ))}
            </ul>
            {(() => {
              const espera = esperaMinutos(seleccionada.creadaEn);
              const nivel = nivelEspera(espera);
              const tareas = seleccionada.lineas.filter((linea) => !linea.esAviso && linea.etapa !== "cancelado");
              const porPreparar = tareas.filter((linea) => linea.etapa === "por_preparar").length;
              const bloqueada = seleccionada.incidencias.some((incidencia) => incidencia.estado === "pendiente");
              const ordenIncidente = seleccionada.incidencias.find((incidencia) => incidencia.comandaLineaId == null);
              const tipo = seleccionada.tipo === "orden";
              return (
                <>
                  {ordenIncidente ? <AvisoIncidencia incidencia={ordenIncidente} /> : null}
                  {bloqueada ? <Alerta>Cocina hizo una solicitud: el mesero debe responder antes de avanzar la orden.</Alerta> : null}
                  {!bloqueada && tareas.length > 0 ? (
                    <div className="inventario-modal__acciones cocina-orden-modal__acciones">
                      {porPreparar > 0 ? (
                        <Button type="button" variant="brand" onClick={() => onCambiarEtapa(seleccionada.id, "en_proceso")}>
                          <Play size={18} aria-hidden="true" /> Comenzar orden
                        </Button>
                      ) : null}
                      <Button type="button" variant="success" onClick={() => onCambiarEtapa(seleccionada.id, "listo")}>
                        <CheckCheck size={18} aria-hidden="true" /> Lista completa
                      </Button>
                      {tipo ? (
                        <>
                          <Button type="button" variant="outline" onClick={() => { setSeleccionadaId(null); abrirModal(seleccionada, "sugerencia"); }}>
                            <ArrowRightLeft size={18} aria-hidden="true" /> Sugerir cambio
                          </Button>
                          <Button type="button" variant="ghost" onClick={() => { setSeleccionadaId(null); abrirModal(seleccionada, "rechazo"); }}>
                            <CircleOff size={18} aria-hidden="true" /> No disponible
                          </Button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="inventario-modal__acciones">
                    <Button type="button" variant="outline" onClick={() => setSeleccionadaId(null)}>Cerrar</Button>
                  </div>
                </>
              );
            })()}
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
