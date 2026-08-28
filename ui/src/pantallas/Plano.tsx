import { useEffect, useRef, useState } from "react";
import { interpretarTecla } from "../../../src/modules/salon/teclado.ts";
import type { NivelEspera } from "../../../src/modules/tiempo.ts";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";

export type Mesa = {
  id: number;
  numero: number;
  estado: string;
  pedidoId: number | null;
  asientos: number;
  pos_x: number;
  pos_y: number;
  forma: string;
  ancho: number;
  alto: number;
  piso_id?: number;
  fondo_color?: string | null;
  fondo_data?: string | null;
};

export type Piso = {
  id: number;
  nombre: string;
  tiene_fondo?: number;
  fondo_color?: string | null;
  fondo_data?: string | null;
  fondo_quitar_imagen?: boolean;
};

export type PedidoBarra = {
  id: number;
  mesa: number | null;
  mesero: string;
  hace: string;
  espera_min: number;
  nivel: NivelEspera;
  abierto_en?: string;
};

type Props = {
  piso: string;
  pisoId?: number | null;
  pisos?: Piso[];
  mesas: Mesa[];
  fondoUrl?: string | null;
  asignando?: boolean;
  bloqueado?: boolean;
  onMesa: (mesa: Mesa) => void;
  onPiso?: (piso: Piso) => void;
  onNuevoPedido?: () => void;
  onBuscarMesa?: () => void;
  mostrarUltimos?: boolean;
  mostrarAtrasados?: boolean;
  ultimos?: PedidoBarra[];
  atrasados?: PedidoBarra[];
  onPedido?: (id: number) => void;
  onToggleUltimos?: () => void;
  onToggleAtrasados?: () => void;
  onOrdenes?: () => void;
};


const ETIQUETA: Record<string, string> = {
  libre: "Libre",
  ocupada: "Ocupada",
  en_cocina: "En pedido",
  precuenta: "Precuenta",
  en_caja: "En caja",
};

