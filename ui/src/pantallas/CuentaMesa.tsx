import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { Label } from "../components/ui/label.tsx";
import { Textarea } from "../components/ui/textarea.tsx";

export type LineaOrdenUi = {
  lineaClave: string;
  ordenLineaId: number | null;
  productoId: number;
  nombre: string;
  cantidad: number;
  precioCentavos: number;
  nota: string | null;
};

export type OrdenCuentaUi = {
  id: number;
  numero: number;
  estado: "enviada" | "corregida" | "anulada";
  indicaciones: string | null;
  indicacionesOriginales: string | null;
  creadaEn: string;
  empleado: string;
  lineas: LineaOrdenUi[];
};

export type CuentaDetalleUi = {
  id: number;
  mesa: { id: number; numero: number };
  estado: "abierta" | "precuenta_emitida" | "en_caja" | "cancelada";
  notaPrivada: string | null;
  totalCentavos: number;
  ordenes: OrdenCuentaUi[];
};

type Props = {
  cuenta: CuentaDetalleUi;
  onNuevaOrden: () => void;
  onEditarOrden: (orden: OrdenCuentaUi) => void;
  onAnularOrden: (orden: OrdenCuentaUi) => void;
  onPrecuenta: () => void;
  onEnviarCaja: () => void;
  onNotaPrivada: (nota: string) => Promise<void>;
};

export function CuentaMesa({
  cuenta,
  onNuevaOrden,
  onEditarOrden,
  onAnularOrden,
  onPrecuenta,
  onEnviarCaja,
  onNotaPrivada,
}: Props) {
  const aceptaConsumo = cuenta.estado === "abierta" || cuenta.estado === "precuenta_emitida";
  const [notaPrivada, setNotaPrivada] = useState(cuenta.notaPrivada ?? "");
  const [errorNota, setErrorNota] = useState("");

  useEffect(() => {
    setNotaPrivada(cuenta.notaPrivada ?? "");
  }, [cuenta.id, cuenta.notaPrivada]);

  return (
    <section className="cuenta-mesa flex flex-col gap-4">
      <header className="cuenta-mesa__cabecera flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-semibold tracking-tight">Cuenta de mesa #{cuenta.mesa.numero}</h1>
          <p className="login-odoo__ayuda text-sm text-muted-foreground">
            {cuenta.estado.replaceAll("_", " ")} · Total ${cuenta.totalCentavos}
          </p>
        </div>
        {aceptaConsumo ? (
          <Button type="button" onClick={onNuevaOrden}>
            <Plus size={18} aria-hidden="true" /> Nueva orden
          </Button>
        ) : null}
      </header>

      <div className="cuenta-mesa__ordenes grid gap-3 lg:grid-cols-2">
        {cuenta.ordenes.map((orden) => (
          <article className="tarjeta cuenta-orden rounded-3xl border border-border bg-card p-4 shadow-sm" key={orden.id}>
            <header className="cuenta-orden__cabecera">
              <div>
                <h2>Orden #{orden.numero}</h2>
                <Badge className="pedido-estado">{orden.estado}</Badge>
              </div>
              {aceptaConsumo && orden.estado !== "anulada" ? (
                <div className="cuenta-orden__acciones">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="icono-secundario"
                    title="Editar orden"
                    onClick={() => onEditarOrden(orden)}
                  >
                    <Pencil size={19} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="icono-secundario peligro"
                    title="Anular orden"
                    onClick={() => onAnularOrden(orden)}
                  >
                    <Trash2 size={19} aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
            </header>
            <p className="cuenta-orden__meta">
              {orden.empleado} · {new Date(orden.creadaEn).toLocaleString("es")}
            </p>
            {orden.lineas.filter((linea) => linea.cantidad > 0).map((linea) => (
              <div className="pedido-linea" key={linea.lineaClave}>
                <span>
                  {linea.cantidad} × {linea.nombre}
                  {linea.nota ? ` (${linea.nota})` : ""}
                </span>
                <span>${linea.cantidad * linea.precioCentavos}</span>
              </div>
            ))}
            {orden.indicaciones ? <p className="pedido-indicaciones">Indicaciones: {orden.indicaciones}</p> : null}
          </article>
        ))}
      </div>

      <Label className="tarjeta cuenta-mesa__nota">
        Nota privada
        <Textarea
          value={notaPrivada}
          placeholder="Solo visible en el POS. No va a cocina."
          onChange={(event) => setNotaPrivada(event.target.value)}
          onBlur={() => {
            setErrorNota("");
            onNotaPrivada(notaPrivada).catch((error) =>
              setErrorNota(error instanceof Error ? error.message : String(error)),
            );
          }}
        />
        <span className="login-odoo__ayuda">Solo visible en el POS.</span>
        {errorNota ? <span role="alert">{errorNota}</span> : null}
      </Label>

      <footer className="cuenta-mesa__pie sticky bottom-0 flex flex-wrap items-center gap-2 rounded-3xl border border-border bg-card p-3 shadow-sm">
        <strong>Total ${cuenta.totalCentavos}</strong>
        {aceptaConsumo ? (
          <>
            <Button type="button" variant="outline" onClick={onPrecuenta}>
              Precuenta
            </Button>
            <Button type="button" onClick={onEnviarCaja}>
              Enviar a caja
            </Button>
          </>
        ) : null}
      </footer>
    </section>
  );
}
