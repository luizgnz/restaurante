import { useState, type FormEvent } from "react";
import { UtensilsCrossed } from "lucide-react";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";

type Props = {
  error: string;
  onEntrar: (creds: { usuario: string; password: string }) => void;
};

export function Login({ error, onEntrar }: Props) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");

  function enviar(e: FormEvent) {
    e.preventDefault();
    onEntrar({ usuario, password });
  }

  return (
    <section className="login-odoo relative flex min-h-dvh items-center justify-center overflow-hidden bg-[oklch(0.18_0.02_50)] px-4 py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,oklch(0.45_0.06_70/0.28),transparent_42%),radial-gradient(circle_at_80%_90%,oklch(0.32_0.03_50/0.4),transparent_40%)]" />
      <form
        className="login-odoo__tarjeta relative w-full max-w-[400px] rounded-[1.75rem] border border-white/10 bg-card p-7 shadow-2xl"
        onSubmit={enviar}
      >
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <UtensilsCrossed size={22} aria-hidden="true" />
          </span>
          <div>
            <h1 className="m-0 text-2xl font-semibold tracking-tight">Restaurante</h1>
            <p className="login-odoo__ayuda mt-1 text-sm text-muted-foreground">Inicie sesión como administrador</p>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Label>
            Usuario
            <Input
              name="usuario"
              autoComplete="username"
              autoFocus
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
            />
          </Label>
          <Label>
            Contraseña
            <Input
              name="contraseña"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Label>
          <Button className="mt-2 w-full" type="submit">
            Iniciar sesión
          </Button>
          {error ? (
            <p className="rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
