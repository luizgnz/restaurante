import { Fragment } from "react";
import { useState } from "react";
import { AlertTriangle, ArrowRightLeft, BellRing, Clock, ReceiptText } from "lucide-react";
import { Alerta } from "@/components/ui/alerta.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Dialog, DialogContent } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import type { IncidenciaCocinaUi } from "./Kds.tsx";
import { etiquetaEtapaOrden, tonoEtapaOrden } from "../lib/estados.ts";
import { esperaMinutos } from "../../../src/modules/tiempo.ts";

export type LineaCuentaUi = {
  lineaClave: string;
  productoId: number;
  nombre: string;
  cantidad: number;
  nota: string | null;
};

export type CuentaEnCursoUi = {
  id: number;
  mesaId: number;
  mesa: number;
  mesero: string;
  estado: string;
  abiertaEn?: string;
  hace: string;
  espera_min?: number;
  totalCentavos: number;
  ordenes: {
    id: number;
    numero: number;
    creadaEn?: string;
    etapa: string;
    lineas: LineaCuentaUi[];
  }[];
};

type Props = {
  cuentas: CuentaEnCursoUi[];
  cargando?: boolean;
  incidencias?: IncidenciaCocinaUi[];
  onAbrir: (cuentaId: number, ordenId?: number) => void;
  onAceptarSugerencia?: (incidenciaId: number, pin: string) => Promise<void>;
  onEliminarIncidencia?: (incidenciaId: number, pin: string) => Promise<void>;
};

/** Descripción acotada de lo pedido, para la fila de la tabla. */
function describirOrden(orden: CuentaEnCursoUi["ordenes"][number]): string {
  return orden.lineas
    .map((linea) => {
      const base = `${linea.cantidad} × ${linea.nombre}`;
      return linea.nota ? `${base} (${linea.nota})` : base;
    })
    .join(", ");
}

type FilaOrdenUi = {
  cuenta: CuentaEnCursoUi;
  orden: CuentaEnCursoUi["ordenes"][number];
  pendientes: IncidenciaCocinaUi[];
};

