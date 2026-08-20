type Tarjeta = { id: number; mesa: number | null; mesero: string; envio_n: number };

export function Kds({ tarjetas }: { tarjetas: Tarjeta[] }) {
  return (
    <section>
      <h1>Cocina</h1>
      <div className="kds">
        {tarjetas.map((t) => (
          <article className="tarjeta" key={t.id}>
            <strong>{t.mesa ? `Mesa ${t.mesa}` : "Sin mesa"}</strong>
            <p>Envío {t.envio_n} · {t.mesero}</p>
          </article>
        ))}
        {tarjetas.length === 0 ? <p>No hay comandas</p> : null}
      </div>
    </section>
  );
}
