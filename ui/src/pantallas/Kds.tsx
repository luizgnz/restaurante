import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.tsx";
import { Badge } from "../components/ui/badge.tsx";

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
    <section className="flex flex-col gap-4">
      <h1 className="m-0 text-2xl font-semibold tracking-tight">Cocina</h1>
      <div className="kds grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {tarjetas.map((t) => (
          <Card className="tarjeta" key={t.id}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center justify-between gap-2">
                {t.referencia}
                <Badge variant="outline">{t.mesero}</Badge>
              </CardTitle>
              {t.indicaciones ? <p className="text-sm text-muted-foreground">{t.indicaciones}</p> : null}
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {t.lineas.map((l) => (
                  <li key={l.id} className="rounded-2xl bg-muted px-3 py-2 text-sm">
                    <strong>{cantidad(l)}</strong> {l.nombre} · {l.esAviso ? "aviso" : l.etapa}
                    {l.nota ? ` · ${l.nota}` : ""}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
        {tarjetas.length === 0 ? <p className="text-muted-foreground">No hay comandas</p> : null}
      </div>
    </section>
  );
}
