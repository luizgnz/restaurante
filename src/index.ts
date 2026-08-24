import path from "node:path";
import { fileURLToPath } from "node:url";
import { dataDir, salonDbPath } from "./paths.ts";
import { loadConfig } from "./config.ts";
import { openSalonDb } from "./db/open.ts";
import { migrate } from "./db/migrate.ts";
import { createApp } from "./http/app.ts";
import { escucharHttp, urlLocal } from "./http/listen.ts";
import { montarUi, abrirEnNavegador } from "./http/ui.ts";
import { asegurarCuentaAdmin, crearEmpleado } from "./modules/empleados/empleados.ts";
import { cerrarSesion } from "./modules/empleados/sesion.ts";
import { migrarPedidosACuentas } from "./modules/migracion/pedidos-a-cuentas.ts";
import { seedCartaDemo, asegurarPlanoDemo, asegurarProductosDemo } from "./modules/productos/seed.ts";
import { ConfigurablePrinter } from "./print/network.ts";

async function seedSiVacio(db: ReturnType<typeof openSalonDb>): Promise<void> {
  const n = db.prepare("SELECT count(*) AS c FROM empleados").get() as { c: number };
  if (n.c > 0) return;
  seedCartaDemo(db);
  await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
  await crearEmpleado(db, {
    nombre: "Jefa",
    pin: "2222",
    derecho: "avanzado",
    usuario: "admin",
    password: "admin",
  });
}

const dir = dataDir();
const cfg = loadConfig(dir);
const db = openSalonDb(salonDbPath());
migrate(db);
const conversion = migrarPedidosACuentas(db, dir, cfg);
if (conversion.errores.length > 0) {
  throw new Error(`No se pudieron convertir los pedidos existentes: ${conversion.errores.join("; ")}`);
}
await seedSiVacio(db);
await asegurarCuentaAdmin(db);
asegurarPlanoDemo(db);
asegurarProductosDemo(db);
cerrarSesion(db);

const app = createApp({ db, config: cfg, printer: new ConfigurablePrinter(cfg), dataDir: dir });
const uiDist = path.join(path.dirname(fileURLToPath(import.meta.url)), "../ui/dist");
const uiOk = montarUi(app, uiDist);
if (!uiOk) {
  console.error("No está la UI compilada (ui/dist). Ejecuta npm run build.");
}
try {
  const { mensaje, puerto } = await escucharHttp({
    fetch: app.fetch,
    puerto: cfg.puerto,
    hostname: cfg.servidor_red_habilitado ? "0.0.0.0" : "127.0.0.1",
  });
  const url = urlLocal(puerto);
  console.log(mensaje);
  console.log("Login administrador: usuario admin / contraseña admin");
  if (uiOk) abrirEnNavegador(url);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
