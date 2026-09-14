import { useEffect, useState } from "react";
import {
  Archive,
  BookOpen,
  CalendarClock,
  CalendarDays,
  FileBarChart,
  Layers3,
  LayoutDashboard,
  LayoutGrid,
  Plus,
  RotateCcw,
  Shapes,
} from "lucide-react";
import { api } from "@/api.ts";
import { Alerta } from "@/components/ui/alerta.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { ConfirmarDialog } from "@/components/ui/confirmar.tsx";
import { Select } from "@/components/ui/select.tsx";
import { CerrarJornadaDialog, type ResumenCierreJornada } from "@/pantallas/CerrarJornadaDialog.tsx";
import { TurnosDialog, type TurnoPlantilla } from "@/pantallas/TurnosDialog.tsx";

type Props = {
  onCrearProducto: () => void;
  onCategorias: () => void;
  onContornos: () => void;
  onRecetas?: () => void;
  onEditarMapa: () => void;
  onMesas: () => void;
  onMovimientoActualizado?: () => void | Promise<void>;
  onReportes?: () => void;
  esAdministrador?: boolean;
};

type Jornada = {
  id: number;
  fechaOperativa: string;
  abiertaEn: string;
  abiertaPor: string | null;
  turnoNombre: string;
  turnoPlantillaId: number | null;
};

type Resumen = ResumenCierreJornada;

type EstadoJornada = { jornada: Jornada | null; resumen: Resumen | null };

function fechaLegible(fecha: string): string {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "long" }).format(new Date(`${fecha}T12:00:00`));
}

