import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { Card, CardContent } from "../components/ui/card.tsx";

export type LineaPedido = {
  id: number;
  nombre: string;
  cantidad: number;
  estado: string;
  nota?: string | null;
  sePuedeEditar: boolean;
};

export type PedidoEnCurso = {
  id: number;
  mesa: number | null;
  mesero: string;
  hace: string;
  espera_min?: number;
  abierto_en?: string;
  estado?: string;
  indicaciones?: string | null;
  lineas: LineaPedido[];
};

const ESTADO: Record<string, string> = {
  borrador: "Sin completar",
  parcialmente_enviado: "Sin completar",
  enviado: "En cocina",
  precuenta_emitida: "Precuenta emitida",
};

type Props = {
  pedidos: PedidoEnCurso[];
  onAbrir: (id: number) => void;
  onEnProceso: (lineaId: number) => void;
  mostrarEnProceso?: boolean;
};

export function Pedidos({ pedidos, onAbrir, onEnProceso, mostrarEnProceso }: Props) {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="m-0 text-2xl font-semibold tracking-tight">Órdenes</h1>
      <div className="kds flex flex-col gap-3">
        {pedidos.map((p) => (
          <Card className="tarjeta" key={p.id}>
            <CardContent className="p-4">
              <Button variant="ghost" className="pedido-cabecera h-auto w-full justify-between rounded-2xl px-2" onClick={() => onAbrir(p.id)}>
                <strong>{p.mesa ? `Mesa ${p.mesa}` : "Sin mesa asignada"}</strong>
                <Badge className="pedido-estado">{p.estado ? (ESTADO[p.estado] ?? p.estado) : "Sin completar"}</Badge>
                <span className="text-sm text-muted-foreground">
                  {p.mesero} · {p.hace}
                </span>
              </Button>
              {p.indicaciones ? <p className="pedido-indicaciones text-sm text-muted-foreground">{p.indicaciones}</p> : null}
              {p.lineas.map((l) => (
                <div className="pedido-linea flex items-center justify-between gap-3 py-2" key={l.id}>
                  <span>
                    {l.cantidad} × {l.nombre}
                    {l.nota ? ` (${l.nota})` : ""}
                  </span>
                  {mostrarEnProceso && l.estado === "enviada" ? (
                    <Button size="sm" variant="secondary" onClick={() => onEnProceso(l.id)}>
                      En proceso
                    </Button>
                  ) : null}
                </div>
              ))}
              {p.lineas.length === 0 ? <p className="login-odoo__ayuda text-sm text-muted-foreground">Sin productos aún</p> : null}
            </CardContent>
          </Card>
        ))}
        {pedidos.length === 0 ? <p className="text-muted-foreground">No hay pedidos en curso</p> : null}
      </div>
    </section>
  );
}
