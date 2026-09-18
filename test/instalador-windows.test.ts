import { readFileSync } from "node:fs";
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
    expect(task).not.toContain("npm");
  });

  it("compila de forma portable y normaliza el nombre del instalador", () => {
    expect(build).toContain('process.env.ComSpec || "cmd.exe"');
    expect(build).toContain('["/d", "/s", "/c", "npm run build"]');
    expect(build).toContain('replace(/[^0-9A-Za-z._-]+/g, "-")');
    expect(build).toContain('rmSync(output, { recursive: true, force: true })');
    expect(build).toContain('LEEME-INSTALACION.txt');
  });
});
