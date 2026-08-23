export type LineaCuentaUi = {
  lineaClave: string;
  productoId: number;
  nombre: string;
  cantidad: number;
  nota: string | null;
};

export type CuentaEnCursoUi = {
  id: number;
  mesaId: number;
  mesa: number;
  mesero: string;
  estado: string;
  abiertaEn?: string;
  hace: string;
  espera_min?: number;
  totalCentavos: number;
  ordenes: {
    id: number;
    numero: number;
    lineas: LineaCuentaUi[];
  }[];
};

const ESTADO: Record<string, string> = {
  abierta: "En pedido",
  precuenta_emitida: "Precuenta emitida",
};

type Props = {
  cuentas: CuentaEnCursoUi[];
  onAbrir: (cuentaId: number) => void;
};

export function Pedidos({ cuentas, onAbrir }: Props) {
  return (
    <section>
      <h1>Órdenes</h1>
      <div className="kds">
        {cuentas.map((cuenta) => (
          <article className="tarjeta" key={cuenta.id}>
            <button className="pedido-cabecera" onClick={() => onAbrir(cuenta.id)}>
              <strong>Mesa {cuenta.mesa}</strong>
              <span className="pedido-estado">{ESTADO[cuenta.estado] ?? cuenta.estado}</span>
              <span>
                {cuenta.mesero} · {cuenta.hace}
              </span>
            </button>
            {cuenta.ordenes.map((orden) => (
              <div key={orden.id}>
                <p className="pedido-indicaciones">Orden #{orden.numero}</p>
                {orden.lineas.map((linea) => (
                  <div className="pedido-linea" key={linea.lineaClave}>
                    <span>
                      {linea.cantidad} × {linea.nombre}
                      {linea.nota ? ` (${linea.nota})` : ""}
                    </span>
                  </div>
                ))}
              </div>
            ))}
            {cuenta.ordenes.length === 0 ? <p className="login-odoo__ayuda">Sin órdenes aún</p> : null}
          </article>
        ))}
        {cuentas.length === 0 ? <p>No hay cuentas en curso</p> : null}
      </div>
    </section>
  );
}
