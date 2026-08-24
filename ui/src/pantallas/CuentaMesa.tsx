import { Clock3, Pencil, Plus, ReceiptText, Send, Trash2, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";

export type LineaOrdenUi = {
  lineaClave: string;
  ordenLineaId: number | null;
  productoId: number;
  nombre: string;
  cantidad: number;
  precioCentavos: number;
  nota: string | null;
  contornos?: string[];
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
  puedeCerrar: boolean;
  onNuevaOrden: () => void;
  onEditarOrden: (orden: OrdenCuentaUi) => void;
  onAnularOrden: (orden: OrdenCuentaUi) => void;
  onPrecuenta: () => void;
  onCerrarCuenta: () => void;
  onNotaPrivada: (nota: string) => Promise<void>;
};

export function CuentaMesa({
  cuenta,
  puedeCerrar,
  onNuevaOrden,
  onEditarOrden,
  onAnularOrden,
  onPrecuenta,
  onCerrarCuenta,
  onNotaPrivada,
}: Props) {
  const aceptaConsumo = cuenta.estado === "abierta" || cuenta.estado === "precuenta_emitida";
  const [notaPrivada, setNotaPrivada] = useState(cuenta.notaPrivada ?? "");
  const [errorNota, setErrorNota] = useState("");

  useEffect(() => {
    setNotaPrivada(cuenta.notaPrivada ?? "");
  }, [cuenta.id, cuenta.notaPrivada]);

  return (
    <section className="cuenta-mesa">
      <header className="cuenta-mesa__cabecera">
        <div>
          <span className="cuenta-mesa__eyebrow">Servicio en curso</span>
          <h1>Cuenta de mesa #{cuenta.mesa.numero}</h1>
          <div className="cuenta-mesa__resumen">
            <Badge variant={cuenta.estado === "precuenta_emitida" ? "warning" : "success"}>
              {cuenta.estado.replaceAll("_", " ")}
            </Badge>
            <strong>Total ${cuenta.totalCentavos}</strong>
          </div>
        </div>
        {aceptaConsumo ? (
          <Button type="button" size="lg" className="primario" onClick={onNuevaOrden}>
            <Plus size={18} aria-hidden="true" /> Nueva orden
          </Button>
        ) : null}
      </header>

      <div className="cuenta-mesa__ordenes">
        {cuenta.ordenes.map((orden) => (
          <Card className="tarjeta cuenta-orden" key={orden.id}>
            <header className="cuenta-orden__cabecera">
              <div>
                <h2>Orden #{orden.numero}</h2>
                <Badge variant={orden.estado === "anulada" ? "danger" : orden.estado === "corregida" ? "warning" : "default"}>
                  {orden.estado}
                </Badge>
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
                    variant="ghost"
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
              <UserRound size={15} aria-hidden="true" /> {orden.empleado}
              <Clock3 size={15} aria-hidden="true" /> {new Date(orden.creadaEn).toLocaleString("es")}
            </p>
            {orden.lineas.filter((linea) => linea.cantidad > 0).map((linea) => (
              <div className="pedido-linea" key={linea.lineaClave}>
                <span>
                  {linea.cantidad} × {linea.nombre}
                  {linea.nota ? ` (${linea.nota})` : ""}
                </span>
                <span>${linea.cantidad * linea.precioCentavos}</span>
                {(linea.contornos ?? []).length > 0 ? (
                  <span className="pedido-nota-fija">{linea.contornos!.join(" · ")}</span>
                ) : null}
              </div>
            ))}
            {orden.indicaciones ? <p className="pedido-indicaciones">Indicaciones: {orden.indicaciones}</p> : null}
          </Card>
        ))}
      </div>

      <label className="tarjeta cuenta-mesa__nota">
        Nota privada
        <textarea
          value={notaPrivada}
          placeholder="Solo visible en el sistema. No va a cocina."
          onChange={(event) => setNotaPrivada(event.target.value)}
          onBlur={() => {
            setErrorNota("");
            onNotaPrivada(notaPrivada).catch((error) =>
              setErrorNota(error instanceof Error ? error.message : String(error)),
            );
          }}
        />
        <span className="login-odoo__ayuda">Solo visible en el sistema.</span>
        {errorNota ? <span role="alert">{errorNota}</span> : null}
      </label>

      <footer className="cuenta-mesa__pie">
        <div><span>Total de la cuenta</span><strong>${cuenta.totalCentavos}</strong></div>
        {aceptaConsumo ? (
          <>
            <Button type="button" variant="outline" onClick={onPrecuenta}>
              <ReceiptText size={18} aria-hidden="true" /> Precuenta
            </Button>
            {puedeCerrar ? (
              <Button type="button" className="primario" onClick={onCerrarCuenta}>
                <Send size={18} aria-hidden="true" /> Cerrar cuenta
              </Button>
            ) : null}
          </>
        ) : null}
      </footer>
    </section>
  );
}
