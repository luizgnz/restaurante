import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { api } from "../api.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Select } from "@/components/ui/select.tsx";

export type ProductoAdministrable = {
  id: number;
  nombre: string;
  tipo_consumo: string;
  rastrear_inventario: number;
};

type LineaReceta = { ingredienteId: number; nombre?: string; cantidad: number };

type Props = {
  productos: ProductoAdministrable[];
  onVolver: () => void;
};

export function Recetas({ productos, onVolver }: Props) {
  const recetas = useMemo(() => productos.filter((producto) => producto.tipo_consumo === "receta_kit"), [productos]);
  const [productoId, setProductoId] = useState<number>(0);
  const [lineas, setLineas] = useState<LineaReceta[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const ingredientes = productos.filter((producto) => producto.id !== productoId && producto.tipo_consumo !== "receta_kit" && Boolean(producto.rastrear_inventario));

  useEffect(() => {
    if (!productoId && recetas[0]) setProductoId(recetas[0].id);
  }, [productoId, recetas]);

  useEffect(() => {
    if (!productoId) {
      setLineas([]);
      return;
    }
    setCargando(true);
    setMensaje("");
    api<{ receta: LineaReceta[] }>(`/api/productos/${productoId}/receta`)
      .then((data) => setLineas(data.receta))
      .catch((error) => setMensaje(error instanceof Error ? error.message : String(error)))
      .finally(() => setCargando(false));
  }, [productoId]);

  function agregarIngrediente() {
    const disponible = ingredientes.find((ingrediente) => !lineas.some((linea) => linea.ingredienteId === ingrediente.id));
    if (disponible) setLineas([...lineas, { ingredienteId: disponible.id, nombre: disponible.nombre, cantidad: 1 }]);
  }

  async function guardar() {
    if (!productoId || lineas.length === 0) {
      setMensaje("La receta necesita al menos un ingrediente.");
      return;
    }
    setGuardando(true);
    setMensaje("");
    try {
      const data = await api<{ receta: LineaReceta[] }>(`/api/productos/${productoId}/receta`, {
        method: "PUT",
        body: JSON.stringify({ receta: lineas.map(({ ingredienteId, cantidad }) => ({ ingredienteId, cantidad })) }),
      });
      setLineas(data.receta);
      setMensaje("Receta guardada.");
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : String(error));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="page-shell recipes-page">
      <header className="page-header">
        <div>
          <span className="page-eyebrow">Administración</span>
          <h1>Editor de recetas</h1>
          <p>Define los materiales y cantidades que descuenta cada plato.</p>
        </div>
        <Button type="button" variant="outline" onClick={onVolver}><ArrowLeft size={18} aria-hidden="true" /> Volver</Button>
      </header>

      {recetas.length === 0 ? (
        <div className="empty-state"><h2>No hay productos de tipo receta</h2><p>Crea un producto y selecciona “Receta” para poder editar sus ingredientes aquí.</p></div>
      ) : (
        <div className="recipes-editor">
          <label>Producto
            <Select value={productoId} onChange={(event) => setProductoId(Number(event.target.value))}>
              {recetas.map((producto) => <option key={producto.id} value={producto.id}>{producto.nombre}</option>)}
            </Select>
          </label>

          {cargando ? <p>Cargando receta…</p> : lineas.map((linea, indice) => (
            <div className="recipes-editor__line" key={`${linea.ingredienteId}-${indice}`}>
              <label>Ingrediente
                <Select value={linea.ingredienteId} onChange={(event) => setLineas(lineas.map((actual, posicion) => posicion === indice ? { ...actual, ingredienteId: Number(event.target.value) } : actual))}>
                  {ingredientes.map((ingrediente) => <option key={ingrediente.id} value={ingrediente.id}>{ingrediente.nombre}</option>)}
                </Select>
              </label>
              <label>Cantidad
                <Input type="number" min="0.001" step="0.001" inputMode="decimal" value={linea.cantidad} onChange={(event) => setLineas(lineas.map((actual, posicion) => posicion === indice ? { ...actual, cantidad: Number(event.target.value) } : actual))} />
              </label>
              <Button type="button" variant="outline" size="icon" aria-label="Quitar ingrediente" title="Quitar ingrediente" onClick={() => setLineas(lineas.filter((_, posicion) => posicion !== indice))}><Trash2 size={18} /></Button>
            </div>
          ))}

          <div className="recipes-editor__actions">
            <Button type="button" variant="outline" onClick={agregarIngrediente} disabled={ingredientes.length <= lineas.length}><Plus size={18} /> Ingrediente</Button>
            <Button type="button" onClick={guardar} disabled={guardando || cargando}><Save size={18} /> {guardando ? "Guardando…" : "Guardar receta"}</Button>
          </div>
          {mensaje ? <p className="recipes-editor__message" role="status">{mensaje}</p> : null}
        </div>
      )}
    </section>
  );
}
