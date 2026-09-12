import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  Gauge,
  LockKeyhole,
  Clock3,
  Minus,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  TriangleAlert,
  Warehouse,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alerta } from "@/components/ui/alerta.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Dialog, DialogContent } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Select } from "@/components/ui/select.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

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
  cargando?: boolean;
  puedeIngresar: boolean;
  onRecargar: () => Promise<void>;
  onRegistrarEntrada: (productoId: number, cantidad: number, pin: string) => Promise<void>;
  onRegistrarPerdida: (productoId: number, cantidad: number, motivo: MotivoPerdidaInventario, pin: string) => Promise<void>;
};

type FiltroInventario = "todos" | "disponibles" | "sin-stock" | "con-reservas";
type TipoAjusteInventario = "entrada" | "perdida";
export type ColumnaOrdenInventario = "nombre" | "enMano" | "reservado" | "disponible" | "estado";
export type OrdenInventario = { columna: ColumnaOrdenInventario; direccion: "asc" | "desc" };
export type MotivoPerdidaInventario = "producto_danado" | "consumo_interno";

function cantidad(valor: number): string {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(valor);
}

export function presentarUnidadMaterial(nombre: string): { nombre: string; unidad: "Grs." | "kg" | "Uds." } {
  const coincidencia = nombre.trim().match(/^(.*?)\s+(g|gr|grs\.?|kg|ud|uds\.?)$/i);
  if (!coincidencia) return { nombre: nombre.trim(), unidad: "Uds." };

  const [, nombreBase, sufijo] = coincidencia;
  const unidad = sufijo.toLocaleLowerCase("es").startsWith("k")
    ? "kg"
    : sufijo.toLocaleLowerCase("es").startsWith("g")
      ? "Grs."
      : "Uds.";
  return { nombre: nombreBase.trim(), unidad };
}

export function estadoInventario(material: MaterialInventarioUi): {
  texto: "Sin stock" | "Poco stock" | "Disponible";
  variante: "success" | "warning" | "danger";
  prioridad: number;
} {
  if (material.disponible <= 0) return { texto: "Sin stock", variante: "danger", prioridad: 0 };
  const umbralPocoStock = Math.max(2, material.enMano * 0.2);
  if (material.disponible <= umbralPocoStock) return { texto: "Poco stock", variante: "warning", prioridad: 1 };
  return { texto: "Disponible", variante: "success", prioridad: 2 };
}

export function ordenarMateriales(materiales: MaterialInventarioUi[], orden: OrdenInventario): MaterialInventarioUi[] {
  const factor = orden.direccion === "asc" ? 1 : -1;
  return [...materiales].sort((a, b) => {
    let comparacion = 0;
    if (orden.columna === "nombre") comparacion = a.nombre.localeCompare(b.nombre, "es");
    else if (orden.columna === "estado") {
      comparacion = estadoInventario(a).prioridad - estadoInventario(b).prioridad || a.disponible - b.disponible;
    } else comparacion = a[orden.columna] - b[orden.columna];
    return comparacion === 0 ? a.nombre.localeCompare(b.nombre, "es") : comparacion * factor;
  });
}