export function Plano({
  piso,
  pisoId,
  pisos,
  mesas,
  fondoUrl,
  asignando,
  bloqueado,
  onMesa,
  onPiso,
  onNuevoPedido,
  onBuscarMesa,
  mostrarUltimos,
  mostrarAtrasados,
  ultimos = [],
  atrasados = [],
  onPedido,
  onToggleUltimos,
  onToggleAtrasados,
  onOrdenes,
}: Props) {
  const [buscando, setBuscando] = useState(false);
  const [buffer, setBuffer] = useState("");
  const [aviso, setAviso] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function abrirNumero(numero: number) {
    const mesa = mesas.find((m) => m.numero === numero);
    if (!mesa) {
      setAviso(`No hay mesa ${numero}`);
      return;
    }
    setBuscando(false);
    setBuffer("");
    setAviso("");
    onMesa(mesa);
  }

  function abrirBuscar() {
    setBuscando(true);
    setAviso("");
    onBuscarMesa?.();
    queueMicrotask(() => inputRef.current?.focus());
  }

  useEffect(() => {
    if (bloqueado) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inputActivo = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const accion = interpretarTecla({
        key: e.key,
        buffer,
        buscando,
        inputActivo,
      });
      if (accion.tipo === "nada") return;
      e.preventDefault();
      if (accion.tipo === "nueva_orden") onNuevoPedido?.();
      if (accion.tipo === "ordenes") onOrdenes?.();
      if (accion.tipo === "buscar_mesa") abrirBuscar();
      if (accion.tipo === "digito") {
        if (!buscando) abrirBuscar();
        setBuffer(accion.buffer);
      }
      if (accion.tipo === "abrir_mesa") abrirNumero(accion.numero);
      if (accion.tipo === "cancelar") {
        setBuscando(false);
        setBuffer("");
        setAviso("");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [buffer, buscando, mesas, bloqueado]);

  const listaPisos = pisos && pisos.length > 0 ? pisos : [{ id: pisoId ?? 0, nombre: piso }];
  const mesasDelPiso = mesas.filter((m) => pisoId == null || m.piso_id == null || m.piso_id === pisoId);

  return (
    <section className="salon-odoo flex min-h-[70vh] flex-1 flex-col gap-3">
      <header className="salon-odoo__pisos grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div className="salon-odoo__pisos-izq flex flex-wrap gap-2">
          {onNuevoPedido ? (
            <Button type="button" title="Nueva orden (N)" onClick={onNuevoPedido}>
              + Nueva orden
            </Button>
          ) : null}
        </div>
        <div className="salon-odoo__pisos-centro flex flex-wrap justify-start gap-2 sm:justify-center" role="tablist" aria-label="Pisos">
          {listaPisos.map((p) => {
            const actual = (pisoId != null && p.id === pisoId) || (pisoId == null && p.nombre === piso);
            return (
              <Button
                key={p.id}
                type="button"
                variant={actual ? "default" : "secondary"}
                role="tab"
                aria-selected={actual}
                className={`salon-odoo__piso${actual ? " is-on" : ""}`}
                title={actual ? `${p.nombre} (piso actual)` : p.nombre}
                onClick={() => onPiso?.(p)}
              >
                {p.nombre}
              </Button>
            );
          })}
        </div>
        <div className="salon-odoo__pisos-der flex flex-wrap justify-start gap-2 sm:justify-end">
        <Button type="button" variant="outline" className="numeral min-w-11 text-lg font-bold" title="Elegir mesa por número (#)" onClick={abrirBuscar}>
          #
        </Button>
        {onToggleUltimos ? (
          <Button
            type="button"
            variant={mostrarUltimos ? "secondary" : "ghost"}
            title="Barra últimos pedidos"
            onClick={onToggleUltimos}
          >
            Últimos
          </Button>
        ) : null}
        {onToggleAtrasados ? (
          <Button
            type="button"
            variant={mostrarAtrasados ? "secondary" : "ghost"}
            title="Barra atrasados"
            onClick={onToggleAtrasados}
          >
            Atrasados
          </Button>
        ) : null}
        </div>
      </header>
      {asignando ? <p className="text-sm text-muted-foreground">Toque una mesa libre para sentar el pedido</p> : null}
      {buscando ? (
        <div className="buscar-mesa flex flex-wrap items-end gap-2 rounded-3xl border border-border bg-card p-3 shadow-sm" role="dialog" aria-label="Elegir mesa">
          <Label>
            Mesa
            <Input
              ref={inputRef}
              inputMode="numeric"
              autoFocus
              value={buffer}
              onChange={(e) => setBuffer(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && buffer) {
                  e.preventDefault();
                  abrirNumero(Number(buffer));
                }
              }}
            />
          </Label>
          <Button type="button" onClick={() => buffer && abrirNumero(Number(buffer))}>
            Abrir
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setBuscando(false);
              setBuffer("");
            }}
          >
            Cancelar
          </Button>
          {aviso ? <p role="alert">{aviso}</p> : null}
        </div>
      ) : null}
      <div
        className="plano-mapa"
        style={{
          backgroundColor: pisos?.find((p) => p.id === pisoId)?.fondo_color || undefined,
          backgroundImage: fondoUrl ? `url("${fondoUrl}")` : undefined,
          backgroundSize: "cover",
        }}
      >
        {mesasDelPiso.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`mesa-odoo mesa-odoo--${m.estado} mesa-odoo--${m.forma}`}
            style={{
              left: `${m.pos_x}%`,
              top: `${m.pos_y}%`,
              width: Math.max(m.ancho, 64),
              height: Math.max(m.alto, 64),
              backgroundColor: m.fondo_color || undefined,
              backgroundImage: m.fondo_data ? `url("${m.fondo_data}")` : undefined,
              backgroundSize: "cover",
            }}
            title={`Mesa ${m.numero}`}
            onClick={() => onMesa(m)}
          >
            <span className="mesa-odoo__num">Mesa {m.numero}</span>
            <span className="mesa-odoo__meta">{ETIQUETA[m.estado] ?? m.estado}</span>
          </button>
        ))}
      </div>
      {mostrarUltimos ? (
        <aside className="barra-pedidos">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Últimos</h2>
          <div className="barra-pedidos__lista flex gap-2 overflow-x-auto pb-1">
            {ultimos.map((p) => (
              <Button key={p.id} type="button" className={`chip-pedido espera-${p.nivel} text-white`} onClick={() => onPedido?.(p.id)}>
                {p.mesa ? `Mesa ${p.mesa}` : "Sin mesa"} · {p.hace}
              </Button>
            ))}
            {ultimos.length === 0 ? <p className="text-sm text-muted-foreground">Sin pedidos</p> : null}
          </div>
        </aside>
      ) : null}
      {mostrarAtrasados ? (
        <aside className="barra-pedidos">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Atrasados</h2>
          <div className="barra-pedidos__lista flex gap-2 overflow-x-auto pb-1">
            {atrasados.map((p) => (
              <Button key={p.id} type="button" className={`chip-pedido espera-${p.nivel} text-white`} onClick={() => onPedido?.(p.id)}>
                {p.mesa ? `Mesa ${p.mesa}` : "Sin mesa"} · {p.hace}
              </Button>
            ))}
            {atrasados.length === 0 ? <p className="text-sm text-muted-foreground">Sin pedidos</p> : null}
          </div>
        </aside>
      ) : null}
    </section>
  );
}
