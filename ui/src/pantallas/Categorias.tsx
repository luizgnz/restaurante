import { useState } from "react";
import { ArrowLeft, Plus, Shapes } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";

export type CategoriaUi = { id: number; nombre: string };

type Props = {
  categorias: CategoriaUi[];
  onCrear: (nombre: string) => Promise<void>;
  onVolver: () => void;
};

export function Categorias({ categorias, onCrear, onVolver }: Props) {
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);

  async function crear() {
    const limpio = nombre.trim();
    if (!limpio || creando) return;
    setCreando(true);
    setError("");
    try {
      await onCrear(limpio);
      setNombre("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreando(false);
    }
  }

  return (
    <section className="page-shell categorias-page">
      <header className="page-header">
        <div><span className="page-eyebrow">Organización de la carta</span><h1>Categorías</h1><p>Agrupa los productos para agilizar la toma de pedidos.</p></div>
        <Button type="button" variant="outline" onClick={onVolver}><ArrowLeft size={18} aria-hidden="true" /> Volver</Button>
      </header>
      <div className="categorias-layout">
      <Card className="form-odoo__tarjeta categorias-form">
        <h2>Nueva categoría</h2>
        <label>
          Nombre
          <input value={nombre} placeholder="Ej: Postres" onChange={(event) => setNombre(event.target.value)} />
        </label>
        <div className="form-odoo__acciones">
          <Button type="button" disabled={!nombre.trim() || creando} onClick={crear}>
            <Plus size={18} aria-hidden="true" />
            {creando ? "Creando…" : "Crear"}
          </Button>
        </div>
        {error ? <p role="alert">{error}</p> : null}
      </Card>
      <Card className="categorias-panel">
        <h2>Categorías activas</h2>
        {categorias.length === 0 ? (
          <div className="empty-state"><Shapes size={28} aria-hidden="true" /> No hay categorías.</div>
        ) : (
          <ul className="categorias-lista">
            {categorias.map((categoria) => (
              <li key={categoria.id}><Shapes size={17} aria-hidden="true" /> {categoria.nombre}</li>
            ))}
          </ul>
        )}
      </Card>
      </div>
    </section>
  );
}
