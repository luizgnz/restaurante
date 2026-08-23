import { useState, type FormEvent } from "react";

export type Categoria = { id: number; nombre: string };

type Props = {
  categorias: Categoria[];
  error: string;
  onGuardar: (p: {
    nombre: string;
    precio_centavos: number;
    categoria_id: number | null;
    tipo_consumo: string;
    disponible_en_pos: boolean;
    rastrear_inventario: boolean;
    codigo: string;
    color: string;
    foto_data: string | null;
  }) => void;
  onCancelar: () => void;
};

function leerImagen(file: File, cb: (url: string) => void) {
  const r = new FileReader();
  r.onload = () => cb(String(r.result));
  r.readAsDataURL(file);
}

export function CrearProducto({ categorias, error, onGuardar, onCancelar }: Props) {
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("0");
  const [categoriaId, setCategoriaId] = useState<string>(categorias[0] ? String(categorias[0].id) : "");
  const [tipo, setTipo] = useState("no_almacenable");
  const [enPos, setEnPos] = useState(true);
  const [rastrear, setRastrear] = useState(true);
  const [codigo, setCodigo] = useState("");
  const [color, setColor] = useState("#714b67");
  const [foto, setFoto] = useState<string | null>(null);

  function enviar(e: FormEvent) {
    e.preventDefault();
    onGuardar({
      nombre,
      precio_centavos: Math.round(Number(precio) || 0),
      categoria_id: categoriaId ? Number(categoriaId) : null,
      tipo_consumo: tipo,
      disponible_en_pos: enPos,
      rastrear_inventario: rastrear,
      codigo,
      color,
      foto_data: foto,
    });
  }

  return (
    <section className="form-odoo">
      <form className="form-odoo__tarjeta" onSubmit={enviar}>
        <h1>Nuevo producto</h1>
        <p className="login-odoo__ayuda">Nombre, precio, foto, código y si se rastrea en inventario.</p>
        <label className="form-odoo__foto">
          Foto
          {foto ? <img src={foto} alt="" className="form-odoo__foto-vista" /> : null}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) leerImagen(f, setFoto);
            }}
          />
        </label>
        {foto ? (
          <button type="button" className="tactil" onClick={() => setFoto(null)}>
            Quitar foto
          </button>
        ) : null}
        <label>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus required />
        </label>
        <label>
          Código de producto
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Opcional" />
        </label>
        <label>
          Precio de venta
          <input inputMode="numeric" value={precio} onChange={(e) => setPrecio(e.target.value)} />
        </label>
        <label>
          Color del ítem
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
        <label>
          Categoría POS
          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Sin categoría</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="no_almacenable">Consumible</option>
            <option value="almacenable_unitario">Almacenable</option>
            <option value="receta_kit">Receta</option>
          </select>
        </label>
        <label className="switch-tablet">
          <input type="checkbox" checked={rastrear} onChange={(e) => setRastrear(e.target.checked)} />
          Rastrear en el inventario
        </label>
        <label className="switch-tablet">
          <input type="checkbox" checked={enPos} onChange={(e) => setEnPos(e.target.checked)} />
          Disponible en el PdV
        </label>
        <div className="form-odoo__acciones">
          <button type="button" className="tactil" onClick={onCancelar}>
            Descartar
          </button>
          <button className="primario tactil" type="submit">
            Guardar
          </button>
        </div>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </section>
  );
}
