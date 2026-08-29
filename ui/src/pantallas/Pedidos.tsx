import { AlertTriangle, ArrowRightLeft, BellRing, Clock3, ReceiptText, Utensils } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import type { IncidenciaCocinaUi } from "./Kds.tsx";

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
    lineas: LineaCuentaUi[];
  }[];
};

const ESTADO: Record<string, string> = {
  abierta: "En pedido",
  precuenta_emitida: "Precuenta emitida",
};

type Props = {
  uiVersion?: "actual" | "nueva";
  cuentas: CuentaEnCursoUi[];
  incidencias?: IncidenciaCocinaUi[];
  onAbrir: (cuentaId: number, ordenId?: number) => void;
  onAceptarSugerencia?: (incidenciaId: number, pin: string) => Promise<void>;
  onEliminarIncidencia?: (incidenciaId: number, pin: string) => Promise<void>;
};

export function Pedidos({
  uiVersion = "actual",
  cuentas,
  incidencias = [],
  onAbrir,
  onAceptarSugerencia = async () => undefined,
  onEliminarIncidencia = async () => undefined,
}: Props) {
  const totalOrdenes = cuentas.reduce((total, cuenta) => total + cuenta.ordenes.length, 0);
  const [eliminando, setEliminando] = useState<IncidenciaCocinaUi | null>(null);
  const [aceptando, setAceptando] = useState<IncidenciaCocinaUi | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

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
          <p>Revisa las cuentas y responde los cambios que cocina propone al cliente.</p>
        </div>
        <div className="pedidos-page__metricas">
          <Badge variant="secondary"><Utensils size={14} aria-hidden="true" /> {cuentas.length} mesas</Badge>
          <Badge><ReceiptText size={14} aria-hidden="true" /> {totalOrdenes} órdenes</Badge>
          {incidencias.length ? <Badge variant="danger"><BellRing size={14} aria-hidden="true" /> {incidencias.length} por responder</Badge> : null}
        </div>
      </header>

      {incidencias.length ? (
        <Card className="mesero-notificacion" role="status">
          <BellRing size={22} aria-hidden="true" />
          <div><strong>Cocina necesita una respuesta</strong><span>Consulta al cliente y responde desde la orden correspondiente.</span></div>
        </Card>
      ) : null}
      {error && !eliminando ? <p className="mesero-error" role="alert">{error}</p> : null}

      <div className="kds pedidos-grid">
        {cuentas.map((cuenta) => (
          <Card className="tarjeta pedido-card" key={cuenta.id}>
            {uiVersion === "nueva" ? <div className="pedido-cabecera">
              <span className="pedido-card__mesa"><strong>Mesa {cuenta.mesa}</strong><Badge variant="warning">{ESTADO[cuenta.estado] ?? cuenta.estado}</Badge></span>
              <span className="pedido-card__meta"><Clock3 size={15} aria-hidden="true" /> {cuenta.mesero} · {cuenta.hace}</span>
            </div> : <Button type="button" variant="ghost" className="pedido-cabecera" onClick={() => onAbrir(cuenta.id)}>
              <span className="pedido-card__mesa"><strong>Mesa {cuenta.mesa}</strong><Badge variant="warning">{ESTADO[cuenta.estado] ?? cuenta.estado}</Badge></span>
              <span className="pedido-card__meta"><Clock3 size={15} aria-hidden="true" /> {cuenta.mesero} · {cuenta.hace}</span>
            </Button>}
            <div className="pedido-card__ordenes">
              {cuenta.ordenes.map((orden) => {
                const avisos = incidencias.filter((incidencia) => incidencia.ordenId === orden.id);
                return (
                  <div className="pedido-indicaciones" key={orden.id}>
                    {uiVersion === "nueva" ? (
                      <button
                        type="button"
                        className="pedido-orden__abrir"
                        aria-label={`Abrir acciones de Orden #${orden.numero}, Mesa ${cuenta.mesa}`}
                        onClick={() => onAbrir(cuenta.id, orden.id)}
                      >
                        <strong>Orden #{orden.numero}</strong>
                        <span>{orden.lineas.map((linea) => `${linea.cantidad} × ${linea.nombre}${linea.nota ? ` (${linea.nota})` : ""}`).join(", ")}</span>
                      </button>
                    ) : (
                      <>
                        <strong>Orden #{orden.numero}</strong>
                        <span>{orden.lineas.map((linea) => `${linea.cantidad} × ${linea.nombre}${linea.nota ? ` (${linea.nota})` : ""}`).join(", ")}</span>
                      </>
                    )}
                    {avisos.map((incidencia) => (
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
                  </div>
                );
              })}
            </div>
            {cuenta.ordenes.length === 0 ? <p className="login-odoo__ayuda">Sin órdenes aún</p> : null}
          </Card>
        ))}
        {cuentas.length === 0 ? <div className="empty-state"><ReceiptText size={30} aria-hidden="true" /><strong>No hay cuentas en curso</strong><span>Las nuevas órdenes aparecerán aquí.</span></div> : null}
      </div>

      {eliminando ? (
        <div className="modal-fondo" role="presentation">
          <Card className="inventario-modal mesero-eliminar-modal" role="dialog" aria-modal="true" aria-labelledby="eliminar-incidencia-titulo">
            <span className="page-eyebrow">Confirmación del mesero</span>
            <h2 id="eliminar-incidencia-titulo">¿Eliminar {eliminando.alcance === "orden" ? "la orden completa" : eliminando.producto ?? "el producto"}?</h2>
            <p>El cliente no aceptó la sugerencia. Al confirmar se anulará {eliminando.alcance === "orden" ? "todo el pedido" : "este producto"} y cocina recibirá el aviso.</p>
            <label>PIN del mesero<Input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))} /></label>
            {error ? <p className="inventario-modal__error" role="alert">{error}</p> : null}
            <div className="inventario-modal__acciones">
              <Button type="button" variant="outline" onClick={() => setEliminando(null)}>No eliminar</Button>
              <Button type="button" variant="destructive" disabled={guardando} onClick={eliminar}>{guardando ? "Eliminando…" : "Sí, eliminar"}</Button>
            </div>
          </Card>
        </div>
      ) : null}
      {aceptando ? (
        <div className="modal-fondo" role="presentation">
          <Card className="inventario-modal" role="dialog" aria-modal="true" aria-labelledby="aceptar-sugerencia-titulo">
            <span className="page-eyebrow">Confirmación del mesero</span>
            <h2 id="aceptar-sugerencia-titulo">Aceptar cambio para {aceptando.producto ?? "la orden"}</h2>
            <p>{aceptando.propuesta}</p>
            {aceptando.productoReemplazo ? <p>La orden cambiará a <strong>{aceptando.productoReemplazo}</strong> solo para el producto solicitado.</p> : null}
            <label>PIN del mesero<Input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))} /></label>
            {error ? <p className="inventario-modal__error" role="alert">{error}</p> : null}
            <div className="inventario-modal__acciones">
              <Button type="button" variant="outline" onClick={() => setAceptando(null)}>Cancelar</Button>
              <Button type="button" disabled={guardando} onClick={aceptar}>{guardando ? "Aplicando…" : "Aceptar y aplicar cambio"}</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </section>
  );
}
