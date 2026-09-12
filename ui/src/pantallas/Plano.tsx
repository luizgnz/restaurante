import { useEffect, useRef, useState, type CSSProperties } from "react";
import { interpretarTecla } from "../../../src/modules/salon/teclado.ts";
import type { NivelEspera } from "../../../src/modules/tiempo.ts";
import { textoEspera } from "../../../src/modules/tiempo.ts";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { etiquetaMesa, tonoMesa } from "../lib/estados.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";

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

export function alturaAutomaticaPlano(mesas: Mesa[], escala = 1, esMuestra = false): number {
  if (mesas.length === 0) return 240;

  const posicionesY = mesas.map((mesa) => mesa.pos_y).sort((a, b) => a - b);
  let filas = 0;
  let ultimaFila = Number.NEGATIVE_INFINITY;
  for (const posicionY of posicionesY) {
    if (posicionY - ultimaFila > 12) {
      filas += 1;
      ultimaFila = posicionY;
    }
  }

  const reservaInferior = esMuestra ? 64 : 40;
  const alturaPorFilas = 90 + filas * 140;
  const alturaPorExtremo = Math.max(...mesas.map((mesa) => {
    const altoMesa = Math.max(mesa.alto * escala, 64);
    const espacioRestante = Math.max(0.18, 1 - mesa.pos_y / 100);
    return Math.ceil((altoMesa + reservaInferior) / espacioRestante);
  }));

  return Math.min(672, Math.max(230, alturaPorFilas, alturaPorExtremo));
}

type Props = {
  vistaPrevia?: boolean;
  nuevaOrdenV2?: boolean;
  soloSalon?: boolean;
  piso: string;
  pisoId?: number | null;
  pisos?: Piso[];
  mesas: Mesa[];
  fondoUrl?: string | null;
  asignando?: boolean;
  bloqueado?: boolean;
  cargando?: boolean;
  esperaPorMesa?: Record<number, { espera: number; nivel: NivelEspera }>;
  onMesa: (mesa: Mesa) => void;
  onPiso?: (piso: Piso) => void;
  onNuevoPedido?: () => void;
  onBuscarMesa?: () => void;
  onOrdenes?: () => void;
};


