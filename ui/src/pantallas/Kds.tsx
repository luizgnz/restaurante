import { AlertTriangle, ArrowRightLeft, CheckCheck, ChefHat, CircleOff, Clock3, Play, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";

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
  mesero: string;
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
};

type Props = {
  tarjetas: TarjetaKdsUi[];
  onCambiarEtapa: (lineaId: number, etapa: "en_proceso" | "listo") => Promise<void>;
  onCrearIncidencia: (incidencia: NuevaIncidencia) => Promise<void>;
  onRecargar: () => Promise<void>;
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

function etiquetaEtapa(etapa: string): string {
  if (etapa === "por_preparar") return "Enviado a cocina";
  if (etapa === "en_proceso") return "En preparación";
  if (etapa === "listo") return "Listo para entregar";
  if (etapa === "servido") return "Entregado";
  if (etapa === "cancelado") return "Cancelado";
  if (etapa === "aviso") return "Aviso";
  return etapa;
}

function varianteEtapa(etapa: string): "secondary" | "warning" | "success" | "danger" {
  if (etapa === "por_preparar") return "secondary";
  if (etapa === "en_proceso") return "warning";
  if (etapa === "listo" || etapa === "servido") return "success";
  return "danger";
}

export function Kds({ tarjetas, onCambiarEtapa, onCrearIncidencia, onRecargar }: Props) {
  const [modal, setModal] = useState<ModalIncidencia | null>(null);
  const [motivo, setMotivo] = useState("");
  const [propuesta, setPropuesta] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [recargando, setRecargando] = useState(false);

  const lineas = tarjetas.flatMap((tarjeta) => tarjeta.lineas.filter((linea) => !linea.esAviso));
  const enviados = lineas.filter((linea) => linea.etapa === "por_preparar").length;
  const preparando = lineas.filter((linea) => linea.etapa === "en_proceso").length;
  const listos = lineas.filter((linea) => linea.etapa === "listo").length;

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
    setError("");
  }

  async function guardarIncidencia() {
    if (!modal || guardando) return;
    if (!motivo.trim()) {
      setError("Indica por qué cocina no puede preparar lo solicitado.");
      return;
    }
    if (modal.tipo === "sugerencia" && !propuesta.trim()) {
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
        propuesta: modal.tipo === "sugerencia" ? propuesta.trim() : null,
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
        <Button type="button" variant="outline" disabled={recargando} onClick={async () => {
          setRecargando(true);
          try { await onRecargar(); } finally { setRecargando(false); }
        }}>
          <RefreshCw size={18} className={recargando ? "is-spinning" : ""} aria-hidden="true" /> Actualizar
        </Button>
      </header>

      <div className="cocina-resumen" aria-label="Resumen de cocina">
        <Card><Clock3 size={20} aria-hidden="true" /><div><strong>{enviados}</strong><span>enviados a cocina</span></div></Card>
        <Card><ChefHat size={20} aria-hidden="true" /><div><strong>{preparando}</strong><span>en preparación</span></div></Card>
        <Card><CheckCheck size={20} aria-hidden="true" /><div><strong>{listos}</strong><span>listos para entregar</span></div></Card>
      </div>

      <div className="kds cocina-grid">
        {tarjetas.map((tarjeta) => {
          const tareas = tarjeta.lineas.filter((linea) => !linea.esAviso && linea.etapa !== "cancelado");
          const ordenCompletaDisponible = tarjeta.tipo === "orden" && tareas.length > 0 && tareas.every((linea) => linea.etapa === "por_preparar");
          const incidenciaOrden = tarjeta.incidencias.find((incidencia) => incidencia.comandaLineaId == null);
          return (
            <Card className="tarjeta cocina-tarjeta" key={tarjeta.id}>
              <header className="cocina-tarjeta__cabecera">
                <div><strong>{tarjeta.referencia}</strong><span>Mesero: {tarjeta.mesero}</span></div>
                <Badge variant={tarjeta.tipo === "orden" ? "secondary" : "warning"}>
                  {tarjeta.tipo === "orden" ? "Pedido" : tarjeta.tipo === "anulacion" ? "Anulación" : "Cambio"}
                </Badge>
              </header>
              {tarjeta.indicaciones ? <p className="cocina-indicaciones">{tarjeta.indicaciones}</p> : null}
              {incidenciaOrden ? <AvisoIncidencia incidencia={incidenciaOrden} /> : null}
              <div className="cocina-lineas">
                {tarjeta.lineas.map((linea) => {
                  const incidencia = tarjeta.incidencias.find((item) => item.comandaLineaId === linea.id) ?? incidenciaOrden;
                  const pendiente = incidencia?.estado === "pendiente";
                  return (
                    <article className={`cocina-linea etapa-${linea.etapa}`} key={linea.id}>
                      <div className="cocina-linea__principal">
                        <strong>{cantidad(linea)} × {linea.nombre}</strong>
                        <Badge variant={varianteEtapa(linea.etapa)}>{etiquetaEtapa(linea.etapa)}</Badge>
                      </div>
                      {linea.nota ? <p className="cocina-linea__nota">Nota: {linea.nota}</p> : null}
                      {(linea.contornos ?? []).length > 0 ? <div className="kds-contornos">{linea.contornos!.map((contorno) => <em key={contorno}>{contorno}</em>)}</div> : null}
                      {incidencia && incidencia !== incidenciaOrden ? <AvisoIncidencia incidencia={incidencia} /> : null}
                      {!linea.esAviso ? (
                        <div className="cocina-linea__acciones">
                          {linea.etapa === "por_preparar" && !pendiente ? <Button type="button" size="icon" className="cocina-accion-icono is-start" aria-label="Comenzar preparación" title="Comenzar preparación" onClick={() => onCambiarEtapa(linea.id, "en_proceso")}><Play size={20} aria-hidden="true" /></Button> : null}
                          {linea.etapa === "en_proceso" ? <Button type="button" size="icon" className="cocina-accion-icono is-ready" aria-label="Marcar listo" title="Marcar listo" onClick={() => onCambiarEtapa(linea.id, "listo")}><CheckCheck size={20} aria-hidden="true" /></Button> : null}
                          {tarjeta.tipo === "orden" && linea.etapa === "por_preparar" && !pendiente ? (
                            <>
                              <Button type="button" size="icon" className="cocina-accion-icono is-suggest" variant="outline" aria-label="Sugerir cambio" title="Sugerir cambio" onClick={() => abrirModal(tarjeta, "sugerencia", linea)}><ArrowRightLeft size={19} aria-hidden="true" /></Button>
                              <Button type="button" size="icon" className="cocina-accion-icono is-unavailable" variant="ghost" aria-label="No disponible" title="No disponible" onClick={() => abrirModal(tarjeta, "rechazo", linea)}><CircleOff size={19} aria-hidden="true" /></Button>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
              {ordenCompletaDisponible && !incidenciaOrden ? (
                <footer className="cocina-tarjeta__acciones">
                  <span>Problema con toda la orden:</span>
                  <Button type="button" size="icon" className="cocina-accion-icono is-suggest" variant="outline" aria-label="Sugerir cambio para toda la orden" title="Sugerir cambio" onClick={() => abrirModal(tarjeta, "sugerencia")}><ArrowRightLeft size={19} aria-hidden="true" /></Button>
                  <Button type="button" size="icon" className="cocina-accion-icono is-unavailable" variant="ghost" aria-label="No disponible para toda la orden" title="No disponible" onClick={() => abrirModal(tarjeta, "rechazo")}><AlertTriangle size={19} aria-hidden="true" /></Button>
                </footer>
              ) : null}
            </Card>
          );
        })}
        {tarjetas.length === 0 ? <div className="empty-state"><ChefHat size={32} aria-hidden="true" /><strong>No hay pedidos en cocina</strong><span>Los pedidos nuevos aparecerán automáticamente.</span></div> : null}
      </div>

      {modal ? (
        <div className="modal-fondo" role="presentation">
          <Card className="inventario-modal cocina-incidencia-modal" role="dialog" aria-modal="true" aria-labelledby="incidencia-titulo">
            <span className="page-eyebrow">{modal.alcance === "orden" ? "Orden completa" : "Producto"}</span>
            <h2 id="incidencia-titulo">{modal.tipo === "sugerencia" ? "Sugerir un cambio" : "Marcar como no disponible"}</h2>
            <p><strong>{modal.objetivo}</strong></p>
            <label>Motivo<textarea autoFocus rows={3} value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Ej.: no queda aguacate" /></label>
            {modal.tipo === "sugerencia" ? <label>Cambio sugerido<textarea rows={3} value={propuesta} onChange={(event) => setPropuesta(event.target.value)} placeholder="Ej.: reemplazar aguacate por tomate" /></label> : null}
            {error ? <p className="inventario-modal__error" role="alert">{error}</p> : null}
            <div className="inventario-modal__acciones">
              <Button type="button" variant="outline" onClick={() => setModal(null)}>Cancelar</Button>
              <Button type="button" disabled={guardando} onClick={guardarIncidencia}>{guardando ? "Enviando…" : "Avisar al mesero"}</Button>
            </div>
          </Card>
        </div>
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
