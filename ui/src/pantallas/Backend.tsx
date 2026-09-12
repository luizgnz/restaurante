import { useEffect, useState } from "react";
import {
  Archive,
  BookOpen,
  CalendarDays,
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

type Props = {
  onCrearProducto: () => void;
  onCategorias: () => void;
  onContornos: () => void;
  onRecetas?: () => void;
  onEditarMapa: () => void;
  onMesas: () => void;
  onMovimientoActualizado?: () => void | Promise<void>;
};

type Jornada = {
  id: number;
  fechaOperativa: string;
  abiertaEn: string;
  abiertaPor: string | null;
};

type Resumen = {
  cuentasActivas: number;
  cuentasTotales: number;
  ordenes: number;
  tareasCocinaPendientes: number;
  incidenciasPendientes: number;
};

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
}: Props) {
  const [estado, setEstado] = useState<EstadoJornada | null>(null);
  const [confirmar, setConfirmar] = useState<"cerrar" | "reiniciar" | null>(null);
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

  const jornada = estado?.jornada;
  const resumen = estado?.resumen;
  const cargandoJornada = estado === null && !error;
  return (
    <section className="page-shell backend-odoo">
      <header className="page-header">
        <div>
          <span className="page-eyebrow">Administración</span>
          <h1>Administración del restaurante</h1>
          <p>Gestiona la carta, su estructura y la distribución del salón.</p>
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
                ? `${fechaLegible(jornada.fechaOperativa)} · abierta${jornada.abiertaPor ? ` por ${jornada.abiertaPor}` : ""}`
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
          </dl>
        ) : null}
        <div className="backend-jornada__acciones">
          {cargandoJornada ? (
            <Button type="button" variant="outline" disabled>Consultando jornada…</Button>
          ) : jornada ? (
            <Button type="button" variant="outline" onClick={() => setConfirmar("cerrar")} disabled={procesando}>
              <Archive size={18} aria-hidden="true" /> Cerrar jornada
            </Button>
          ) : (
            <Button type="button" onClick={() => ejecutar("/api/jornadas/abrir", "Jornada operativa abierta.")} disabled={procesando}>
              <CalendarDays size={18} aria-hidden="true" /> Abrir jornada
            </Button>
          )}
          <Button type="button" variant="destructive" onClick={() => setConfirmar("reiniciar")} disabled={procesando || cargandoJornada}>
            <RotateCcw size={18} aria-hidden="true" /> Reiniciar día de demostración
          </Button>
        </div>
      </Card>
      <div className="backend-odoo__atajos">
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
      </div>
      {confirmar === "cerrar" ? (
        <ConfirmarDialog
          titulo="¿Cerrar la jornada operativa?"
          descripcion="Se creará un respaldo antes del cierre. Para proteger el servicio, no se puede cerrar mientras existan cuentas, tareas de cocina o solicitudes pendientes."
          confirmarTexto={procesando ? "Cerrando…" : "Cerrar jornada"}
          peligro
          onCancelar={() => !procesando && setConfirmar(null)}
          onConfirmar={() => ejecutar("/api/jornadas/cerrar", "Jornada cerrada y respaldo creado.")}
        />
      ) : null}
      {confirmar === "reiniciar" ? (
        <ConfirmarDialog
          titulo="¿Reiniciar el día de demostración?"
          descripcion="Se respaldará la base y se reemplazarán cuentas, órdenes, comandas y precuentas por datos demo frescos. La carta, las mesas, el inventario base y los usuarios se conservan."
          confirmarTexto={procesando ? "Reiniciando…" : "Reiniciar día"}
          peligro
          onCancelar={() => !procesando && setConfirmar(null)}
          onConfirmar={() => ejecutar("/api/jornadas/demo/reiniciar", "Día de demostración reiniciado; el respaldo quedó registrado.")}
        />
      ) : null}
    </section>
  );
}
