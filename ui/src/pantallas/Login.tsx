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
    <section className="login-odoo">
      <form className="login-odoo__tarjeta" onSubmit={enviar}>
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <UtensilsCrossed size={22} aria-hidden="true" />
          </span>
          <h1>Restaurante</h1>
        </div>
        <p className="login-odoo__ayuda">Inicie sesión como administrador</p>
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
        <Button className="primario w-full" type="submit">
          Iniciar sesión
        </Button>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </section>
  );
}
