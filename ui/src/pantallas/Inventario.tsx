import { Boxes, Clock3, PackageCheck, RefreshCw, Search, ShieldCheck, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";

export type MaterialInventarioUi = {
  id: number;
  nombre: string;
  codigo: string | null;
  enMano: number;
  reservado: number;
  disponible: number;
  ultimaEntradaEn: string | null;
};

type Props = {
  materiales: MaterialInventarioUi[];
  puedeIngresar: boolean;
  onRecargar: () => Promise<void>;
  onRegistrarEntrada: (productoId: number, cantidad: number, pin: string) => Promise<void>;
};

function cantidad(valor: number): string {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(valor);
}

function estado(material: MaterialInventarioUi): { texto: string; variante: "success" | "warning" | "danger" } {
  if (material.disponible <= 0) return { texto: "Sin stock", variante: "danger" };
  if (material.reservado > 0) return { texto: "Con reservas", variante: "warning" };
  return { texto: "Disponible", variante: "success" };
}

export function Inventario({ materiales, puedeIngresar, onRecargar, onRegistrarEntrada }: Props) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "disponibles" | "sin-stock">("todos");
  const [seleccionado, setSeleccionado] = useState<MaterialInventarioUi | null>(null);
  const [entrada, setEntrada] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [recargando, setRecargando] = useState(false);

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase("es");
    return materiales.filter((material) => {
      if (filtro === "disponibles" && material.disponible <= 0) return false;
      if (filtro === "sin-stock" && material.disponible > 0) return false;
      return !termino || material.nombre.toLocaleLowerCase("es").includes(termino) || material.codigo?.toLocaleLowerCase("es").includes(termino);
    });
  }, [busqueda, filtro, materiales]);

  const sinStock = materiales.filter((material) => material.disponible <= 0).length;
  const reservados = materiales.filter((material) => material.reservado > 0).length;

  function abrirEntrada(material: MaterialInventarioUi) {
    setSeleccionado(material);
    setEntrada("");
    setPin("");
    setError("");
  }

  async function registrar() {
    if (!seleccionado || guardando) return;
    const valor = Number(entrada);
    if (!Number.isFinite(valor) || valor <= 0) {
      setError("Ingresa una cantidad mayor que cero.");
      return;
    }
    if (!pin.trim()) {
      setError("Ingresa el PIN de administrador.");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      await onRegistrarEntrada(seleccionado.id, valor, pin);
      setSeleccionado(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="page-shell inventario-page">
      <header className="page-header">
        <div>
          <span className="page-eyebrow">Control de materiales</span>
          <h1>Inventario</h1>
          <p>Existencias en mano, reservas de órdenes y cantidad realmente disponible.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={recargando}
          onClick={async () => {
            setRecargando(true);
            try {
              await onRecargar();
            } finally {
              setRecargando(false);
            }
          }}
        >
          <RefreshCw size={18} className={recargando ? "is-spinning" : ""} aria-hidden="true" />
          Actualizar
        </Button>
      </header>

      <div className="inventario-resumen" aria-label="Resumen del inventario">
        <Card>
          <Boxes size={20} aria-hidden="true" />
          <div><strong>{materiales.length}</strong><span>materiales</span></div>
        </Card>
        <Card>
          <PackageCheck size={20} aria-hidden="true" />
          <div><strong>{materiales.length - sinStock}</strong><span>disponibles</span></div>
        </Card>
        <Card className={sinStock ? "is-alert" : ""}>
          <TriangleAlert size={20} aria-hidden="true" />
          <div><strong>{sinStock}</strong><span>sin stock</span></div>
        </Card>
        <Card>
          <Clock3 size={20} aria-hidden="true" />
          <div><strong>{reservados}</strong><span>con reservas</span></div>
        </Card>
      </div>

      <Card className="inventario-panel">
        <div className="inventario-herramientas">
          <label className="inventario-busqueda">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Buscar material</span>
            <input
              type="search"
              value={busqueda}
              placeholder="Buscar material o código"
              onChange={(event) => setBusqueda(event.target.value)}
            />
          </label>
          <div className="inventario-filtros" role="group" aria-label="Filtrar inventario">
            {(["todos", "disponibles", "sin-stock"] as const).map((opcion) => (
              <Button
                key={opcion}
                type="button"
                size="sm"
                variant={filtro === opcion ? "secondary" : "ghost"}
                onClick={() => setFiltro(opcion)}
              >
                {opcion === "todos" ? "Todos" : opcion === "disponibles" ? "Disponibles" : "Sin stock"}
              </Button>
            ))}
          </div>
        </div>

        <div className="inventario-tabla" role="table" aria-label="Materiales disponibles">
          <div className="inventario-fila inventario-fila--cabecera" role="row">
            <span role="columnheader">Material</span>
            <span role="columnheader">En mano</span>
            <span role="columnheader">Reservado</span>
            <span role="columnheader">Disponible</span>
            <span role="columnheader">Estado</span>
            <span role="columnheader">Acción</span>
          </div>
          {visibles.map((material) => {
            const estadoMaterial = estado(material);
            return (
              <div className="inventario-fila" role="row" key={material.id}>
                <span className="inventario-material" role="cell" data-label="Material">
                  <strong>{material.nombre}</strong>
                  {material.codigo ? <small>{material.codigo}</small> : null}
                </span>
                <span role="cell" data-label="En mano">{cantidad(material.enMano)}</span>
                <span role="cell" data-label="Reservado">{cantidad(material.reservado)}</span>
                <strong role="cell" data-label="Disponible">{cantidad(material.disponible)}</strong>
                <span role="cell" data-label="Estado"><Badge variant={estadoMaterial.variante}>{estadoMaterial.texto}</Badge></span>
                <span role="cell" data-label="Acción">
                  {puedeIngresar ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => abrirEntrada(material)}>
                      Ingresar
                    </Button>
                  ) : <span className="inventario-solo-lectura">Solo lectura</span>}
                </span>
              </div>
            );
          })}
          {visibles.length === 0 ? <div className="empty-state">No hay materiales que coincidan con el filtro.</div> : null}
        </div>
      </Card>

      <p className="inventario-seguridad">
        <ShieldCheck size={17} aria-hidden="true" />
        Todo el equipo puede consultar. Cada entrada exige el PIN de un administrador y queda registrada.
      </p>

      {seleccionado ? (
        <div className="modal-fondo" role="presentation">
          <Card className="inventario-modal" role="dialog" aria-modal="true" aria-labelledby="entrada-inventario-titulo">
            <span className="page-eyebrow">Entrada protegida</span>
            <h2 id="entrada-inventario-titulo">Ingresar {seleccionado.nombre}</h2>
            <p>En mano actualmente: <strong>{cantidad(seleccionado.enMano)}</strong></p>
            <label>
              Cantidad que ingresa
              <input
                autoFocus
                type="number"
                min="0.01"
                max="1000000"
                step="0.01"
                inputMode="decimal"
                value={entrada}
                onChange={(event) => setEntrada(event.target.value)}
              />
            </label>
            <label>
              PIN de administrador
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))}
              />
            </label>
            {error ? <p className="inventario-modal__error" role="alert">{error}</p> : null}
            <div className="inventario-modal__acciones">
              <Button type="button" variant="outline" onClick={() => setSeleccionado(null)}>Cancelar</Button>
              <Button type="button" disabled={guardando} onClick={registrar}>
                {guardando ? "Registrando…" : "Registrar entrada"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </section>
  );
}