export function Plano({
  vistaPrevia = false,
  nuevaOrdenV2 = false,
  soloSalon = false,
  piso,
  pisoId,
  pisos,
  mesas,
  fondoUrl,
  asignando,
  bloqueado,
  cargando,
  esperaPorMesa = {},
  onMesa,
  onPiso,
  onNuevoPedido,
  onBuscarMesa,
  onOrdenes,
}: Props) {
  const [buscando, setBuscando] = useState(false);
  const [buffer, setBuffer] = useState("");
  const [aviso, setAviso] = useState("");
  const [areaDemo, setAreaDemo] = useState<Piso | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mapaRef = useRef<HTMLDivElement>(null);
  const [anchoMapa, setAnchoMapa] = useState(1200);
  /* La escala responde al ancho, pero queda acotada para respetar la distancia
     vertical entre las posiciones guardadas de cada fila. */
  const escalaMesas = Math.min(1.05, Math.max(1, anchoMapa / 1050));

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
    if (bloqueado || areaDemo) return;
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
  }, [buffer, buscando, mesas, bloqueado, areaDemo]);

  useEffect(() => {
    if (!mapaRef.current) return;
    const observer = new ResizeObserver(([entry]) => setAnchoMapa(entry.contentRect.width));
    observer.observe(mapaRef.current);
    return () => observer.disconnect();
  }, [areaDemo, pisoId]);

  const listaPisos = pisos && pisos.length > 0 ? pisos : [{ id: pisoId ?? 0, nombre: piso }];
  const areas = vistaPrevia && !soloSalon
    ? [...listaPisos, { id: -1, nombre: "Terraza" }, { id: -2, nombre: "Barra" }]
    : listaPisos;
  const areaUnica = soloSalon || areas.length === 1;
  const areaActual = areaDemo ?? listaPisos.find((p) => p.id === pisoId) ?? listaPisos[0];
  const mesasEjemplo: Mesa[] = areaDemo ? Array.from({ length: areaDemo.id === -1 ? 4 : 3 }, (_, i) => ({
    id: -10 - i, numero: (areaDemo.id === -1 ? 11 : 15) + i,
    estado: "libre", cuentaId: null, asientos: areaDemo.id === -1 ? 4 : 2,
    pos_x: 12 + (i % 3) * 29, pos_y: 14 + Math.floor(i / 3) * 42,
    forma: areaDemo.id === -1 ? "round" : "square", ancho: 96, alto: 96,
  })) : [];
  const mesasDelPiso = areaDemo ? mesasEjemplo : mesas.filter((m) => pisoId == null || m.piso_id == null || m.piso_id === pisoId);
  const atrasada = (mesa: Mesa) => {
    const nivel = esperaPorMesa[mesa.id]?.nivel;
    return nivel === "alto" || nivel === "critico";
  };
  const mesasVisibles = mesasDelPiso;
  const alturaMapa = alturaAutomaticaPlano(mesasVisibles, escalaMesas, Boolean(areaDemo));

  return (
    <section className={`salon-odoo${areaUnica ? " salon-odoo--solo" : ""}`}>
      <header className="salon-odoo__cabecera">
        <h1 className={areaUnica ? "salon-odoo__titulo-area" : "sr-only"}>{areaUnica ? areaActual.nombre : "Mesas"}</h1>
        {onNuevoPedido && !areaDemo ? (
          <Button
            type="button"
            variant={nuevaOrdenV2 ? "outline" : "default"}
            className={`tactil salon-odoo__nueva${nuevaOrdenV2 ? " salon-odoo__nueva--v2" : ""}${areaUnica ? " salon-odoo__nueva--v3" : ""}`}
            aria-label="Nueva orden"
            title="Nueva orden (N)"
            onClick={onNuevoPedido}
          >
            <Plus size={18} aria-hidden="true" /><span>Nueva orden</span>
          </Button>
        ) : null}
        {!areaUnica ? <div className="salon-odoo__pisos-centro" role="tablist" aria-label="Áreas del restaurante"
          onKeyDown={(event) => {
            const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
            const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
              : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
            tabs[next]?.focus();
            tabs[next]?.click();
          }}
        >
          {areas.map((p) => {
            const actual = areaActual.id === p.id;
            return (
              <Button
                key={p.id}
                type="button"
                variant={actual ? "secondary" : "ghost"}
                role="tab"
                id={`area-${p.id}`}
                aria-controls="mesas-del-area"
                tabIndex={actual ? 0 : -1}
                aria-selected={actual}
                className={`salon-odoo__piso${actual ? " is-on" : ""} tactil`}
                title={actual ? `${p.nombre} (piso actual)` : p.nombre}
                onClick={() => {
                  setAreaDemo(p.id < 0 ? p : null);
                  if (p.id >= 0) onPiso?.(p);
                }}
              >
                {p.nombre}
              </Button>
            );
          })}
        </div> : null}
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
        key={areaActual.id}
        id="mesas-del-area"
        role="tabpanel"
        aria-label={areaUnica ? areaActual.nombre : undefined}
        aria-labelledby={areaUnica ? undefined : `area-${areaActual.id}`}
        tabIndex={0}
        ref={mapaRef}
        className={`plano-mapa plano-mapa--operativo${vistaPrevia ? " plano-mapa--auto" : ""}`}
        style={{
          backgroundColor: areaDemo ? undefined : pisos?.find((p) => p.id === pisoId)?.fondo_color || undefined,
          backgroundImage: !areaDemo && fondoUrl ? `url("${fondoUrl}")` : undefined,
          backgroundSize: "cover",
          "--plano-altura-auto": `${alturaMapa}px`,
        } as CSSProperties}
      >
        {areaDemo ? <p className="salon-odoo__ejemplo">Área de ejemplo · mesas de muestra</p> : null}
        {cargando && mesasDelPiso.length === 0 ? (
          <div className="flex flex-wrap content-start gap-6 p-6" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-[88px] w-[88px] rounded-2xl" />
            ))}
          </div>
        ) : (
          mesasVisibles.map((m) => (
          <Button
            key={m.id}
            type="button"
            variant="ghost"
            className={`mesa-odoo mesa-odoo--operativa mesa-odoo--${m.estado} mesa-odoo--${m.forma}${atrasada(m) ? " mesa-odoo--atrasada" : ""} tactil`}
            style={{
              left: `${m.pos_x}%`,
              top: `${m.pos_y}%`,
              width: Math.max(m.ancho * escalaMesas, 64),
              height: Math.max(m.alto * escalaMesas, 64),
              backgroundColor: m.fondo_color || undefined,
              backgroundImage: m.fondo_data ? `url("${m.fondo_data}")` : undefined,
              backgroundSize: "cover",
            }}
            title={`Mesa ${m.numero}`}
            disabled={Boolean(areaDemo)}
            onClick={() => onMesa(m)}
          >
            <span className="mesa-odoo__num">Mesa {m.numero}</span>
            <Badge
              className="mesa-odoo__meta"
              variant={tonoMesa(m.estado)}
            >
              {etiquetaMesa(m.estado)}
            </Badge>
            {atrasada(m) ? <span className="mesa-odoo__atraso">{textoEspera(esperaPorMesa[m.id]?.espera ?? 0)}</span> : null}
            <span className="mesa-odoo__asientos">{m.asientos} asientos</span>
          </Button>
          ))
        )}
        {!cargando && mesasVisibles.length === 0 ? <div className="empty-state">Aún no hay mesas en esta área.</div> : null}
      </div>
    </section>
  );
}
