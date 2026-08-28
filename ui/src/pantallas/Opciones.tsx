import { Button } from "../components/ui/button.tsx";
import { Checkbox } from "../components/ui/checkbox.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";
import { Select, SelectItem } from "../components/ui/select.tsx";

export type OpcionesValores = {
  nombre_local: string;
  logo_data: string | null;
  tipografia: "sans" | "serif" | "redondeada";
  tamano_ui: "compacto" | "normal" | "grande";
  pin_habilitado: boolean;
  pin_momento: "crear_orden" | "enviar";
  confirmar_comanda: boolean;
  auditoria_anulaciones: boolean;
  justificacion_anulacion: boolean;
};

type Props = {
  valores: OpcionesValores;
  onCambiar: (patch: Partial<OpcionesValores>) => void;
};

function leerImagen(file: File, cb: (url: string) => void) {
  const r = new FileReader();
  r.onload = () => cb(String(r.result));
  r.readAsDataURL(file);
}

export function Opciones({ valores, onCambiar }: Props) {
  return (
    <section className="form-odoo mx-auto flex w-full max-w-xl flex-col gap-4">
      <h1 className="m-0 text-2xl font-semibold tracking-tight">Opciones</h1>
      <fieldset className="form-odoo__tarjeta flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm">
        <legend className="px-1 text-sm font-semibold">Identidad</legend>
        <Label>
          Nombre del restaurante
          <Input
            maxLength={40}
            value={valores.nombre_local}
            onChange={(e) => onCambiar({ nombre_local: e.target.value })}
            onBlur={(e) => onCambiar({ nombre_local: e.target.value.trim() || "Restaurante" })}
          />
        </Label>
        <Label>
          Logo
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) leerImagen(f, (url) => onCambiar({ logo_data: url }));
            }}
          />
        </Label>
        {valores.logo_data ? (
          <>
            <img src={valores.logo_data} alt="" className="form-odoo__foto-vista size-16 self-center rounded-2xl object-cover" />
            <Button type="button" variant="outline" onClick={() => onCambiar({ logo_data: null })}>
              Quitar logo
            </Button>
          </>
        ) : null}
      </fieldset>
      <fieldset className="form-odoo__tarjeta flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm">
        <legend className="px-1 text-sm font-semibold">Apariencia</legend>
        <Label>
          Tipo de letra
          <Select
            value={valores.tipografia}
            onValueChange={(value) => onCambiar({ tipografia: value as OpcionesValores["tipografia"] })}
          >
            <SelectItem value="sans">Sans</SelectItem>
            <SelectItem value="serif">Serif</SelectItem>
            <SelectItem value="redondeada">Redondeada</SelectItem>
          </Select>
        </Label>
        <Label>
          Tamaño
          <Select
            value={valores.tamano_ui}
            onValueChange={(value) => onCambiar({ tamano_ui: value as OpcionesValores["tamano_ui"] })}
          >
            <SelectItem value="compacto">Compacto</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="grande">Grande</SelectItem>
          </Select>
        </Label>
        <p className="login-odoo__ayuda text-sm text-muted-foreground">Se aplica a todo el POS en cuanto lo cambias.</p>
      </fieldset>
      <fieldset className="form-odoo__tarjeta flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm">
        <legend className="px-1 text-sm font-semibold">Seguridad y autorizaciones</legend>
        <Label className="switch-tablet flex-row items-center gap-3">
          <Checkbox
            checked={valores.pin_habilitado}
            onCheckedChange={(checked) => onCambiar({ pin_habilitado: checked === true })}
          />
          Solicitar contraseña
        </Label>
        {valores.pin_habilitado ? (
          <Label>
            Momento
            <Select
              value={valores.pin_momento}
              onValueChange={(value) => onCambiar({ pin_momento: value as OpcionesValores["pin_momento"] })}
            >
              <SelectItem value="crear_orden">Antes de crear la orden</SelectItem>
              <SelectItem value="enviar">Al hacer clic en Enviar</SelectItem>
            </Select>
          </Label>
        ) : null}
        <p className="login-odoo__ayuda text-sm text-muted-foreground">Anular un producto siempre pide confirmar la contraseña.</p>
        <Label className="switch-tablet flex-row items-center gap-3">
          <Checkbox
            checked={valores.confirmar_comanda}
            onCheckedChange={(checked) => onCambiar({ confirmar_comanda: checked === true })}
          />
          Confirmar comanda antes de enviar
        </Label>
        <Label className="switch-tablet flex-row items-center gap-3">
          <Checkbox
            checked={valores.auditoria_anulaciones}
            onCheckedChange={(checked) =>
              onCambiar({
                auditoria_anulaciones: checked === true,
                ...(checked === true ? {} : { justificacion_anulacion: false }),
              })
            }
          />
          Guardar registro de órdenes anuladas
        </Label>
        {valores.auditoria_anulaciones ? (
          <Label className="switch-tablet flex-row items-center gap-3">
            <Checkbox
              checked={valores.justificacion_anulacion}
              onCheckedChange={(checked) => onCambiar({ justificacion_anulacion: checked === true })}
            />
            Pedir justificación al anular
          </Label>
        ) : null}
      </fieldset>
      <fieldset className="form-odoo__tarjeta flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm" disabled>
        <legend className="px-1 text-sm font-semibold">Impresoras</legend>
        <p className="login-odoo__ayuda text-sm text-muted-foreground">Configuración próximamente.</p>
        <Label>
          Impresora de comanda
          <Input disabled placeholder="Sin configurar" />
        </Label>
        <Label>
          Impresora de precuenta
          <Input disabled placeholder="Sin configurar" />
        </Label>
      </fieldset>
    </section>
  );
}
