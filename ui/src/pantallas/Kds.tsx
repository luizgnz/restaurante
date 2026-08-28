import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.tsx";

type Linea = {
  id: number;
  etapa: string;
  esAviso: boolean;
  nombre: string;
  cantidad: number;
  delta: number | null;
  nota: string | null;
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
          <Card className="tarjeta" key={t.id}>
            <CardHeader className="p-0 pb-2">
              <CardTitle>{t.referencia}</CardTitle>
              <p>{t.mesero}</p>
              {t.indicaciones ? <p>{t.indicaciones}</p> : null}
            </CardHeader>
            <CardContent className="p-0">
              <ul>
                {t.lineas.map((l) => (
                  <li key={l.id}>
                    {cantidad(l)} {l.nombre} · {l.esAviso ? "aviso" : l.etapa}
                    {l.nota ? ` · ${l.nota}` : ""}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
        {tarjetas.length === 0 ? <p>No hay comandas</p> : null}
      </div>
    </section>
  );
}
