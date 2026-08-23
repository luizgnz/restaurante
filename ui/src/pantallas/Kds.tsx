type Linea = {
  id: number;
  etapa: string;
  esAviso: boolean;
  nombre: string;
  cantidad: number;
  delta: number | null;
  nota: string | null;
  contornos?: string[];
};

type Tarjeta = {
  id: number;
  referencia: string;
  mesero: string;
  indicaciones: string | null;
  lineas: Linea[];
};

/** `+2` / `-1` cuando es una corrección; la cantidad sola cuando es un envío. */
function cantidad(l: Linea): string {
  if (l.delta == null) return `${l.cantidad}`;
  return `${l.delta > 0 ? "+" : ""}${l.delta}`;
}

export function Kds({ tarjetas }: { tarjetas: Tarjeta[] }) {
  return (
    <section>
      <h1>Cocina</h1>
      <div className="kds">
        {tarjetas.map((t) => (
          <article className="tarjeta" key={t.id}>
            <strong>{t.referencia}</strong>
            <p>{t.mesero}</p>
            {t.indicaciones ? <p>{t.indicaciones}</p> : null}
            <ul>
              {t.lineas.map((l) => (
                <li key={l.id}>
                  {cantidad(l)} {l.nombre} · {l.esAviso ? "aviso" : l.etapa}
                  {l.nota ? ` · ${l.nota}` : ""}
                  {(l.contornos ?? []).length > 0 ? (
                    <span className="kds-contornos">
                      {l.contornos!.map((contorno) => (
                        <em key={contorno}>{contorno}</em>
                      ))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </article>
        ))}
        {tarjetas.length === 0 ? <p>No hay comandas</p> : null}
      </div>
    </section>
  );
}
