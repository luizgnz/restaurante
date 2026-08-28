import { Button } from "../components/ui/button.tsx";
import { Checkbox } from "../components/ui/checkbox.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";
import { Select } from "../components/ui/select.tsx";

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
    <section className="form-odoo">
      <h1>Opciones</h1>
      <fieldset className="form-odoo__tarjeta">
        <legend>Identidad</legend>
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
            <img src={valores.logo_data} alt="" className="form-odoo__foto-vista" />
            <Button type="button" variant="secondary" onClick={() => onCambiar({ logo_data: null })}>
              Quitar logo
            </Button>
          </>
        ) : null}
      </fieldset>
      <fieldset className="form-odoo__tarjeta">
        <legend>Apariencia</legend>
        <Label>
          Tipo de letra
          <Select
            value={valores.tipografia}
            onChange={(e) => onCambiar({ tipografia: e.target.value as OpcionesValores["tipografia"] })}
          >
            <option value="sans">Sans</option>
            <option value="serif">Serif</option>
            <option value="redondeada">Redondeada</option>
          </Select>
        </Label>
        <Label>
          Tamaño
          <Select
            value={valores.tamano_ui}
            onChange={(e) => onCambiar({ tamano_ui: e.target.value as OpcionesValores["tamano_ui"] })}
          >
            <option value="compacto">Compacto</option>
            <option value="normal">Normal</option>
            <option value="grande">Grande</option>
          </Select>
        </Label>
        <p className="login-odoo__ayuda">Se aplica a todo el POS en cuanto lo cambias.</p>
      </fieldset>
      <fieldset className="form-odoo__tarjeta">
        <legend>Seguridad y autorizaciones</legend>
        <Label className="switch-tablet flex-row items-center">
          <Checkbox
            checked={valores.pin_habilitado}
            onChange={(e) => onCambiar({ pin_habilitado: e.target.checked })}
          />
          Solicitar contraseña
        </Label>
        {valores.pin_habilitado ? (
          <Label>
            Momento
            <Select
              value={valores.pin_momento}
              onChange={(e) => onCambiar({ pin_momento: e.target.value as OpcionesValores["pin_momento"] })}
            >
              <option value="crear_orden">Antes de crear la orden</option>
              <option value="enviar">Al hacer clic en Enviar</option>
            </Select>
          </Label>
        ) : null}
        <p className="login-odoo__ayuda">Anular un producto siempre pide confirmar la contraseña.</p>
        <Label className="switch-tablet flex-row items-center">
          <Checkbox
            checked={valores.confirmar_comanda}
            onChange={(e) => onCambiar({ confirmar_comanda: e.target.checked })}
          />
          Confirmar comanda antes de enviar
        </Label>
        <Label className="switch-tablet flex-row items-center">
          <Checkbox
            checked={valores.auditoria_anulaciones}
            onChange={(e) =>
              onCambiar({
                auditoria_anulaciones: e.target.checked,
                ...(e.target.checked ? {} : { justificacion_anulacion: false }),
              })
            }
          />
          Guardar registro de órdenes anuladas
        </Label>
        {valores.auditoria_anulaciones ? (
          <Label className="switch-tablet flex-row items-center">
            <Checkbox
              checked={valores.justificacion_anulacion}
              onChange={(e) => onCambiar({ justificacion_anulacion: e.target.checked })}
            />
            Pedir justificación al anular
          </Label>
        ) : null}
      </fieldset>
      <fieldset className="form-odoo__tarjeta" disabled>
        <legend>Impresoras</legend>
        <p className="login-odoo__ayuda">Configuración próximamente.</p>
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
