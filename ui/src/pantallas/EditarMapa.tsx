import { useMemo, useState, type PointerEvent, type ReactNode } from "react";
import {
  Circle,
  Copy,
  CopyPlus,
  Hash,
  Image as Imagen,
  ImageOff,
  Layers,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Palette,
  Plus,
  Square,
  Trash2,
  Type,
  Users,
} from "lucide-react";
import { MESA_LADO, ordenarMesas } from "../../../src/modules/salon/orden.ts";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import type { Mesa, Piso } from "./Plano.tsx";

type MesaDraft = Mesa & { _nuevo?: boolean };
type PisoDraft = Piso;

type Props = {
  pisos: Piso[];
  mesas: Mesa[];
  onGuardar: (payload: {
    pisos: { id?: number; nombre: string; mesas: MesaDraft[]; fondo_color?: string | null; fondo_data?: string | null; fondo_quitar_imagen?: boolean }[];
    quitarMesaIds: number[];
    quitarPisoIds: number[];
  }) => void;
  onDescartar: () => void;
};

function Boton({
  icono,
  children,
  onClick,
  peligro,
}: {
  icono: ReactNode;
  children: string;
  onClick: () => void;
  peligro?: boolean;
}) {
  return (
    <Button
      type="button"
      variant={peligro ? "destructive" : "secondary"}
      className={`boton-herramienta${peligro ? " peligro" : ""}`}
      title={children}
      aria-label={children}
      onClick={onClick}
    >
      {icono}
    </Button>
  );
}

function Campo({
  icono,
  titulo,
  children,
}: {
  icono: ReactNode;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <label className="editor-campo" title={titulo} aria-label={titulo}>
      {icono}
      {children}
    </label>
  );
}
function SubirImagen({ children, onImagen }: { children: string; onImagen: (dataUrl: string) => void }) {
  return (
    <label className="boton-herramienta inline-flex size-10 items-center justify-center rounded-full border border-border bg-secondary" title={children} aria-label={children}>
      <Imagen size={20} aria-hidden="true" />
      <input
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => onImagen(String(r.result));
          r.readAsDataURL(f);
        }}
      />
    </label>
  );
}

