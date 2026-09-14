import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const inno = readFileSync("installer/windows/Restaurante.iss", "utf8");
const backup = readFileSync("installer/windows/prepare-update.ps1", "utf8");
const rollback = readFileSync("installer/windows/rollback-update.ps1", "utf8");
const task = readFileSync("installer/windows/register-task.ps1", "utf8");

describe("instalador Windows", () => {
  it("valida la instalación y restaura la versión anterior si falla", () => {
    expect(inno).toContain("-verify-install");
    expect(inno).toContain("rollback-update.ps1");
    expect(inno).toContain("RaiseException");
    expect(rollback).toContain("salon.sqlite");
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
});
