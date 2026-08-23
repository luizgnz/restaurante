import { useEffect, useState } from "react";

type Props = { onPin: (pin: string) => void; onCancelar: () => void; titulo: string; error?: string };

export function PinPad({ onPin, onCancelar, titulo, error = "" }: Props) {
  const [pin, setPin] = useState("");

  useEffect(() => {
    if (error) setPin("");
  }, [error]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setPin((p) => p + e.key);
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        setPin((p) => p.slice(0, -1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        onPin(pin);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onCancelar();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pin, onPin, onCancelar]);

  return (
    <div
      className="modal-fondo"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancelar();
      }}
    >
      <div className="modal-caja pin-caja">
        <h2>{titulo}</h2>
        <p className="pin-marcas">{pin.replace(/./g, "•") || "PIN"}</p>
        {error ? (
          <p role="alert" className="pin-error">
            {error}. Vuelve a ingresar el PIN.
          </p>
        ) : null}
        <p className="login-odoo__ayuda">Puedes escribirlo con el teclado: números, Retroceso y Enter.</p>
        <div className="pin">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "←", "0", "OK"].map((k) => (
            <button
              key={k}
              type="button"
              className={k === "OK" ? "primario tactil" : "tactil"}
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
        <button type="button" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
