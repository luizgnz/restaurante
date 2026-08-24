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
  cuentas: CuentaEnCursoUi[];
  onAbrir: (cuentaId: number) => void;
};

export function Pedidos({ cuentas, onAbrir }: Props) {
  const totalOrdenes = cuentas.reduce((total, cuenta) => total + cuenta.ordenes.length, 0);
  return (
    <section className="page-shell pedidos-page">
      <header className="page-header">
        <div>
          <span className="page-eyebrow">Servicio actual</span>
          <h1>Órdenes</h1>
          <p>Revisa las cuentas abiertas y entra a una mesa para editar o continuar el servicio.</p>
        </div>
        <div className="pedidos-page__metricas">
          <Badge variant="secondary"><Utensils size={14} aria-hidden="true" /> {cuentas.length} mesas</Badge>
          <Badge><ReceiptText size={14} aria-hidden="true" /> {totalOrdenes} órdenes</Badge>
        </div>
      </header>
      <div className="kds pedidos-grid">
        {cuentas.map((cuenta) => (
          <Card className="tarjeta pedido-card" key={cuenta.id}>
            <button className="pedido-cabecera" onClick={() => onAbrir(cuenta.id)}>
              <span className="pedido-card__mesa"><strong>Mesa {cuenta.mesa}</strong><Badge variant="warning">{ESTADO[cuenta.estado] ?? cuenta.estado}</Badge></span>
              <span className="pedido-card__meta"><Clock3 size={15} aria-hidden="true" /> {cuenta.mesero} · {cuenta.hace}</span>
            </button>
            <div className="pedido-card__ordenes">
              {cuenta.ordenes.map((orden) => (
                <div className="pedido-indicaciones" key={orden.id}>
                  <strong>Orden #{orden.numero}</strong>
                  <span>{orden.lineas.map((linea) => `${linea.cantidad} × ${linea.nombre}${linea.nota ? ` (${linea.nota})` : ""}`).join(", ")}</span>
                </div>
              ))}
            </div>
            {cuenta.ordenes.length === 0 ? <p className="login-odoo__ayuda">Sin órdenes aún</p> : null}
          </Card>
        ))}
        {cuentas.length === 0 ? <div className="empty-state"><ReceiptText size={30} aria-hidden="true" /><strong>No hay cuentas en curso</strong><span>Las nuevas órdenes aparecerán aquí.</span></div> : null}
      </div>
    </section>
  );
}
import { Clock3, ReceiptText, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Card } from "@/components/ui/card.tsx";
