import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const inno = readFileSync("installer/windows/Restaurante.iss", "utf8");
const backup = readFileSync("installer/windows/prepare-update.ps1", "utf8");
const rollback = readFileSync("installer/windows/rollback-update.ps1", "utf8");
const task = readFileSync("installer/windows/register-task.ps1", "utf8");
const build = readFileSync("scripts/build-windows-installer.mjs", "utf8");

describe("instalador Windows", () => {
  it("valida la instalación y restaura la versión anterior si falla", () => {
    expect(inno).toContain("-verify-install");
    expect(inno).toContain("rollback-update.ps1");
    expect(inno).toContain("HadPreviousInstall := PreviousInstallExists");
    expect(inno).toContain("Era una primera instalación: no había una base anterior que restaurar");
    expect(inno).toContain("RaiseException");
    expect(rollback).toContain("salon.sqlite");
  });

  it("no ejecuta el motor ni scripts del instalador desde la carpeta temporal", () => {
    expect(inno).toContain("UseSetupLdr=no");
    expect(inno).toContain('Source: "prepare-update.ps1"; DestDir: "{app}\\installer"');
    expect(inno).not.toContain("ExtractTemporaryFile('prepare-update.ps1')");
    expect(inno).not.toContain("{tmp}\\prepare-update.ps1");
  });

  it("conserva solo los tres respaldos automáticos de actualización", () => {
    expect(backup).toContain("Select-Object -Skip 3");
    expect(backup).toContain("active-backup.txt");
  });

  it("preserva los datos al desinstalar", () => {
    expect(inno).not.toContain('Name: "{commonappdata}\\Restaurante"; Type: filesandordirs');
    expect(inno).toContain("[UninstallRun]");
  });

  it("registra el servidor local al iniciar Windows sin depender de npm", () => {
    expect(task).toContain("New-ScheduledTaskAction");
    expect(task).toContain("restaurante.exe");
    expect(task).toContain("Invoke-RestMethod -Uri $url");
    expect(inno).toContain("StartedOK := RunPowerShell('register-task.ps1'");
    expect(task).not.toContain("npm");
  });

  it("compila de forma portable y normaliza el nombre del instalador", () => {
    expect(build).toContain('process.env.ComSpec || "cmd.exe"');
    expect(build).toContain('["/d", "/s", "/c", "npm run build"]');
    expect(build).toContain('replace(/[^0-9A-Za-z._-]+/g, "-")');
    expect(build).toContain('rmSync(output, { recursive: true, force: true })');
    expect(build).toContain('LEEME-INSTALACION.txt');
    expect(build).toContain('"-buildvcs=false"');
  });

  it.skipIf(process.platform !== "win32")("restaura el programa y SQLite sin dejar archivos de la actualización fallida", () => {
    const root = mkdtempSync(join(tmpdir(), "restaurante-rollback-"));
    try {
      const install = join(root, "install");
      const data = join(root, "data-root");
      const point = join(data, "backups", "updates", "snapshot");
      mkdirSync(install, { recursive: true });
      mkdirSync(join(data, "data"), { recursive: true });
      mkdirSync(join(point, "app"), { recursive: true });
      mkdirSync(join(point, "data"), { recursive: true });

      writeFileSync(join(install, "restaurante.exe"), "NEW");
      writeFileSync(join(install, "new-only.txt"), "EXTRA");
      writeFileSync(join(data, "data", "salon.sqlite"), "NEWDB");
      writeFileSync(join(data, "data", "salon.sqlite-wal"), "STALE");
      writeFileSync(join(data, "data", "salon.sqlite-shm"), "STALE");
      writeFileSync(join(point, "app", "restaurante.exe"), "OLD");
      writeFileSync(join(point, "data", "salon.sqlite"), "OLDDB");
      writeFileSync(join(data, "backups", "updates", "active-backup.txt"), point);

      execFileSync("powershell.exe", [
        "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
        join(process.cwd(), "installer", "windows", "rollback-update.ps1"),
        "-InstallDir", install, "-DataDir", data,
      ], { timeout: 30_000 });

      expect(readFileSync(join(install, "restaurante.exe"), "utf8")).toBe("OLD");
      expect(readFileSync(join(data, "data", "salon.sqlite"), "utf8")).toBe("OLDDB");
      expect(existsSync(join(install, "new-only.txt"))).toBe(false);
      expect(existsSync(join(data, "data", "salon.sqlite-wal"))).toBe(false);
      expect(existsSync(join(data, "data", "salon.sqlite-shm"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 15_000);
});
