import { useState, type FormEvent } from "react";
import { Button } from "../components/ui/button.tsx";
import { Checkbox } from "../components/ui/checkbox.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";
import { Select, SelectItem } from "../components/ui/select.tsx";

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
  const [categoriaId, setCategoriaId] = useState<string>(categorias[0] ? String(categorias[0].id) : "none");
  const [tipo, setTipo] = useState("no_almacenable");
  const [enPos, setEnPos] = useState(true);
  const [rastrear, setRastrear] = useState(true);
  const [codigo, setCodigo] = useState("");
  const [color, setColor] = useState("#1c1917");
  const [foto, setFoto] = useState<string | null>(null);

  function enviar(e: FormEvent) {
    e.preventDefault();
    onGuardar({
      nombre,
      precio_centavos: Math.round(Number(precio) || 0),
      categoria_id: categoriaId && categoriaId !== "none" ? Number(categoriaId) : null,
      tipo_consumo: tipo,
      disponible_en_pos: enPos,
      rastrear_inventario: rastrear,
      codigo,
      color,
      foto_data: foto,
    });
  }

  return (
    <section className="form-odoo mx-auto w-full max-w-xl">
      <form className="form-odoo__tarjeta flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm" onSubmit={enviar}>
        <div>
          <h1 className="m-0 text-2xl font-semibold tracking-tight">Nuevo producto</h1>
          <p className="login-odoo__ayuda mt-1 text-sm text-muted-foreground">
            Nombre, precio, foto, código y si se rastrea en inventario.
          </p>
        </div>
        <Label className="form-odoo__foto">
          Foto
          {foto ? <img src={foto} alt="" className="form-odoo__foto-vista mt-2 size-16 rounded-2xl object-cover" /> : null}
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) leerImagen(f, setFoto);
            }}
          />
        </Label>
        {foto ? (
          <Button type="button" variant="outline" onClick={() => setFoto(null)}>
            Quitar foto
          </Button>
        ) : null}
        <Label>
          Nombre
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus required />
        </Label>
        <Label>
          Código de producto
          <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Opcional" />
        </Label>
        <Label>
          Precio de venta
          <Input inputMode="numeric" value={precio} onChange={(e) => setPrecio(e.target.value)} />
        </Label>
        <Label>
          Color del ítem
          <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </Label>
        <Label>
          Categoría POS
          <Select value={categoriaId} onValueChange={setCategoriaId}>
            <SelectItem value="none">Sin categoría</SelectItem>
            {categorias.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.nombre}
              </SelectItem>
            ))}
          </Select>
        </Label>
        <Label>
          Tipo
          <Select value={tipo} onValueChange={setTipo}>
            <SelectItem value="no_almacenable">Consumible</SelectItem>
            <SelectItem value="almacenable_unitario">Almacenable</SelectItem>
            <SelectItem value="receta_kit">Receta</SelectItem>
          </Select>
        </Label>
        {tipo === "receta_kit" ? (
          <div className="editor-receta rounded-2xl p-4 text-sm">
            <p className="m-0 font-semibold">Receta</p>
            <p className="mt-1 mb-0 text-[var(--editor-receta-muted)]">
              Este producto se arma con componentes de inventario. El descuento de stock usa la receta, no el ítem final.
            </p>
          </div>
        ) : null}
        <Label className="switch-tablet flex-row items-center gap-3">
          <Checkbox checked={rastrear} onCheckedChange={(checked) => setRastrear(checked === true)} />
          Rastrear en el inventario
        </Label>
        <Label className="switch-tablet flex-row items-center gap-3">
          <Checkbox checked={enPos} onCheckedChange={(checked) => setEnPos(checked === true)} />
          Disponible en el PdV
        </Label>
        <div className="form-odoo__acciones flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancelar}>
            Descartar
          </Button>
          <Button type="submit">Guardar</Button>
        </div>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </section>
  );
}