export function Pedidos({
  cuentas,
  cargando,
  incidencias = [],
  onAbrir,
  onAceptarSugerencia = async () => undefined,
  onEliminarIncidencia = async () => undefined,
}: Props) {
  const [eliminando, setEliminando] = useState<IncidenciaCocinaUi | null>(null);
  const [aceptando, setAceptando] = useState<IncidenciaCocinaUi | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Tabla plana de órdenes: las más nuevas arriba. Cada fila es una orden,
  // no una mesa: casi ninguna mesa tiene varias órdenes a la vez.
  const filas: FilaOrdenUi[] = cuentas
    .flatMap((cuenta) =>
      [...cuenta.ordenes]
        .sort((a, b) => Date.parse(b.creadaEn ?? "") - Date.parse(a.creadaEn ?? "") || b.id - a.id)
        .map((orden) => ({
          cuenta,
          orden,
          pendientes: incidencias.filter(
            (incidencia) => incidencia.ordenId === orden.id && incidencia.estado === "pendiente",
          ),
        })),
    )
    .sort(
      (a, b) =>
        Date.parse(b.orden.creadaEn ?? "") -
          Date.parse(a.orden.creadaEn ?? "") ||
        b.orden.id - a.orden.id,
    );

  async function aceptar() {
    if (!aceptando || !pin.trim()) {
      setError("Ingresa el PIN del mesero para confirmar.");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      await onAceptarSugerencia(aceptando.id, pin);
      setAceptando(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  function confirmarEliminacion(incidencia: IncidenciaCocinaUi) {
    setEliminando(incidencia);
    setPin("");
    setError("");
  }

  async function eliminar() {
    if (!eliminando || guardando) return;
    if (!pin.trim()) {
      setError("Ingresa el PIN del mesero para confirmar.");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      await onEliminarIncidencia(eliminando.id, pin);
      setEliminando(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="page-shell pedidos-page">
      <header className="page-header">
        <div>
          <span className="page-eyebrow">Vista del mesero</span>
          <h1>Órdenes</h1>
          <p>Revisa las órdenes y responde lo que cocina propone al cliente.</p>
        </div>
        {incidencias.length ? (
          <Badge variant="danger"><BellRing size={14} aria-hidden="true" /> {incidencias.length} por responder</Badge>
        ) : null}
      </header>

      {error && !eliminando ? <Alerta>{error}</Alerta> : null}

      <div className="tabla-ordenes" role="table" aria-label="Órdenes en curso, de la más nueva a la más vieja">
        <div role="row" className="tabla-ordenes__fila tabla-ordenes__fila--cabecera">
          <span role="columnheader">Orden</span>
          <span role="columnheader">Mesero</span>
          <span role="columnheader">Espera</span>
          <span role="columnheader">Estado</span>
          <span role="columnheader">Productos</span>
        </div>
        {cargando && cuentas.length === 0 ? (
          <div aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="mb-1.5 h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          filas.map(({ cuenta, orden, pendientes }) => {
            const espera = cuenta.espera_min ?? esperaMinutos(cuenta.abiertaEn ?? new Date().toISOString());
            const bloqueada = pendientes.length > 0;
            return (
              <Fragment key={orden.id}>
                <button
                  type="button"
                  role="row"
                  className={`tabla-ordenes__fila tactil${bloqueada ? " is-bloqueada" : ""}`}
                  aria-label={`Abrir Orden #${orden.numero} de la Mesa #${cuenta.mesa}`}
                  onClick={() => onAbrir(cuenta.id, orden.id)}
                >
                  <span role="cell" className="tabla-ordenes__orden">
                    <strong>Orden #{orden.numero}</strong>
                    <span className="tabla-ordenes__mesa">Mesa #{cuenta.mesa}</span>
                    {bloqueada ? <Badge variant="danger">Cocina esperando respuesta</Badge> : null}
                  </span>
                  <span role="cell">{cuenta.mesero}</span>
                  <span role="cell"><span className="chip-espera" title="Minutos de espera"><Clock size={12} aria-hidden="true" />{espera}</span></span>
                  <span role="cell"><Badge variant={tonoEtapaOrden(orden.etapa)}>{etiquetaEtapaOrden(orden.etapa)}</Badge></span>
                  <span role="cell" className="tabla-ordenes__descripcion">{describirOrden(orden)}</span>
                </button>
                {pendientes.map((incidencia) => (
                  <div className={`mesero-incidencia is-${incidencia.tipo}`} key={incidencia.id}>
                    {incidencia.tipo === "sugerencia" ? <ArrowRightLeft size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
                    <div className="mesero-incidencia__texto">
                      <strong>
                        {incidencia.tipo === "sugerencia" ? "Cambio sugerido" : "Cocina rechazó"}
                        {incidencia.alcance === "linea" && incidencia.producto ? `: ${incidencia.producto}` : ": orden completa"}
                      </strong>
                      <span>Motivo: {incidencia.motivo}</span>
                      {incidencia.propuesta ? <em>Propuesta: {incidencia.propuesta}</em> : null}
                    </div>
                    <div className="mesero-incidencia__acciones">
                      {incidencia.tipo === "sugerencia" ? (
                        <Button type="button" size="sm" disabled={guardando} onClick={() => { setAceptando(incidencia); setPin(""); setError(""); }}>Sugerencia aceptada</Button>
                      ) : null}
                      <Button type="button" size="sm" variant="outline" onClick={() => confirmarEliminacion(incidencia)}>
                        {incidencia.tipo === "sugerencia" ? "Rechazar sugerencia" : "Eliminar pedido"}
                      </Button>
                    </div>
                  </div>
                ))}
              </Fragment>
            );
          })
        )}
        {!cargando && filas.length === 0 ? <div className="empty-state"><ReceiptText size={30} aria-hidden="true" /><strong>No hay cuentas en curso</strong><span>Las nuevas órdenes aparecerán aquí.</span></div> : null}
      </div>

      {eliminando ? (
        <Dialog aria-label="Eliminar pedido" onOverlayClick={() => setEliminando(null)}>
          <DialogContent className="inventario-modal mesero-eliminar-modal w-[min(440px,calc(100vw-1.5rem))] p-[1.4rem]">
            <span className="page-eyebrow">Confirmación del mesero</span>
            <h2>¿Eliminar {eliminando.alcance === "orden" ? "la orden completa" : eliminando.producto ?? "el producto"}?</h2>
            <p>El cliente no aceptó la sugerencia. Al confirmar se anulará {eliminando.alcance === "orden" ? "todo el pedido" : "este producto"} y cocina recibirá el aviso.</p>
            <label>PIN del mesero<Input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))} /></label>
            {error ? <Alerta>{error}</Alerta> : null}
            <div className="inventario-modal__acciones">
              <Button type="button" variant="outline" onClick={() => setEliminando(null)}>No eliminar</Button>
              <Button type="button" variant="destructive" disabled={guardando} onClick={eliminar}>{guardando ? "Eliminando…" : "Sí, eliminar"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
      {aceptando ? (
        <Dialog aria-label="Aceptar cambio sugerido" onOverlayClick={() => setAceptando(null)}>
          <DialogContent className="inventario-modal w-[min(440px,calc(100vw-1.5rem))] p-[1.4rem]">
            <span className="page-eyebrow">Confirmación del mesero</span>
            <h2>Aceptar cambio para {aceptando.producto ?? "la orden"}</h2>
            <p>{aceptando.propuesta}</p>
            {aceptando.productoReemplazo ? <p>La orden cambiará a <strong>{aceptando.productoReemplazo}</strong> solo para el producto solicitado.</p> : null}
            <label>PIN del mesero<Input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))} /></label>
            {error ? <Alerta>{error}</Alerta> : null}
            <div className="inventario-modal__acciones">
              <Button type="button" variant="outline" onClick={() => setAceptando(null)}>Cancelar</Button>
              <Button type="button" disabled={guardando} onClick={aceptar}>{guardando ? "Aplicando…" : "Aceptar y aplicar cambio"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}
