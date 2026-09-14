import { CalendarRange, Download, FileBarChart, PackageSearch } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";

type Periodo = "hoy" | "semana" | "mes" | "personalizado";

type Props = {
  puedeVentas: boolean;
  onVolver: () => void;
};

function fechaISO(fecha: Date): string {
  const local = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function rangoDe(periodo: Exclude<Periodo, "personalizado">) {
  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);
  const desde = new Date(hoy);
  const hasta = new Date(hoy);
  if (periodo === "semana") {
    const diasDesdeLunes = (hoy.getDay() + 6) % 7;
    desde.setDate(hoy.getDate() - diasDesdeLunes);
    hasta.setDate(desde.getDate() + 6);
  }
  if (periodo === "mes") {
    desde.setDate(1);
    hasta.setMonth(hoy.getMonth() + 1, 0);
  }
  return { desde: fechaISO(desde), hasta: fechaISO(hasta) };
}

export function Reportes({ puedeVentas, onVolver }: Props) {
  const inicial = rangoDe("hoy");
  const [periodo, setPeriodo] = useState<Periodo>("hoy");
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const rangoValido = Boolean(desde && hasta && desde <= hasta);
  const parametros = useMemo(() => new URLSearchParams({ desde, hasta }).toString(), [desde, hasta]);

  function elegir(siguiente: Periodo) {
    setPeriodo(siguiente);
    if (siguiente !== "personalizado") {
      const rango = rangoDe(siguiente);
      setDesde(rango.desde);
      setHasta(rango.hasta);
    }
  }

  return (
    <section className="page-shell reportes-page">
      <header className="page-header">
        <div>
          <span className="page-eyebrow">Administración</span>
          <h1>Reportes</h1>
          <p>Genera documentos operativos del período. Los archivos se descargan al solicitarlos y no se guardan dentro del sistema.</p>
        </div>
        <Button type="button" variant="outline" onClick={onVolver}>Volver</Button>
      </header>

      <Card className="reportes-periodo">
        <div className="reportes-periodo__titulo">
          <CalendarRange size={22} aria-hidden="true" />
          <div><h2>Período del reporte</h2><p>La semana se considera de lunes a domingo e incluye ambas fechas.</p></div>
        </div>
        <div className="reportes-periodo__atajos" role="group" aria-label="Período rápido">
          {([['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['personalizado', 'Personalizado']] as const).map(([valor, etiqueta]) => (
            <Button key={valor} type="button" size="sm" variant={periodo === valor ? "default" : "outline"} onClick={() => elegir(valor)}>{etiqueta}</Button>
          ))}
        </div>
        <div className="reportes-periodo__fechas">
          <label>Desde<Input type="date" value={desde} max={hasta} onChange={(event) => { setPeriodo("personalizado"); setDesde(event.target.value); }} /></label>
          <label>Hasta<Input type="date" value={hasta} min={desde} onChange={(event) => { setPeriodo("personalizado"); setHasta(event.target.value); }} /></label>
        </div>
        {!rangoValido ? <p className="reportes-periodo__error" role="alert">La fecha final debe ser igual o posterior a la fecha inicial.</p> : null}
      </Card>

      <div className="reportes-lista">
        {puedeVentas ? (
          <Card className="reporte-card">
            <span className="reporte-card__icono"><FileBarChart size={24} aria-hidden="true" /></span>
            <div>
              <h2>Ventas registradas</h2>
              <p>Cuentas cerradas, total y promedio, mesa frente a para llevar, productos, cancelaciones y desglose por turno.</p>
              <small>Las cuentas abiertas se informan aparte y nunca se suman al total.</small>
            </div>
            <Button asChild className={!rangoValido ? "pointer-events-none opacity-45" : ""} aria-disabled={!rangoValido}>
              <a href={`/api/reportes/ventas.pdf?${parametros}`} download><Download size={18} aria-hidden="true" /> Descargar PDF</a>
            </Button>
          </Card>
        ) : null}
        <Card className="reporte-card">
          <span className="reporte-card__icono"><PackageSearch size={24} aria-hidden="true" /></span>
          <div>
            <h2>Inventario</h2>
            <p>Existencias, reservas, disponibilidad, entradas, consumo por recetas, devoluciones, pérdidas y estado de stock.</p>
            <small>Las cantidades se muestran en la unidad configurada para cada material.</small>
          </div>
          <Button asChild className={!rangoValido ? "pointer-events-none opacity-45" : ""} aria-disabled={!rangoValido}>
            <a href={`/api/reportes/inventario.pdf?${parametros}`} download><Download size={18} aria-hidden="true" /> Descargar PDF</a>
          </Button>
        </Card>
      </div>
    </section>
  );
}
