import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";

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
    <section className="flex min-h-full items-center justify-center bg-background p-4 sm:p-6">
      <Card className="w-full max-w-[380px]">
        <CardContent className="p-6 pt-6">
          <p className="m-0 text-xs font-medium tracking-[0.1em] text-muted-foreground uppercase">
            Sistema de restaurante
          </p>
          <h1 className="m-0 mt-2 text-xl font-semibold tracking-[-0.02em] text-foreground">
            Iniciar sesión
          </h1>
          <p className="m-0 mt-1 mb-6 text-sm text-muted-foreground">
            Usa el usuario y la contraseña de tu cuenta.
          </p>

          <form className="flex flex-col gap-4" onSubmit={enviar}>
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

            {error ? (
              <p
                role="alert"
                className="m-0 rounded-lg bg-[var(--destructive-soft)] px-3 py-2 text-sm text-[var(--destructive)]"
              >
                {error}
              </p>
            ) : null}

            <Button type="submit" className="mt-1 w-full">
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
