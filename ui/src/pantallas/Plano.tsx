import { useEffect, useRef, useState } from "react";
import { interpretarTecla } from "../../../src/modules/salon/teclado.ts";
import type { NivelEspera } from "../../../src/modules/tiempo.ts";
import { Clock3, Plus, Search, Table2 } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";

export type Mesa = {
  id: number;
  numero: number;
  estado: string;
  cuentaId: number | null;
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
  uiVersion?: "actual" | "nueva";
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
  uiVersion = "actual",
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
  const mapaRef = useRef<HTMLDivElement>(null);
  const [anchoMapa, setAnchoMapa] = useState(1200);

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

  useEffect(() => {
    if (uiVersion !== "nueva" || !mapaRef.current) return;
    const observer = new ResizeObserver(([entry]) => setAnchoMapa(entry.contentRect.width));
    observer.observe(mapaRef.current);
    return () => observer.disconnect();
  }, [uiVersion]);

  const listaPisos = pisos && pisos.length > 0 ? pisos : [{ id: pisoId ?? 0, nombre: piso }];
  const mesasDelPiso = mesas.filter((m) => pisoId == null || m.piso_id == null || m.piso_id === pisoId);
  const libres = mesasDelPiso.filter((mesa) => mesa.estado === "libre").length;
  const ocupadas = mesasDelPiso.length - libres;

  return (
    <section className="salon-odoo">
      <div className="salon-odoo__resumen">
        <div>
          <span className="salon-odoo__eyebrow">Servicio de mesas</span>
          <h1>{piso}</h1>
          <p>Selecciona una mesa para comenzar o continuar el servicio.</p>
        </div>
        <div className="salon-odoo__metricas" aria-label="Resumen del salón">
          <div><Table2 size={19} aria-hidden="true" /><strong>{libres}</strong><span>libres</span></div>
          <div><Clock3 size={19} aria-hidden="true" /><strong>{ocupadas}</strong><span>en servicio</span></div>
        </div>
      </div>
      <header className="salon-odoo__pisos">
        <div className="salon-odoo__pisos-izq">
          {onNuevoPedido ? (
            <Button type="button" size="lg" className="tactil salon-odoo__nueva" aria-label="Nueva orden" title="Nueva orden (N)" onClick={onNuevoPedido}>
              <Plus size={20} aria-hidden="true" /><span>Nueva orden</span>
            </Button>
          ) : null}
        </div>
        <div className="salon-odoo__pisos-centro" role="tablist" aria-label="Pisos">
          {listaPisos.map((p) => {
            const actual = (pisoId != null && p.id === pisoId) || (pisoId == null && p.nombre === piso);
            return (
              <Button
                key={p.id}
                type="button"
                variant={actual ? "secondary" : "ghost"}
                role="tab"
                aria-selected={actual}
                className={`salon-odoo__piso${actual ? " is-on" : ""} tactil`}
                title={actual ? `${p.nombre} (piso actual)` : p.nombre}
                onClick={() => onPiso?.(p)}
              >
                {p.nombre}
              </Button>
            );
          })}
        </div>
        <div className="salon-odoo__pisos-der">
        {uiVersion === "actual" ? (
          <Button type="button" variant="outline" size="icon" className="tactil numeral" title="Elegir mesa por número (#)" onClick={abrirBuscar}>
            <Search size={21} aria-hidden="true" /><span className="sr-only">#</span>
          </Button>
        ) : null}
        {onToggleUltimos ? (
          <Button
            type="button"
            variant={mostrarUltimos ? "secondary" : "ghost"}
            className={`tactil ${mostrarUltimos ? "is-on" : ""}`}
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
            className={`tactil ${mostrarAtrasados ? "is-on" : ""}`}
            title="Barra atrasados"
            onClick={onToggleAtrasados}
          >
            Atrasados
          </Button>
        ) : null}
        </div>
      </header>
      {asignando ? <p>Toque una mesa libre para sentar el pedido</p> : null}
      {buscando ? (
        <div className="buscar-mesa" role="dialog" aria-label="Elegir mesa">
          <label>
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
          </label>
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
        ref={mapaRef}
        className="plano-mapa"
        style={{
          backgroundColor: pisos?.find((p) => p.id === pisoId)?.fondo_color || undefined,
          backgroundImage: fondoUrl ? `url("${fondoUrl}")` : undefined,
          backgroundSize: "cover",
        }}
      >
        {mesasDelPiso.map((m) => (
          <Button
            key={m.id}
            type="button"
            variant="ghost"
            className={`mesa-odoo mesa-odoo--${m.estado} mesa-odoo--${m.forma} tactil`}
            style={{
              left: `${m.pos_x}%`,
              top: `${m.pos_y}%`,
              width: Math.max(m.ancho * (uiVersion === "nueva" ? Math.min(1.2, Math.max(0.72, anchoMapa / 1200)) : 1), 64),
              height: Math.max(m.alto * (uiVersion === "nueva" ? Math.min(1.2, Math.max(0.72, anchoMapa / 1200)) : 1), 64),
              backgroundColor: m.fondo_color || undefined,
              backgroundImage: m.fondo_data ? `url("${m.fondo_data}")` : undefined,
              backgroundSize: "cover",
            }}
            title={`Mesa ${m.numero}`}
            onClick={() => onMesa(m)}
          >
            <span className="mesa-odoo__num">Mesa {m.numero}</span>
            <Badge
              className="mesa-odoo__meta"
              variant={m.estado === "libre" ? "success" : m.estado === "precuenta" ? "warning" : "default"}
            >
              {ETIQUETA[m.estado] ?? m.estado}
            </Badge>
            <span className="mesa-odoo__asientos">{m.asientos} asientos</span>
          </Button>
        ))}
      </div>
      {mostrarUltimos ? (
        <aside className="barra-pedidos">
          <h2>Últimos</h2>
          <div className="barra-pedidos__lista">
            {ultimos.map((p) => (
              <Button key={p.id} type="button" variant="outline" className={`chip-pedido espera-${p.nivel} tactil`} onClick={() => onPedido?.(p.id)}>
                {p.mesa ? `Mesa ${p.mesa}` : "Sin mesa"} · {p.hace}
              </Button>
            ))}
            {ultimos.length === 0 ? <p>Sin pedidos</p> : null}
          </div>
        </aside>
      ) : null}
      {mostrarAtrasados ? (
        <aside className="barra-pedidos">
          <h2>Atrasados</h2>
          <div className="barra-pedidos__lista">
            {atrasados.map((p) => (
              <Button key={p.id} type="button" variant="outline" className={`chip-pedido espera-${p.nivel} tactil`} onClick={() => onPedido?.(p.id)}>
                {p.mesa ? `Mesa ${p.mesa}` : "Sin mesa"} · {p.hace}
              </Button>
            ))}
            {atrasados.length === 0 ? <p>Sin pedidos</p> : null}
          </div>
        </aside>
      ) : null}
    </section>
  );
}
