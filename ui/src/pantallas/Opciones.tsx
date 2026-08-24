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
  precuenta_obligatoria_antes_de_caja: boolean;
  enviar_a_caja_requiere_avanzado: boolean;
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
    <section className="page-shell form-odoo opciones-page">
      <header className="page-header">
        <div><span className="page-eyebrow">Preferencias del sistema</span><h1>Opciones</h1><p>Personaliza la identidad, la experiencia táctil y las autorizaciones.</p></div>
      </header>
      <fieldset className="form-odoo__tarjeta settings-card">
        <legend>Identidad</legend>
        <label>
          Nombre del restaurante
          <input
            maxLength={40}
            value={valores.nombre_local}
            onChange={(e) => onCambiar({ nombre_local: e.target.value })}
            onBlur={(e) => onCambiar({ nombre_local: e.target.value.trim() || "Restaurante" })}
          />
        </label>
        <label>
          Logo
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) leerImagen(f, (url) => onCambiar({ logo_data: url }));
            }}
          />
        </label>
        {valores.logo_data ? (
          <>
            <img src={valores.logo_data} alt="" className="form-odoo__foto-vista" />
            <button type="button" onClick={() => onCambiar({ logo_data: null })}>
              Quitar logo
            </button>
          </>
        ) : null}
      </fieldset>
      <fieldset className="form-odoo__tarjeta settings-card">
        <legend>Apariencia</legend>
        <label>
          Tipo de letra
          <select
            value={valores.tipografia}
            onChange={(e) => onCambiar({ tipografia: e.target.value as OpcionesValores["tipografia"] })}
          >
            <option value="sans">Sans</option>
            <option value="serif">Serif</option>
            <option value="redondeada">Redondeada</option>
          </select>
        </label>
        <label>
          Tamaño
          <select
            value={valores.tamano_ui}
            onChange={(e) => onCambiar({ tamano_ui: e.target.value as OpcionesValores["tamano_ui"] })}
          >
            <option value="compacto">Compacto</option>
            <option value="normal">Normal</option>
            <option value="grande">Grande</option>
          </select>
        </label>
        <p className="login-odoo__ayuda">Se aplica a todo el POS en cuanto lo cambias.</p>
      </fieldset>
      <fieldset className="form-odoo__tarjeta settings-card settings-card--wide">
        <legend>Seguridad y autorizaciones</legend>
        <label className="switch-tablet">
          <input
            type="checkbox"
            checked={valores.pin_habilitado}
            onChange={(e) => onCambiar({ pin_habilitado: e.target.checked })}
          />
          Solicitar contraseña
        </label>
        {valores.pin_habilitado ? (
          <label>
            Momento
            <select
              value={valores.pin_momento}
              onChange={(e) => onCambiar({ pin_momento: e.target.value as OpcionesValores["pin_momento"] })}
            >
              <option value="crear_orden">Antes de crear la orden</option>
              <option value="enviar">Al hacer clic en Enviar</option>
            </select>
          </label>
        ) : null}
        <p className="login-odoo__ayuda">Anular un producto siempre pide confirmar la contraseña.</p>
        <label className="switch-tablet">
          <input
            type="checkbox"
            checked={valores.confirmar_comanda}
            onChange={(e) => onCambiar({ confirmar_comanda: e.target.checked })}
          />
          Confirmar comanda antes de enviar
        </label>
        <label className="switch-tablet">
          <input
            type="checkbox"
            checked={valores.precuenta_obligatoria_antes_de_caja}
            onChange={(e) => onCambiar({ precuenta_obligatoria_antes_de_caja: e.target.checked })}
          />
          Pedir precuenta antes de cerrar la cuenta
        </label>
        <label className="switch-tablet">
          <input
            type="checkbox"
            checked={valores.enviar_a_caja_requiere_avanzado}
            onChange={(e) => onCambiar({ enviar_a_caja_requiere_avanzado: e.target.checked })}
          />
          Pedir permiso avanzado para cerrar la cuenta
        </label>
        <label className="switch-tablet">
          <input
            type="checkbox"
            checked={valores.auditoria_anulaciones}
            onChange={(e) =>
              onCambiar({
                auditoria_anulaciones: e.target.checked,
                ...(e.target.checked ? {} : { justificacion_anulacion: false }),
              })
            }
          />
          Guardar registro de órdenes anuladas
        </label>
        {valores.auditoria_anulaciones ? (
          <label className="switch-tablet">
            <input
              type="checkbox"
              checked={valores.justificacion_anulacion}
              onChange={(e) => onCambiar({ justificacion_anulacion: e.target.checked })}
            />
            Pedir justificación al anular
          </label>
        ) : null}
      </fieldset>
      <fieldset className="form-odoo__tarjeta settings-card settings-card--wide" disabled>
        <legend>Impresoras</legend>
        <p className="login-odoo__ayuda">Configuración próximamente.</p>
        <label>
          Impresora de comanda
          <input disabled placeholder="Sin configurar" />
        </label>
        <label>
          Impresora de precuenta
          <input disabled placeholder="Sin configurar" />
        </label>
      </fieldset>
    </section>
  );
}
