export type Mesa = {
  id: number;
  numero: number;
  estado: string;
  pedidoId: number | null;
  asientos: number;
  pos_x: number;
  pos_y: number;
  forma: string;
  ancho: number;
  alto: number;
};

type Props = {
  piso: string;
  mesas: Mesa[];
  fondoUrl?: string | null;
  asignando?: boolean;
  onMesa: (mesa: Mesa) => void;
  onNuevoPedido?: () => void;
  onFondo?: (dataUrl: string) => void;
};

const ETIQUETA: Record<string, string> = {
  libre: "Libre",
  ocupada: "Ocupada",
  en_cocina: "En pedido",
  precuenta: "Precuenta",
  en_caja: "En caja",
};

export function Plano({ piso, mesas, fondoUrl, asignando, onMesa, onNuevoPedido, onFondo }: Props) {
  return (
    <section className="salon-odoo">
      <header className="salon-odoo__pisos">
        <button className="salon-odoo__piso is-on">{piso}</button>
        {onNuevoPedido ? (
          <button className="primario" onClick={onNuevoPedido}>
            Nuevo pedido
          </button>
        ) : null}
        {onFondo ? (
          <label className="salon-odoo__fondo">
            Imagen de fondo
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => onFondo(String(reader.result));
                reader.readAsDataURL(file);
              }}
            />
          </label>
        ) : null}
      </header>
      {asignando ? <p>Toque una mesa libre para sentar el pedido</p> : null}
      <div
        className="plano-mapa"
        style={fondoUrl ? { backgroundImage: `url("${fondoUrl}")`, backgroundSize: "cover" } : undefined}
      >
        {mesas.map((m) => (
          <button
            key={m.id}
            className={`mesa-odoo mesa-odoo--${m.estado} mesa-odoo--${m.forma}`}
            style={{
              left: `${m.pos_x}%`,
              top: `${m.pos_y}%`,
              width: m.ancho,
              height: m.alto,
            }}
            onClick={() => onMesa(m)}
          >
            <span className="mesa-odoo__num">Mesa {m.numero}</span>
            <span className="mesa-odoo__meta">
              {m.asientos} · {ETIQUETA[m.estado] ?? m.estado}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