export function Inventario({
  materiales,
  cargando,
  puedeIngresar,
  onRecargar,
  onRegistrarEntrada,
  onRegistrarPerdida,
}: Props) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<FiltroInventario>("todos");
  const [orden, setOrden] = useState<OrdenInventario>({ columna: "estado", direccion: "asc" });
  const [seleccionado, setSeleccionado] = useState<MaterialInventarioUi | null>(null);
  const [entrada, setEntrada] = useState("");
  const [tipoAjuste, setTipoAjuste] = useState<TipoAjusteInventario>("entrada");
  const [motivoPerdida, setMotivoPerdida] = useState<MotivoPerdidaInventario>("producto_danado");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const recargaEnCurso = useRef(false);
  const onRecargarActual = useRef(onRecargar);

  useEffect(() => {
    onRecargarActual.current = onRecargar;
  }, [onRecargar]);

  useEffect(() => {
    async function actualizarSiCorresponde() {
      if (document.hidden || recargaEnCurso.current) return;
      recargaEnCurso.current = true;
      try {
        await onRecargarActual.current();
      } catch {
        // La actualización periódica es silenciosa; la carga inicial de la
        // pantalla conserva el manejo global de errores.
      } finally {
        recargaEnCurso.current = false;
      }
    }

    const intervalo = window.setInterval(() => void actualizarSiCorresponde(), 15_000);
    function alCambiarVisibilidad() {
      if (!document.hidden) void actualizarSiCorresponde();
    }
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    };
  }, []);

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase("es");
    const filtrados = materiales.filter((material) => {
      if (filtro === "disponibles" && material.disponible <= 0) return false;
      if (filtro === "sin-stock" && material.disponible > 0) return false;
      if (filtro === "con-reservas" && material.reservado <= 0) return false;
      return !termino || material.nombre.toLocaleLowerCase("es").includes(termino) || material.codigo?.toLocaleLowerCase("es").includes(termino);
    });
    return ordenarMateriales(filtrados, orden);
  }, [busqueda, filtro, materiales, orden]);

  const sinStock = materiales.filter((material) => material.disponible <= 0).length;
  const conReservas = materiales.filter((material) => material.reservado > 0).length;

  function alternarOrden(columna: ColumnaOrdenInventario) {
    setOrden((actual) => ({
      columna,
      direccion: actual.columna === columna && actual.direccion === "asc" ? "desc" : "asc",
    }));
  }

  function cabeceraOrdenable(
    columna: ColumnaOrdenInventario,
    etiqueta: string,
    IconoCabecera?: LucideIcon,
  ) {
    const activa = orden.columna === columna;
    const direccion = activa ? orden.direccion : null;
    const IconoOrden = direccion === "asc" ? ArrowUp : direccion === "desc" ? ArrowDown : ArrowUpDown;
    return (
      <span role="columnheader" aria-sort={direccion === "asc" ? "ascending" : direccion === "desc" ? "descending" : "none"}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`inventario-cabecera__boton${columna === "nombre" ? " inventario-cabecera__boton--inicio" : " inventario-cabecera__boton--icono"}`}
          aria-label={`Ordenar por ${etiqueta}${activa ? `, ${direccion === "asc" ? "ascendente" : "descendente"}` : ""}`}
          title={`Ordenar por ${etiqueta}`}
          onClick={() => alternarOrden(columna)}
        >
          {IconoCabecera ? <IconoCabecera className="inventario-cabecera__icono" size={18} aria-hidden="true" /> : <span>{etiqueta}</span>}
          <IconoOrden className="inventario-cabecera__orden" size={14} aria-hidden="true" />
        </Button>
      </span>
    );
  }

  const resumen = (
    <div
      className="inventario-resumen"
      role="group"
      aria-label="Filtrar inventario"
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
      <Button type="button" size="sm" variant={filtro === "con-reservas" ? "secondary" : "outline"} aria-pressed={filtro === "con-reservas"} aria-label={`Mostrar ${conReservas} materiales con reservas`} onClick={() => setFiltro("con-reservas")}>
        <Clock3 size={17} aria-hidden="true" /><div><strong>{conReservas}</strong><span>Con reservas</span></div>
      </Button>
    </div>
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
          <p>Existencia física, cantidad comprometida por órdenes y saldo disponible para nuevas ventas.</p>
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
        </div>

        <div className="inventario-tabla" role="table" aria-label="Materiales disponibles">
          <div className="inventario-orden-movil">
            <label>
              Ordenar por
              <Select
                aria-label="Columna para ordenar el inventario"
                value={orden.columna}
                onChange={(event) => setOrden({ columna: event.target.value as ColumnaOrdenInventario, direccion: "asc" })}
              >
                <option value="estado">Estado</option>
                <option value="nombre">Material</option>
                <option value="enMano">Existencia física</option>
                <option value="reservado">Comprometido</option>
                <option value="disponible">Disponible</option>
              </Select>
            </label>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={`Orden ${orden.direccion === "asc" ? "ascendente" : "descendente"}`}
              onClick={() => setOrden((actual) => ({ ...actual, direccion: actual.direccion === "asc" ? "desc" : "asc" }))}
            >
              {orden.direccion === "asc" ? <ArrowUp size={18} aria-hidden="true" /> : <ArrowDown size={18} aria-hidden="true" />}
            </Button>
          </div>
          <div className="inventario-fila inventario-fila--cabecera" role="row">
            {cabeceraOrdenable("nombre", "Material")}
            {cabeceraOrdenable("enMano", "Existencia física", Warehouse)}
            {cabeceraOrdenable("reservado", "Comprometido", LockKeyhole)}
            {cabeceraOrdenable("disponible", "Disponible", PackageCheck)}
            {cabeceraOrdenable("estado", "Estado", Gauge)}
          </div>
          {cargando && visibles.length === 0 ? (
            <div aria-hidden="true">
              {Array.from({ length: 5 }, (_, i) => (
                <div className="inventario-fila" role="row" key={i}>
                  <Skeleton className="h-8 w-full" />
                </div>
              ))}
            </div>
          ) : (
            visibles.map((material) => {
            const estadoMaterial = estadoInventario(material);
            const presentacion = presentarUnidadMaterial(material.nombre);
            const nombreConUnidad = `${presentacion.nombre} (${presentacion.unidad})`;
            return (
              <div className="inventario-fila" role="row" key={material.id}>
                <span className="inventario-material" role="cell" data-label="Material">
                  {puedeIngresar ? (
                    <button
                      type="button"
                      className="inventario-material__accion"
                      aria-label={`Ajustar inventario de ${nombreConUnidad}`}
                      onClick={() => abrirAjuste(material)}
                    >
                      <span className="inventario-material__nombre">
                        <strong>{presentacion.nombre}</strong>
                        <span className="inventario-material__unidad">({presentacion.unidad})</span>
                      </span>
                      {material.codigo ? <small>{material.codigo}</small> : null}
                    </button>
                  ) : (
                    <>
                      <span className="inventario-material__nombre">
                        <strong>{presentacion.nombre}</strong>
                        <span className="inventario-material__unidad">({presentacion.unidad})</span>
                      </span>
                      {material.codigo ? <small>{material.codigo}</small> : null}
                    </>
                  )}
                </span>
                <span role="cell" data-label="Existencia física">{cantidad(material.enMano)}</span>
                <span role="cell" data-label="Comprometido">{cantidad(material.reservado)}</span>
                <strong role="cell" data-label="Disponible">{cantidad(material.disponible)}</strong>
                <span role="cell" data-label="Estado">
                  <Badge
                    variant={estadoMaterial.variante}
                    title={estadoMaterial.texto === "Poco stock" ? "Queda el 20% o menos de la existencia física, o un máximo de 2 unidades" : undefined}
                  >
                    {estadoMaterial.texto}
                  </Badge>
                </span>
              </div>
            );
          })
          )}
          {!cargando && visibles.length === 0 ? <div className="empty-state">No hay materiales que coincidan con el filtro.</div> : null}
        </div>
      </Card>

      <p className="inventario-seguridad">
        <ShieldCheck size={17} aria-hidden="true" />
        Todo el equipo puede consultar. Los ingresos y las pérdidas exigen autorización y quedan registrados.
      </p>

      {seleccionado ? (
        <Dialog aria-label={`Ajustar ${seleccionado.nombre}`} onOverlayClick={() => setSeleccionado(null)}>
          <DialogContent className="inventario-modal w-[min(440px,calc(100vw-1.5rem))] p-[1.4rem]">
            <span className="page-eyebrow">Movimiento de inventario</span>
            <h2>Ajustar {seleccionado.nombre}</h2>
            <p>Existencia física actual: <strong>{cantidad(seleccionado.enMano)}</strong></p>
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
            {error ? <Alerta>{error}</Alerta> : null}
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
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}
