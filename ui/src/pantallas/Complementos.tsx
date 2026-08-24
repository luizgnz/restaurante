type Props = { mensajes: string[] };

export function Complementos({ mensajes }: Props) {
  return (
    <section className="page-shell">
      <header className="page-header"><div><span className="page-eyebrow">Extensiones</span><h1>Complementos</h1><p>Integraciones disponibles para el restaurante.</p></div></header>
      {mensajes.map((m) => (
        <p key={m}>{m}</p>
      ))}
    </section>
  );
}