export function EditarMapa({ pisos: pisosIni, mesas: mesasIni, onGuardar, onDescartar }: Props) {
  const [pisos, setPisos] = useState<PisoDraft[]>(() => (pisosIni.length ? pisosIni.map((p) => ({ ...p })) : [{ id: 0, nombre: "Salón" }]));
  const [mesas, setMesas] = useState<MesaDraft[]>(() => mesasIni.map((m) => ({ ...m })));
  const [quitar, setQuitar] = useState<number[]>([]);
  const [quitarPisos, setQuitarPisos] = useState<number[]>([]);
  const [pisoId, setPisoId] = useState<number>(pisosIni[0]?.id ?? 0);
  const [sel, setSel] = useState<number | null>(null);
  const [arrastre, setArrastre] = useState<{ id: number; dx: number; dy: number } | null>(null);
  const [aviso, setAviso] = useState("");

  const piso = pisos.find((p) => p.id === pisoId);
  const visibles = useMemo(
    () => mesas.filter((m) => (m.piso_id ?? pisos[0]?.id) === pisoId && !quitar.includes(m.id)),
    [mesas, pisoId, pisos, quitar],
  );
  const seleccion = mesas.find((m) => m.id === sel && !quitar.includes(m.id));

  function patchPiso(patch: Partial<PisoDraft>) {
    setPisos((prev) => prev.map((p) => (p.id === pisoId ? { ...p, ...patch } : p)));
  }
  function patchMesa(id: number, patch: Partial<MesaDraft>) {
    setMesas((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }
  function siguienteNumero(extra: number[] = []) {
    const n = [...mesas.filter((m) => !quitar.includes(m.id)).map((m) => m.numero), ...extra];
    return (n.length ? Math.max(...n) : 0) + 1;
  }

  function nombrePisoLibre(base: string) {
    const usados = new Set(pisos.map((p) => p.nombre.trim().toLocaleLowerCase("es")));
    if (!usados.has(base.trim().toLocaleLowerCase("es"))) return base;
    let i = 2;
    while (usados.has(`${base} ${i}`.toLocaleLowerCase("es"))) i += 1;
    return `${base} ${i}`;
  }

  function avisoUnicidad(): string | null {
    const nombres = new Map<string, string>();
    for (const p of pisos) {
      const nombre = p.nombre.trim();
      if (!nombre) return "Cada piso necesita un nombre";
      const clave = nombre.toLocaleLowerCase("es");
      const previo = nombres.get(clave);
      if (previo) return `Ya hay un piso llamado ${previo}`;
      nombres.set(clave, nombre);
    }
    const numeros = new Set<number>();
    for (const m of mesas.filter((x) => !quitar.includes(x.id))) {
      const n = Math.max(1, Math.floor(m.numero));
      if (numeros.has(n)) return `Ya hay una mesa ${n}`;
      numeros.add(n);
    }
    return null;
  }
  function siguienteId() {
    return -Date.now() - Math.floor(Math.random() * 1000);
  }

  function addMesa() {
    const id = siguienteId();
    setMesas((prev) => [
      ...prev,
      {
        id,
        numero: siguienteNumero(),
        estado: "libre",
        pedidoId: null,
        asientos: 4,
        pos_x: 40,
        pos_y: 40,
        forma: "square",
        ancho: MESA_LADO,
        alto: MESA_LADO,
        piso_id: pisoId,
        _nuevo: true,
      },
    ]);
    setSel(id);
    setAviso("");
  }

  function addPiso() {
    const id = siguienteId();
    setPisos((p) => [...p, { id, nombre: nombrePisoLibre(`Piso ${pisos.length + 1}`) }]);
    setPisoId(id);
    setSel(null);
    setAviso("");
  }

  function duplicarPiso() {
    if (!piso) return;
    const id = siguienteId();
    const nombre = nombrePisoLibre(`${piso.nombre} (copia)`);
    const origen = mesas.filter((m) => m.piso_id === pisoId && !quitar.includes(m.id));
    const asignados: number[] = [];
    setPisos((p) => [...p, { ...piso, id, nombre, tiene_fondo: 0 }]);
    setMesas((prev) => [
      ...prev,
      ...origen.map((m) => {
        const numero = siguienteNumero(asignados);
        asignados.push(numero);
        return { ...m, id: siguienteId(), numero, piso_id: id, pos_x: Math.min(88, m.pos_x + 3), _nuevo: true };
      }),
    ]);
    setPisoId(id);
    setSel(null);
    setAviso("");
  }

  function eliminarPiso() {
    if (pisos.length <= 1) {
      setAviso("Tiene que quedar al menos un piso");
      return;
    }
    const resto = pisos.filter((p) => p.id !== pisoId);
    if (pisoId > 0) setQuitarPisos((q) => [...q, pisoId]);
    setQuitar((q) => [...q, ...mesas.filter((m) => m.piso_id === pisoId && m.id > 0).map((m) => m.id)]);
    setMesas((prev) => prev.filter((m) => m.piso_id !== pisoId));
    setPisos(resto);
    setPisoId(resto[0].id);
    setSel(null);
    setAviso("");
  }

  function duplicarMesa(m: MesaDraft) {
    const id = siguienteId();
    setMesas((prev) => [
      ...prev,
      {
        ...m,
        id,
        numero: siguienteNumero(),
        pos_x: Math.min(88, m.pos_x + 6),
        pos_y: Math.min(88, m.pos_y + 6),
        pedidoId: null,
        estado: "libre",
        _nuevo: true,
      },
    ]);
    setSel(id);
    setAviso("");
  }

  function eliminarMesa(m: MesaDraft) {
    if (m._nuevo || m.id < 0) setMesas((prev) => prev.filter((x) => x.id !== m.id));
    else setQuitar((q) => [...q, m.id]);
    setSel(null);
    setAviso("");
  }

  function ordenarPiso() {
    const ordenadas = new Map(ordenarMesas(visibles).map((m) => [m.id, m]));
    setMesas((prev) =>
      prev.map((m) => {
        const o = ordenadas.get(m.id);
        return o ? { ...m, pos_x: o.pos_x, pos_y: o.pos_y, forma: o.forma, ancho: o.ancho, alto: o.alto } : m;
      }),
    );
    setSel(null);
    setAviso("");
  }

  function redimensionar(m: MesaDraft, paso: number) {
    patchMesa(m.id, {
      ancho: Math.min(220, Math.max(64, m.ancho + paso)),
      alto: Math.min(220, Math.max(64, m.alto + paso)),
    });
  }

  function pointerDown(m: MesaDraft, e: PointerEvent<HTMLButtonElement>) {
    const mapa = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    setSel(m.id);
    setArrastre({
      id: m.id,
      dx: ((e.clientX - mapa.left) / mapa.width) * 100 - m.pos_x,
      dy: ((e.clientY - mapa.top) / mapa.height) * 100 - m.pos_y,
    });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function pointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!arrastre) return;
    const mapa = e.currentTarget.getBoundingClientRect();
    const x = Math.min(90, Math.max(0, ((e.clientX - mapa.left) / mapa.width) * 100 - arrastre.dx));
    const y = Math.min(90, Math.max(0, ((e.clientY - mapa.top) / mapa.height) * 100 - arrastre.dy));
    setMesas((prev) => prev.map((m) => (m.id === arrastre.id ? { ...m, pos_x: x, pos_y: y } : m)));
  }

  const fondoPiso =
    piso?.fondo_data ||
    (piso?.id && piso.id > 0 && piso.tiene_fondo && !piso.fondo_quitar_imagen ? `/api/pisos/${piso.id}/fondo` : undefined);

  return (
    <section className="salon-odoo flex min-h-[70vh] flex-1 flex-col gap-3">
      <header className="salon-odoo__pisos grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div className="salon-odoo__pisos-izq" />
        <div className="salon-odoo__pisos-centro flex flex-wrap justify-start gap-2 sm:justify-center" role="tablist" aria-label="Pisos">
          {pisos.map((p) => (
            <Button
              key={p.id}
              type="button"
              variant={p.id === pisoId ? "default" : "secondary"}
              role="tab"
              aria-selected={p.id === pisoId}
              className={`salon-odoo__piso${p.id === pisoId ? " is-on" : ""}`}
              onClick={() => {
                setPisoId(p.id);
                setSel(null);
              }}
            >
              {p.nombre}
            </Button>
          ))}
        </div>
        <div className="salon-odoo__pisos-der flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onDescartar}>
            Descartar
          </Button>
          <Button
            type="button"
            onClick={() => {
              const msg = avisoUnicidad();
              if (msg) {
                setAviso(msg);
                return;
              }
              setAviso("");
              onGuardar({
                pisos: pisos.map((p) => ({
                  id: p.id > 0 ? p.id : undefined,
                  nombre: p.nombre,
                  fondo_color: p.fondo_color ?? null,
                  fondo_data: p.fondo_data,
                  fondo_quitar_imagen: p.fondo_quitar_imagen,
                  mesas: mesas.filter((m) => m.piso_id === p.id && !quitar.includes(m.id)),
                })),
                quitarMesaIds: quitar.filter((id) => id > 0),
                quitarPisoIds: quitarPisos.filter((id) => id > 0),
              });
            }}
          >
            Guardar
          </Button>
        </div>
      </header>
      {aviso ? <p role="alert">{aviso}</p> : null}

      <div className="editor-grupos grid gap-3 lg:grid-cols-2">
        <fieldset className="editor-grupo flex flex-wrap items-end gap-2 rounded-3xl border border-border bg-card p-3 shadow-sm" disabled={Boolean(seleccion)}>
          <legend>Opciones de piso</legend>
          <Campo icono={<Type size={20} aria-hidden="true" />} titulo="Nombre del piso">
            <Input
              className="editor-campo__nombre"
              size={16}
              maxLength={24}
              value={piso?.nombre ?? ""}
              onChange={(e) => patchPiso({ nombre: e.target.value })}
            />
          </Campo>
          <Campo icono={<Palette size={20} aria-hidden="true" />} titulo="Color de fondo del piso">
            <Input
              className="editor-campo__color"
              type="color"
              value={piso?.fondo_color || "#5c584c"}
              onChange={(e) => patchPiso({ fondo_color: e.target.value })}
            />
          </Campo>
          <Boton icono={<Plus size={20} aria-hidden="true" />} onClick={addMesa}>
            Nueva mesa
          </Boton>
          <Boton icono={<Layers size={20} aria-hidden="true" />} onClick={addPiso}>
            Nuevo piso
          </Boton>
          <Boton icono={<LayoutGrid size={20} aria-hidden="true" />} onClick={ordenarPiso}>
            Ordenar mesas en cuadrícula
          </Boton>
          <SubirImagen onImagen={(url) => patchPiso({ fondo_data: url, fondo_quitar_imagen: false, tiene_fondo: 1 })}>
            Imagen de fondo
          </SubirImagen>
          <Boton
            icono={<ImageOff size={20} aria-hidden="true" />}
            onClick={() => patchPiso({ fondo_data: undefined, fondo_quitar_imagen: true, tiene_fondo: 0 })}
          >
            Quitar imagen
          </Boton>
          <Boton icono={<CopyPlus size={20} aria-hidden="true" />} onClick={duplicarPiso}>
            Duplicar piso
          </Boton>
          <Boton icono={<Trash2 size={20} aria-hidden="true" />} onClick={eliminarPiso} peligro>
            Eliminar piso
          </Boton>
        </fieldset>

        <fieldset className="editor-grupo flex flex-wrap items-end gap-2 rounded-3xl border border-border bg-card p-3 shadow-sm" disabled={!seleccion}>
          <legend>Opciones de mesa</legend>
          <Campo icono={<Hash size={20} aria-hidden="true" />} titulo="Número de mesa">
            <Input
              className="editor-campo__numero"
              inputMode="numeric"
              size={3}
              maxLength={3}
              value={seleccion?.numero ?? ""}
              onChange={(e) => seleccion && patchMesa(seleccion.id, { numero: Number(e.target.value) || 1 })}
            />
          </Campo>
          <Campo icono={<Users size={20} aria-hidden="true" />} titulo="Clientes">
            <Input
              className="editor-campo__clientes"
              inputMode="numeric"
              size={2}
              maxLength={2}
              value={seleccion?.asientos ?? ""}
              onChange={(e) => seleccion && patchMesa(seleccion.id, { asientos: Number(e.target.value) || 1 })}
            />
          </Campo>
          <Campo icono={<Palette size={20} aria-hidden="true" />} titulo="Color de la mesa">
            <Input
              className="editor-campo__color"
              type="color"
              value={seleccion?.fondo_color || "#ece7dc"}
              onChange={(e) => seleccion && patchMesa(seleccion.id, { fondo_color: e.target.value })}
            />
          </Campo>
          <Boton icono={<Minimize2 size={20} aria-hidden="true" />} onClick={() => seleccion && redimensionar(seleccion, -16)}>
            Reducir
          </Boton>
          <Boton icono={<Maximize2 size={20} aria-hidden="true" />} onClick={() => seleccion && redimensionar(seleccion, 16)}>
            Agrandar
          </Boton>
          {seleccion?.forma === "round" ? (
            <Boton icono={<Square size={20} aria-hidden="true" />} onClick={() => patchMesa(seleccion.id, { forma: "square" })}>
              Forma cuadrada
            </Boton>
          ) : seleccion ? (
            <Boton icono={<Circle size={20} aria-hidden="true" />} onClick={() => patchMesa(seleccion.id, { forma: "round" })}>
              Forma redonda
            </Boton>
          ) : null}
          <SubirImagen onImagen={(url) => seleccion && patchMesa(seleccion.id, { fondo_data: url })}>Imagen de mesa</SubirImagen>
          <Boton
            icono={<ImageOff size={20} aria-hidden="true" />}
            onClick={() => seleccion && patchMesa(seleccion.id, { fondo_data: null })}
          >
            Quitar imagen
          </Boton>
          <Boton icono={<Copy size={20} aria-hidden="true" />} onClick={() => seleccion && duplicarMesa(seleccion)}>
            Duplicar mesa
          </Boton>
          <Boton icono={<Trash2 size={20} aria-hidden="true" />} onClick={() => seleccion && eliminarMesa(seleccion)} peligro>
            Eliminar mesa
          </Boton>
        </fieldset>
      </div>

      <div
        className="plano-mapa"
        style={{
          backgroundColor: piso?.fondo_color || undefined,
          backgroundImage: fondoPiso ? `url("${fondoPiso}")` : undefined,
          backgroundSize: "cover",
        }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) setSel(null);
        }}
        onPointerMove={pointerMove}
        onPointerUp={() => setArrastre(null)}
      >
        {visibles.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`mesa-odoo mesa-odoo--${m.forma} mesa-odoo--libre ${sel === m.id ? "is-on" : ""}`}
            style={{
              left: `${m.pos_x}%`,
              top: `${m.pos_y}%`,
              width: m.ancho,
              height: m.alto,
              backgroundColor: m.fondo_color || undefined,
              backgroundImage: m.fondo_data ? `url("${m.fondo_data}")` : undefined,
              backgroundSize: "cover",
            }}
            onPointerDown={(e) => pointerDown(m, e)}
          >
            <span className="mesa-odoo__num">Mesa {m.numero}</span>
            <span className="mesa-odoo__meta">{m.asientos} asientos</span>
          </button>
        ))}
      </div>
    </section>
  );
}
