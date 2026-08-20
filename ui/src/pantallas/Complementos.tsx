type Props = { mensajes: string[] };

export function Complementos({ mensajes }: Props) {
  return (
    <section>
      <h1>Complementos</h1>
      {mensajes.map((m) => (
        <p key={m}>{m}</p>
      ))}
    </section>
  );
}
