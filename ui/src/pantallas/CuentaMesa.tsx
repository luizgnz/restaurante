import {
  Ban,
  Clock3,
  Pencil,
  Plus,
  ReceiptText,
  Send,
  Trash2,
  UserRound,
} from "lucide-react";
import { dinero, fechaCorta } from "../../../src/modules/formato.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { etiquetaCuenta, etiquetaOrden, tonoCuenta, tonoOrden } from "../lib/estados.ts";

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
  etapa?: "enviado" | "en_preparacion" | "listo" | "entregado";
  indicaciones: string | null;
  indicacionesOriginales: string | null;
  creadaEn: string;
  empleado: string;
  lineas: LineaOrdenUi[];
};

export function ordenPuedeEditar(orden: OrdenCuentaUi): boolean {
  return (orden.etapa ?? "enviado") === "enviado";
}

export type CuentaDetalleUi = {
  id: number;
  mesa: { id: number; numero: number };
  tipoServicio?: "mesa" | "para_llevar";
  numeroServicio?: number | null;
  clienteNombre?: string | null;
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
  onCancelarCuenta?: () => void;
  onReimprimir?: () => void;
};

export function CuentaMesa({
  cuenta,
  puedeCerrar,
  onNuevaOrden,
  onEditarOrden,
  onAnularOrden,
  onPrecuenta,
  onCerrarCuenta,
  onCancelarCuenta,
  onReimprimir,
}: Props) {
  const aceptaConsumo = cuenta.estado === "abierta" || cuenta.estado === "precuenta_emitida";
  const esParaLlevar = cuenta.tipoServicio === "para_llevar";

  return (
    <section className="cuenta-mesa">
      <header className="cuenta-mesa__cabecera">
        <div>
          <span className="cuenta-mesa__eyebrow">Servicio en curso</span>
          <h1>{esParaLlevar ? `Pedido para llevar #${cuenta.numeroServicio}` : `Cuenta de mesa #${cuenta.mesa.numero}`}</h1>
          <div className="cuenta-mesa__resumen">
            <Badge variant={tonoCuenta(cuenta.estado)}>
              {etiquetaCuenta(cuenta.estado)}
            </Badge>
            <strong>Total {dinero(cuenta.totalCentavos)}</strong>
          </div>
        </div>
        {aceptaConsumo && !esParaLlevar ? (
          <Button type="button" className="cuenta-mesa__nueva" onClick={onNuevaOrden}>
            <Plus size={18} aria-hidden="true" /> Nueva orden
          </Button>
        ) : null}
      </header>

      <div className="cuenta-mesa__ordenes">
        {cuenta.ordenes.map((orden) => (
          <Card className="tarjeta cuenta-orden" key={orden.id}>
            <header className="cuenta-orden__cabecera">
              <div>
                <h2>Orden #{orden.id}</h2>
                <Badge variant={tonoOrden(orden.estado)}>
                  {etiquetaOrden(orden.estado)}
                </Badge>
              </div>
              {aceptaConsumo && orden.estado !== "anulada" && ordenPuedeEditar(orden) ? (
                <div className="cuenta-orden__acciones">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="icono-secundario"
                    aria-label={`Editar Orden #${orden.id}`}
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
                    aria-label={`Anular Orden #${orden.id}`}
                    title="Anular orden · requiere motivo y PIN"
                    onClick={() => onAnularOrden(orden)}
                  >
                    <Trash2 size={19} aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
            </header>
            <p className="cuenta-orden__meta">
              <UserRound size={15} aria-hidden="true" /> {orden.empleado}
              <Clock3 size={15} aria-hidden="true" /> {fechaCorta(orden.creadaEn)}
            </p>
            {orden.lineas.filter((linea) => linea.cantidad > 0).map((linea) => (
              <div className="pedido-linea" key={linea.lineaClave}>
                <span>
                  {linea.cantidad} × {linea.nombre}
                  {linea.nota ? ` (${linea.nota})` : ""}
                </span>
                <span>{dinero(linea.cantidad * linea.precioCentavos)}</span>
                {(linea.contornos ?? []).length > 0 ? (
                  <span className="pedido-nota-fija">{linea.contornos!.join(" · ")}</span>
                ) : null}
              </div>
            ))}
            {orden.indicaciones ? <p className="pedido-indicaciones">Indicaciones: {orden.indicaciones}</p> : null}
          </Card>
        ))}
      </div>

      <footer className="cuenta-mesa__pie">
        <div><span>Total de la cuenta</span><strong>{dinero(cuenta.totalCentavos)}</strong></div>
          {aceptaConsumo && !esParaLlevar ? (
          <>
            {cuenta.estado === "precuenta_emitida" && onReimprimir ? (
              <Button type="button" variant="outline" className="cuenta-mesa__accion-pie" onClick={onReimprimir}>
                <ReceiptText size={18} aria-hidden="true" />
                <span className="cuenta-mesa__accion-larga">Reimprimir</span>
                <span className="cuenta-mesa__accion-corta">Ticket</span>
              </Button>
            ) : (
              <Button type="button" variant="outline" className="cuenta-mesa__accion-pie" onClick={onPrecuenta}>
                <ReceiptText size={18} aria-hidden="true" /> Precuenta
              </Button>
            )}
            {puedeCerrar ? (
              <Button type="button" className="cuenta-mesa__accion-pie" onClick={onCerrarCuenta}>
                <Send size={18} aria-hidden="true" />
                <span className="cuenta-mesa__accion-larga">Cerrar cuenta</span>
                <span className="cuenta-mesa__accion-corta">Cerrar</span>
              </Button>
            ) : null}
            {onCancelarCuenta ? (
              <Button type="button" variant="outline" className="peligro cuenta-mesa__accion-pie" onClick={onCancelarCuenta}>
                <Ban size={18} aria-hidden="true" />
                <span className="cuenta-mesa__accion-larga">Cancelar cuenta</span>
                <span className="cuenta-mesa__accion-corta">Cancelar</span>
              </Button>
            ) : null}
          </>
        ) : null}
      </footer>
    </section>
  );
}
