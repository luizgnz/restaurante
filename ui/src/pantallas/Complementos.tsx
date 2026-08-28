import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.tsx";

type Props = { mensajes: string[] };

export function Complementos({ mensajes }: Props) {
  return (
    <section>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Complementos</CardTitle>
        </CardHeader>
        <CardContent>
          {mensajes.map((m) => (
            <p key={m}>{m}</p>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
