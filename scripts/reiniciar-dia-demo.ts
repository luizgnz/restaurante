/**
 * Reinicia el día de demostración usando el mismo servicio que el botón de
 * Administración. El servidor hace el respaldo, limpia el movimiento, abre
 * una jornada nueva y deja la auditoría; este cliente nunca abre SQLite.
 *
 * Uso: node --import tsx scripts/reiniciar-dia-demo.ts [usuario password]
 */

const BASE = process.env.BASE ?? "http://127.0.0.1:8081";
const [usuario = "admin", password = "admin"] = process.argv.slice(2);

const login = await fetch(`${BASE}/api/sesion/abrir`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ usuario, password }),
});
if (!login.ok) throw new Error(`No se pudo iniciar sesión (${login.status}): ${await login.text()}`);
const cookie = login.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("El servidor no devolvió la cookie de sesión");

const respuesta = await fetch(`${BASE}/api/jornadas/demo/reiniciar`, {
  method: "POST",
  headers: { cookie },
});
const resultado = await respuesta.json().catch(() => null) as
  | { cuentas?: number; jornadaId?: number; respaldoRuta?: string; error?: string }
  | null;
if (!respuesta.ok) {
  throw new Error(`No se pudo reiniciar (${respuesta.status}): ${resultado?.error ?? "error desconocido"}`);
}

console.log(`día de demostración reiniciado: ${resultado?.cuentas} cuentas en la jornada #${resultado?.jornadaId}`);
console.log(`respaldo previo: ${resultado?.respaldoRuta}`);
