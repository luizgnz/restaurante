import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const installerDir = join(root, "installer", "windows");
const stage = join(installerDir, "stage");
const output = join(installerDir, "output");
const rawVersion = process.env.RESTAURANTE_VERSION || "0.1.0";
const version = rawVersion.replace(/[^0-9A-Za-z._-]+/g, "-");
const npmCommand = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npm";
const npmArgs = process.platform === "win32" ? ["/d", "/s", "/c", "npm run build"] : ["run", "build"];

function run(command, args, options = {}) {
  execFileSync(command, args, { cwd: root, stdio: "inherit", ...options });
}

run(npmCommand, npmArgs);
mkdirSync(stage, { recursive: true });
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
run("go", ["build", "-buildvcs=false", "-trimpath", "-ldflags", "-s -w", "-o", join(stage, "restaurante.exe"), "./go/cmd/restaurante"], {
  env: { ...process.env, GOOS: "windows", GOARCH: "amd64", CGO_ENABLED: "0" },
});
cpSync(join(root, "ui", "dist"), join(stage, "ui"), { recursive: true });
cpSync(join(root, "src", "db", "migrations"), join(stage, "migrations"), { recursive: true });
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const candidates = [process.env.ISCC_PATH, "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe", "C:\\Program Files\\Inno Setup 6\\ISCC.exe"].filter(Boolean);
const iscc = candidates.find((path) => existsSync(path));
if (!iscc) {
  console.log(`Paquete Windows preparado en ${stage}. Instale Inno Setup 6 para generar el Setup.exe.`);
  process.exit(0);
}
run(iscc, [join(installerDir, "Restaurante.iss")], { cwd: installerDir, env: { ...process.env, RESTAURANTE_VERSION: version } });
copyFileSync(join(installerDir, "LEEME-INSTALACION.txt"), join(output, "LEEME-INSTALACION.txt"));
console.log(`Instalador generado en ${output}`);
