import { useState, type FormEvent } from "react";

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
        <h1>Restaurante</h1>
        <p className="login-odoo__ayuda">Inicie sesión como administrador</p>
        <label>
          Usuario
          <input
            name="usuario"
            autoComplete="username"
            autoFocus
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
          />
        </label>
        <label>
          Contraseña
          <input
            name="contraseña"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="primario" type="submit">
          Iniciar sesión
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </section>
  );
}