export function Backend({
  onCrearProducto,
  onCategorias,
  onContornos,
  onRecetas,
  onEditarMapa,
  onMesas,
  onMovimientoActualizado,
  onReportes,
  esAdministrador = true,
}: Props) {
  const [estado, setEstado] = useState<EstadoJornada | null>(null);
  const [confirmar, setConfirmar] = useState<"reiniciar" | null>(null);
  const [cerrando, setCerrando] = useState(false);
  const [cierreError, setCierreError] = useState("");
  const [turnosAbiertos, setTurnosAbiertos] = useState(false);
  const [turnos, setTurnos] = useState<TurnoPlantilla[]>([]);
  const [turnoSeleccionado, setTurnoSeleccionado] = useState(0);
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  async function cargarJornada() {
    setEstado(await api<EstadoJornada>("/api/jornadas/actual"));
  }

  async function cargarTurnos() {
    const respuesta = await api<{ turnos: TurnoPlantilla[] }>("/api/jornadas/turnos");
    setTurnos(respuesta.turnos);
    const predeterminado = respuesta.turnos.find((turno) => turno.esPredeterminada && turno.activa) ?? respuesta.turnos.find((turno) => turno.activa);
    setTurnoSeleccionado(predeterminado?.id || 0);
  }

  useEffect(() => {
    Promise.all([cargarJornada(), cargarTurnos()]).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function ejecutar(ruta: string, exito: string) {
    setProcesando(true);
    setError("");
    setMensaje("");
    try {
      await api(ruta, { method: "POST" });
      await cargarJornada();
      await onMovimientoActualizado?.();
      setMensaje(exito);
      setConfirmar(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcesando(false);
    }
  }

  async function abrirJornada() {
    setProcesando(true);
    setError("");
    try {
      await api("/api/jornadas/abrir", { method: "POST", body: JSON.stringify({ turnoPlantillaId: turnoSeleccionado }) });
      await cargarJornada();
      setMensaje("Jornada operativa abierta.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcesando(false);
    }
  }

  async function cerrarJornada(input: { usuario: string; password: string; cierreEn?: string }) {
    setProcesando(true);
    setCierreError("");
    try {
      await api("/api/jornadas/cerrar-masivo", { method: "POST", body: JSON.stringify(input) });
      await cargarJornada();
      await onMovimientoActualizado?.();
      setCerrando(false);
      setMensaje("Turno cerrado y respaldo creado.");
    } catch (e) {
      setCierreError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcesando(false);
    }
  }

  async function marcarListasEntregadas() {
    setProcesando(true);
    setCierreError("");
    try {
      await api("/api/jornadas/listos/entregar", { method: "POST" });
      await Promise.all([cargarJornada(), onMovimientoActualizado?.()]);
    } catch (e) {
      setCierreError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcesando(false);
    }
  }

  async function guardarTurno(turno: TurnoPlantilla) {
    setProcesando(true);
    setError("");
    try {
      await api(turno.id ? `/api/jornadas/turnos/${turno.id}` : "/api/jornadas/turnos", {
        method: turno.id ? "PUT" : "POST",
        body: JSON.stringify(turno),
      });
      await cargarTurnos();
      setMensaje("Configuración de turnos guardada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcesando(false);
    }
  }

  const jornada = estado?.jornada;
  const resumen = estado?.resumen;
  const cargandoJornada = estado === null && !error;
  return (
    <section className="page-shell backend-odoo">
      <header className="page-header">
        <div>
          <span className="page-eyebrow">{esAdministrador ? "Administración" : "Operación"}</span>
          <h1>{esAdministrador ? "Administración del restaurante" : "Día operativo"}</h1>
          <p>{esAdministrador ? "Gestiona la operación, la carta y la distribución del salón." : "Abre, supervisa y cierra el turno actual."}</p>
        </div>
        <Button type="button" variant="outline" onClick={onMesas}>
          <LayoutDashboard size={18} aria-hidden="true" /> Volver al salón
        </Button>
      </header>
      {error ? <Alerta onCerrar={() => setError("")}>{error}</Alerta> : null}
      {mensaje ? <Alerta tono="info" onCerrar={() => setMensaje("")}>{mensaje}</Alerta> : null}
      <Card className="backend-jornada">
        <div className="backend-jornada__encabezado">
          <span className="backend-jornada__icono"><CalendarDays size={24} aria-hidden="true" /></span>
          <div>
            <div className="backend-jornada__titulo">
              <h2>Día operativo</h2>
              <Badge variant={cargandoJornada ? "secondary" : jornada ? "success" : "warning"}>
                {cargandoJornada ? "Consultando" : jornada ? "Jornada abierta" : "Jornada cerrada"}
              </Badge>
            </div>
            <p>
              {cargandoJornada
                ? "Consultando el estado de la jornada…"
                : jornada
                ? `${jornada.turnoNombre || "Jornada general"} · ${fechaLegible(jornada.fechaOperativa)} · abierta${jornada.abiertaPor ? ` por ${jornada.abiertaPor}` : ""}`
                : "Abre una jornada para comenzar a registrar órdenes."}
            </p>
          </div>
        </div>
        {jornada && resumen ? (
          <dl className="backend-jornada__metricas">
            <div><dt>Cuentas activas</dt><dd>{resumen.cuentasActivas}</dd></div>
            <div><dt>Órdenes</dt><dd>{resumen.ordenes}</dd></div>
            <div><dt>Cocina pendiente</dt><dd>{resumen.tareasCocinaPendientes}</dd></div>
            <div><dt>Solicitudes</dt><dd>{resumen.incidenciasPendientes}</dd></div>
            <div><dt>Listas sin confirmar</dt><dd>{resumen.ordenesListas}</dd></div>
            <div><dt>Para llevar pendientes</dt><dd>{resumen.pedidosParaLlevarPendientes}</dd></div>
          </dl>
        ) : null}
        <div className="backend-jornada__acciones">
          {cargandoJornada ? (
            <Button type="button" variant="outline" disabled>Consultando jornada…</Button>
          ) : jornada ? (
            <Button type="button" variant="outline" onClick={() => { setCierreError(""); setCerrando(true); }} disabled={procesando}>
              <Archive size={18} aria-hidden="true" /> Cerrar jornada
            </Button>
          ) : (
            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
              <Select aria-label="Turno a abrir" className="min-w-48" value={turnoSeleccionado} onChange={(event) => setTurnoSeleccionado(Number(event.target.value))}>
                {turnos.filter((turno) => turno.activa).map((turno) => <option key={turno.id} value={turno.id}>{turno.nombre}{turno.esPredeterminada ? " (predeterminado)" : ""}</option>)}
              </Select>
              <Button type="button" onClick={abrirJornada} disabled={procesando || !turnoSeleccionado}>
                <CalendarDays size={18} aria-hidden="true" /> Abrir jornada
              </Button>
            </div>
          )}
          {esAdministrador ? <Button type="button" variant="outline" onClick={() => setTurnosAbiertos(true)} disabled={procesando}><CalendarClock size={18} aria-hidden="true" /> Configurar turnos</Button> : null}
          {esAdministrador ? <Button type="button" variant="destructive" onClick={() => setConfirmar("reiniciar")} disabled={procesando || cargandoJornada}>
            <RotateCcw size={18} aria-hidden="true" /> Reiniciar día de demostración
          </Button> : null}
        </div>
      </Card>
      {esAdministrador ? <div className="backend-odoo__atajos">
        <Card className="backend-atajo">
          <Plus size={24} aria-hidden="true" />
          <div><h2>Nuevo producto</h2><p>Añade platos, bebidas o materiales.</p></div>
          <Button type="button" onClick={onCrearProducto}>Crear producto</Button>
        </Card>
        <Card className="backend-atajo">
          <Shapes size={24} aria-hidden="true" />
          <div><h2>Categorías</h2><p>Ordena la carta para encontrar productos rápido.</p></div>
          <Button type="button" variant="outline" onClick={onCategorias}>Administrar</Button>
        </Card>
        <Card className="backend-atajo">
          <Layers3 size={24} aria-hidden="true" />
          <div><h2>Contornos</h2><p>Configura opciones, suplementos y extras.</p></div>
          <Button type="button" variant="outline" onClick={onContornos}>Configurar</Button>
        </Card>
        <Card className="backend-atajo">
          <BookOpen size={24} aria-hidden="true" />
          <div><h2>Recetas</h2><p>Edita ingredientes y cantidades de cada plato.</p></div>
          <Button type="button" variant="outline" onClick={onRecetas} disabled={!onRecetas}>Editar recetas</Button>
        </Card>
        <Card className="backend-atajo">
          <LayoutGrid size={24} aria-hidden="true" />
          <div><h2>Mapa del salón</h2><p>Organiza pisos, mesas y capacidad.</p></div>
          <Button type="button" variant="outline" onClick={onEditarMapa}>Editar mapa</Button>
        </Card>
        <Card className="backend-atajo">
          <FileBarChart size={24} aria-hidden="true" />
          <div><h2>Reportes</h2><p>Descarga ventas e inventario por período.</p></div>
          <Button type="button" variant="outline" onClick={onReportes} disabled={!onReportes}>Abrir reportes</Button>
        </Card>
      </div> : null}
      {cerrando && resumen ? <CerrarJornadaDialog resumen={resumen} procesando={procesando} error={cierreError} onActualizarEntregas={marcarListasEntregadas} onCancelar={() => setCerrando(false)} onConfirmar={cerrarJornada} /> : null}
      {turnosAbiertos ? <TurnosDialog turnos={turnos} procesando={procesando} onCancelar={() => setTurnosAbiertos(false)} onGuardar={guardarTurno} /> : null}
      {confirmar === "reiniciar" ? (
        <ConfirmarDialog
          titulo="¿Reiniciar el día de demostración?"
          descripcion="Se respaldará la base y se reemplazarán cuentas, órdenes, comandas y precuentas por datos demo frescos. También se restaurarán las existencias iniciales de prueba; la carta, las mesas y los usuarios se conservan."
          confirmarTexto={procesando ? "Reiniciando…" : "Reiniciar día"}
          peligro
          onCancelar={() => !procesando && setConfirmar(null)}
          onConfirmar={() => ejecutar("/api/jornadas/demo/reiniciar", "Día de demostración reiniciado; el respaldo quedó registrado.")}
        />
      ) : null}
    </section>
  );
}
