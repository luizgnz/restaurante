import { useEffect, useState } from "react";
import {
  Archive,
  BookOpen,
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
import { CerrarJornadaDialog, type ResumenCierreJornada } from "@/pantallas/CerrarJornadaDialog.tsx";

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
};

type Resumen = ResumenCierreJornada;

type EstadoJornada = { jornada: Jornada | null; resumen: Resumen | null };

function fechaLegible(fecha: string): string {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "long" }).format(new Date(`${fecha}T12:00:00`));
}

function fechaLocalActual(): string {
  const hoy = new Date();
  return [hoy.getFullYear(), String(hoy.getMonth() + 1).padStart(2, "0"), String(hoy.getDate()).padStart(2, "0")].join("-");
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
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  async function cargarJornada() {
    setEstado(await api<EstadoJornada>("/api/jornadas/actual"));
  }

  useEffect(() => {
    cargarJornada().catch((e) => setError(e instanceof Error ? e.message : String(e)));
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
      await api("/api/jornadas/abrir", { method: "POST" });
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
      setMensaje("Jornada cerrada y respaldo creado.");
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

  const jornada = estado?.jornada;
  const resumen = estado?.resumen;
  const cargandoJornada = estado === null && !error;
  const fechaActual = fechaLocalActual();
  const jornadaAnterior = jornada && jornada.fechaOperativa !== fechaActual;
  return (
    <section className="page-shell backend-odoo">
      <header className="page-header">
        <div>
          <span className="page-eyebrow">{esAdministrador ? "Administración" : "Operación"}</span>
          <h1>{esAdministrador ? "Administración del restaurante" : "Día operativo"}</h1>
          <p>{esAdministrador ? "Gestiona la operación, la carta y la distribución del salón." : "Inicia y cierra la jornada cuando lo necesites."}</p>
        </div>
        <Button type="button" variant="outline" onClick={onMesas}>
          <LayoutDashboard size={18} aria-hidden="true" /> Volver al salón
        </Button>
      </header>
      {error ? <Alerta onCerrar={() => setError("")}>{error}</Alerta> : null}
      {mensaje ? <Alerta tono="info" onCerrar={() => setMensaje("")}>{mensaje}</Alerta> : null}
      <Card className="backend-jornada">
        <div className="backend-jornada__estado">
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
                  ? `${fechaLegible(jornada.fechaOperativa)} · iniciada${jornada.abiertaPor ? ` por ${jornada.abiertaPor}` : ""}`
                  : "Inicia una jornada para comenzar a registrar órdenes."}
              </p>
            </div>
          </div>
          {jornadaAnterior ? <Alerta tono="aviso">La jornada del {fechaLegible(jornada.fechaOperativa)} sigue abierta. Ciérrala antes de registrar ventas de hoy.</Alerta> : null}
        </div>
        <div className="backend-jornada__acciones">
          {cargandoJornada ? (
            <Button type="button" variant="outline" disabled>Consultando jornada…</Button>
          ) : jornada ? (
            <Button type="button" variant="outline" onClick={() => { setCierreError(""); setCerrando(true); }} disabled={procesando}>
              <Archive size={18} aria-hidden="true" /> Cerrar jornada
            </Button>
          ) : (
            <Button type="button" onClick={abrirJornada} disabled={procesando}>
              <CalendarDays size={18} aria-hidden="true" /> Iniciar jornada
            </Button>
          )}
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
      {esAdministrador ? <div className="backend-demo-action">
        <Button type="button" variant="outline" onClick={() => setConfirmar("reiniciar")} disabled={procesando || cargandoJornada}>
          <RotateCcw size={18} aria-hidden="true" /> Reiniciar día de demostración
        </Button>
      </div> : null}
      {cerrando && resumen ? <CerrarJornadaDialog resumen={resumen} procesando={procesando} error={cierreError} onActualizarEntregas={marcarListasEntregadas} onCancelar={() => setCerrando(false)} onConfirmar={cerrarJornada} /> : null}
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
