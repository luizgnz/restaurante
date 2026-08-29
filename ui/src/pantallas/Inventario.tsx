import { Boxes, Clock3, Minus, PackageCheck, Plus, RefreshCw, Search, ShieldCheck, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Select } from "@/components/ui/select.tsx";

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
  onRegistrarPerdida: (productoId: number, cantidad: number, motivo: MotivoPerdidaInventario, pin: string) => Promise<void>;
};

type FiltroInventario = "todos" | "disponibles" | "sin-stock" | "con-reservas";
type TipoAjusteInventario = "entrada" | "perdida";
export type MotivoPerdidaInventario = "producto_danado" | "consumo_interno";

function cantidad(valor: number): string {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(valor);
}

function estado(material: MaterialInventarioUi): { texto: string; variante: "success" | "warning" | "danger" } {
  if (material.disponible <= 0) return { texto: "Sin stock", variante: "danger" };
  if (material.reservado > 0) return { texto: "Con reservas", variante: "warning" };
  return { texto: "Disponible", variante: "success" };
}

export function Inventario({
  materiales,
  puedeIngresar,
  onRecargar,
  onRegistrarEntrada,
  onRegistrarPerdida,
}: Props) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<FiltroInventario>("todos");
  const [seleccionado, setSeleccionado] = useState<MaterialInventarioUi | null>(null);
  const [entrada, setEntrada] = useState("");
  const [tipoAjuste, setTipoAjuste] = useState<TipoAjusteInventario>("entrada");
  const [motivoPerdida, setMotivoPerdida] = useState<MotivoPerdidaInventario>("producto_danado");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [recargando, setRecargando] = useState(false);

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase("es");
    return materiales.filter((material) => {
      if (filtro === "disponibles" && material.disponible <= 0) return false;
      if (filtro === "sin-stock" && material.disponible > 0) return false;
      if (filtro === "con-reservas" && material.reservado <= 0) return false;
      return !termino || material.nombre.toLocaleLowerCase("es").includes(termino) || material.codigo?.toLocaleLowerCase("es").includes(termino);
    });
  }, [busqueda, filtro, materiales]);

  const sinStock = materiales.filter((material) => material.disponible <= 0).length;
  const reservados = materiales.filter((material) => material.reservado > 0).length;

  async function recargar() {
    setRecargando(true);
    try {
      await onRecargar();
    } finally {
      setRecargando(false);
    }
  }

  const resumen = (
    <div
      className="inventario-resumen"
      role="group"
      aria-label="Filtrar por estado del inventario"
    >
      <Button type="button" size="sm" variant={filtro === "todos" ? "secondary" : "outline"} aria-pressed={filtro === "todos"} onClick={() => setFiltro("todos")}>
        <Boxes size={17} aria-hidden="true" /><div><strong>{materiales.length}</strong><span>Todos</span></div>
      </Button>
      <Button type="button" size="sm" variant={filtro === "disponibles" ? "secondary" : "outline"} aria-pressed={filtro === "disponibles"} onClick={() => setFiltro("disponibles")}>
        <PackageCheck size={17} aria-hidden="true" /><div><strong>{materiales.length - sinStock}</strong><span>Disponibles</span></div>
      </Button>
      <Button type="button" size="sm" variant={filtro === "sin-stock" ? "secondary" : "outline"} aria-pressed={filtro === "sin-stock"} onClick={() => setFiltro("sin-stock")}>
        <TriangleAlert size={17} aria-hidden="true" /><div><strong>{sinStock}</strong><span>Sin stock</span></div>
      </Button>
      <Button type="button" size="sm" variant={filtro === "con-reservas" ? "secondary" : "outline"} aria-pressed={filtro === "con-reservas"} onClick={() => setFiltro("con-reservas")}>
        <Clock3 size={17} aria-hidden="true" /><div><strong>{reservados}</strong><span>Reservado</span></div>
      </Button>
    </div>
  );

  const botonRecargar = (
    <Button
      type="button"
      variant="outline"
      size="icon"
      title="Volver a consultar el inventario"
      aria-label="Recargar inventario"
      disabled={recargando}
      onClick={recargar}
    >
      <RefreshCw size={18} className={recargando ? "is-spinning" : ""} aria-hidden="true" />
    </Button>
  );

  function abrirAjuste(material: MaterialInventarioUi) {
    setSeleccionado(material);
    setEntrada("");
    setTipoAjuste("entrada");
    setMotivoPerdida("producto_danado");
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
      if (tipoAjuste === "perdida") {
        await onRegistrarPerdida(seleccionado.id, valor, motivoPerdida, pin);
      } else {
        await onRegistrarEntrada(seleccionado.id, valor, pin);
      }
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
      </header>

      <Card className="inventario-panel">
        <div className="inventario-herramientas">
          <label className="inventario-busqueda">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Buscar material</span>
            <Input
              type="search"
              value={busqueda}
              placeholder="Buscar material o código"
              onChange={(event) => setBusqueda(event.target.value)}
            />
          </label>
          {resumen}
          {botonRecargar}
        </div>

        <div className="inventario-tabla" role="table" aria-label="Materiales disponibles">
          <div className="inventario-fila inventario-fila--cabecera" role="row">
            <span role="columnheader">Material</span>
            <span role="columnheader">En mano</span>
            <span role="columnheader">Reservado</span>
            <span role="columnheader">Disponible</span>
            <span role="columnheader">Estado</span>
          </div>
          {visibles.map((material) => {
            const estadoMaterial = estado(material);
            return (
              <div className="inventario-fila" role="row" key={material.id}>
                <span className="inventario-material" role="cell" data-label="Material">
                  {puedeIngresar ? (
                    <button
                      type="button"
                      className="inventario-material__accion"
                      aria-label={`Ajustar inventario de ${material.nombre}`}
                      onClick={() => abrirAjuste(material)}
                    >
                      <strong>{material.nombre}</strong>
                      {material.codigo ? <small>{material.codigo}</small> : null}
                    </button>
                  ) : (
                    <>
                      <strong>{material.nombre}</strong>
                      {material.codigo ? <small>{material.codigo}</small> : null}
                    </>
                  )}
                </span>
                <span role="cell" data-label="En mano">{cantidad(material.enMano)}</span>
                <span role="cell" data-label="Reservado">{cantidad(material.reservado)}</span>
                <strong role="cell" data-label="Disponible">{cantidad(material.disponible)}</strong>
                <span role="cell" data-label="Estado">
                  <Badge variant={estadoMaterial.variante}>
                    {estadoMaterial.texto === "Con reservas" ? "Reservado" : estadoMaterial.texto}
                  </Badge>
                </span>
              </div>
            );
          })}
          {visibles.length === 0 ? <div className="empty-state">No hay materiales que coincidan con el filtro.</div> : null}
        </div>
      </Card>

      <p className="inventario-seguridad">
        <ShieldCheck size={17} aria-hidden="true" />
        Todo el equipo puede consultar. Los ingresos y las pérdidas exigen autorización y quedan registrados.
      </p>

      {seleccionado ? (
        <div className="modal-fondo" role="presentation">
          <Card className="inventario-modal" role="dialog" aria-modal="true" aria-labelledby="ajuste-inventario-titulo">
            <span className="page-eyebrow">Movimiento de inventario</span>
            <h2 id="ajuste-inventario-titulo">Ajustar {seleccionado.nombre}</h2>
            <p>En mano actualmente: <strong>{cantidad(seleccionado.enMano)}</strong></p>
            <div className="inventario-ajuste__tipo" role="group" aria-label="Tipo de movimiento">
                <Button
                  type="button"
                  size="sm"
                  variant={tipoAjuste === "entrada" ? "secondary" : "outline"}
                  aria-pressed={tipoAjuste === "entrada"}
                  onClick={() => { setTipoAjuste("entrada"); setError(""); }}
                >
                  <Plus size={16} aria-hidden="true" /> Agregar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={tipoAjuste === "perdida" ? "secondary" : "outline"}
                  aria-pressed={tipoAjuste === "perdida"}
                  onClick={() => { setTipoAjuste("perdida"); setError(""); }}
                >
                  <Minus size={16} aria-hidden="true" /> Registrar pérdida
                </Button>
            </div>
            <label>
              {tipoAjuste === "perdida" ? "Cantidad perdida" : "Cantidad que ingresa"}
              <Input
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
            {tipoAjuste === "perdida" ? (
              <label>
                Motivo
                <Select value={motivoPerdida} onChange={(event) => setMotivoPerdida(event.target.value as MotivoPerdidaInventario)}>
                  <option value="producto_danado">Producto dañado</option>
                  <option value="consumo_interno">Consumo interno</option>
                </Select>
              </label>
            ) : null}
            <label>
              PIN de administrador
              <Input
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
              <Button
                type="button"
                variant={tipoAjuste === "perdida" ? "destructive" : "default"}
                disabled={guardando}
                onClick={registrar}
              >
                {guardando
                  ? "Registrando…"
                  : tipoAjuste === "perdida"
                    ? "Registrar pérdida"
                    : "Agregar al inventario"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </section>
  );
}
