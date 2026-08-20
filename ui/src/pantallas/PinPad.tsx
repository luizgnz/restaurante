import { useState } from "react";

type Props = { onPin: (pin: string) => void; onCancelar: () => void; titulo: string };

export function PinPad({ onPin, onCancelar, titulo }: Props) {
  const [pin, setPin] = useState("");
  return (
    <section>
      <h2>{titulo}</h2>
      <p>{pin.replace(/./g, "•") || "PIN"}</p>
      <div className="pin">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "←", "0", "OK"].map((k) => (
          <button
            key={k}
            className={k === "OK" ? "primario" : undefined}
            onClick={() => {
              if (k === "←") setPin((p) => p.slice(0, -1));
              else if (k === "OK") onPin(pin);
              else setPin((p) => p + k);
            }}
          >
            {k}
          </button>
        ))}
      </div>
      <button onClick={onCancelar}>Cancelar</button>
    </section>
  );
}
