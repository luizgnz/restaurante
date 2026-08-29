import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Select } from "@/components/ui/select.tsx";

export type Categoria = { id: number; nombre: string };

export type CrearProductoProps = {
  categorias: Categoria[];
  ingredientesDisponibles?: Array<{ id: number; nombre: string }>;
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
    receta: Array<{ ingredienteId: number; cantidad: number }>;
  }) => void;
  onCancelar: () => void;
  onDirtyChange?: (sucio: boolean) => void;
};

const COLOR_INICIAL = "#714b67";

function leerImagen(file: File, cb: (url: string) => void) {
  const r = new FileReader();
  r.onload = () => cb(String(r.result));
  r.readAsDataURL(file);
}

export function CrearProducto({ categorias, ingredientesDisponibles = [], error, onGuardar, onCancelar, onDirtyChange }: CrearProductoProps) {
  const categoriaInicial = categorias[0] ? String(categorias[0].id) : "";
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("0");
  const [categoriaId, setCategoriaId] = useState<string>(categoriaInicial);
  const [tipo, setTipo] = useState("no_almacenable");
  const [enPos, setEnPos] = useState(true);
  const [rastrear, setRastrear] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [color, setColor] = useState(COLOR_INICIAL);
  const [foto, setFoto] = useState<string | null>(null);
  const [receta, setReceta] = useState<Array<{ ingredienteId: number; cantidad: number }>>([]);
  const [errorReceta, setErrorReceta] = useState("");

  const sucio =
    nombre.trim() !== "" ||
    precio !== "0" ||
    codigo.trim() !== "" ||
    color !== COLOR_INICIAL ||
    foto !== null ||
    tipo !== "no_almacenable" ||
    !enPos ||
    rastrear ||
    categoriaId !== categoriaInicial;

  useEffect(() => {
    onDirtyChange?.(sucio);
  }, [sucio, onDirtyChange]);

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (tipo === "receta_kit" && receta.length === 0) {
      setErrorReceta("Agrega al menos un ingrediente a la receta.");
      return;
    }
    setErrorReceta("");
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
      receta,
    });
  }

  return (
    <form className="form-odoo__tarjeta" onSubmit={enviar}>
      <p className="login-odoo__ayuda">Nombre, precio, foto, código y si se rastrea en inventario.</p>
      <label className="form-odoo__foto">
        Foto
        {foto ? <img src={foto} alt="" className="form-odoo__foto-vista" /> : null}
        <Input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) leerImagen(f, setFoto);
          }}
        />
      </label>
      {foto ? (
        <Button type="button" variant="outline" onClick={() => setFoto(null)}>
          Quitar foto
        </Button>
      ) : null}
      <label>
        Nombre
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus required />
      </label>
      <label>
        Código de producto
        <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Opcional" />
      </label>
      <label>
        Precio de venta
        <Input inputMode="numeric" value={precio} onChange={(e) => setPrecio(e.target.value)} />
      </label>
      <label>
        Color del ítem
        <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </label>
      <label>
        Categoría del menú
          <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
      </label>
      <label>
        Tipo
        <Select value={tipo} onChange={(e) => {
          const siguiente = e.target.value;
          setTipo(siguiente);
          setRastrear(siguiente === "almacenable_unitario");
          if (siguiente === "receta_kit" && receta.length === 0 && ingredientesDisponibles[0]) {
            setReceta([{ ingredienteId: ingredientesDisponibles[0].id, cantidad: 1 }]);
          }
        }}>
          <option value="no_almacenable">Consumible</option>
          <option value="almacenable_unitario">Almacenable</option>
          <option value="receta_kit">Receta</option>
        </Select>
      </label>
      {tipo === "receta_kit" ? <fieldset className="recipe-editor">
        <legend>Ingredientes de la receta</legend>
        <p className="login-odoo__ayuda">Define cuánto consume una unidad de este plato.</p>
        {receta.map((linea, indice) => <div className="recipe-editor__line" key={`${indice}-${linea.ingredienteId}`}>
          <label>Ingrediente<Select value={linea.ingredienteId} onChange={(event) => setReceta(receta.map((item, i) => i === indice ? { ...item, ingredienteId: Number(event.target.value) } : item))}>
            {ingredientesDisponibles.map((ingrediente) => <option key={ingrediente.id} value={ingrediente.id}>{ingrediente.nombre}</option>)}
          </Select></label>
          <label>Cantidad<Input type="number" min="0.001" step="0.001" inputMode="decimal" value={linea.cantidad} onChange={(event) => setReceta(receta.map((item, i) => i === indice ? { ...item, cantidad: Number(event.target.value) } : item))} /></label>
          <Button type="button" variant="destructive" onClick={() => setReceta(receta.filter((_, i) => i !== indice))}>Quitar</Button>
        </div>)}
        <Button type="button" variant="outline" disabled={ingredientesDisponibles.length === 0} onClick={() => {
          const disponible = ingredientesDisponibles.find((ingrediente) => !receta.some((linea) => linea.ingredienteId === ingrediente.id));
          if (disponible) setReceta([...receta, { ingredienteId: disponible.id, cantidad: 1 }]);
        }}>Agregar ingrediente</Button>
        {ingredientesDisponibles.length === 0 ? <p role="alert">Crea primero los materiales que usará la receta.</p> : null}
        {errorReceta ? <p role="alert">{errorReceta}</p> : null}
      </fieldset> : null}
      <label className="switch-tablet">
        <Checkbox checked={rastrear} onChange={(e) => setRastrear(e.target.checked)} />
        Rastrear en el inventario
      </label>
      <label className="switch-tablet">
        <Checkbox checked={enPos} onChange={(e) => setEnPos(e.target.checked)} />
        Disponible en la carta
      </label>
      <div className="form-odoo__acciones">
        <Button type="button" variant="outline" onClick={onCancelar}>
          Descartar
        </Button>
        <Button type="submit">
          Guardar
        </Button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
