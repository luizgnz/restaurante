import { useState } from "react";

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
    <section className="form-odoo">
      <div className="form-odoo__tarjeta">
        <h1>Categorías</h1>
        <p className="login-odoo__ayuda">
          Cada producto pertenece a una categoría. Las principales son Comida y Bebida; puedes crear las que
          necesites.
        </p>
        <label>
          Nueva categoría
          <input value={nombre} placeholder="Ej: Postres" onChange={(event) => setNombre(event.target.value)} />
        </label>
        <div className="form-odoo__acciones">
          <button type="button" onClick={onVolver}>
            Volver
          </button>
          <button type="button" className="primario" disabled={!nombre.trim() || creando} onClick={crear}>
            {creando ? "Creando…" : "Crear"}
          </button>
        </div>
        {error ? <p role="alert">{error}</p> : null}
        {categorias.length === 0 ? (
          <p className="login-odoo__ayuda">No hay categorías.</p>
        ) : (
          <ul className="categorias-lista">
            {categorias.map((categoria) => (
              <li key={categoria.id}>{categoria.nombre}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
