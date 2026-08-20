import { sign, verify, type KeyObject } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type LicensePayload = {
  localId: string;
  extras: { nube: boolean };
  caducidad: string;
};

export type LicenseFile = {
  payload: LicensePayload;
  sig: string;
};

export function signLicense(payload: LicensePayload, secretKey: KeyObject): LicenseFile {
  const data = Buffer.from(JSON.stringify(payload), "utf8");
  const sig = sign(null, data, secretKey);
  return { payload, sig: sig.toString("base64") };
}

export function verifyLicense(file: LicenseFile, publicKey: KeyObject): LicensePayload {
  const data = Buffer.from(JSON.stringify(file.payload), "utf8");
  const ok = verify(null, data, publicKey, Buffer.from(file.sig, "base64"));
  if (!ok) throw new Error("firma de licencia inválida");
  return file.payload;
}

export function licenseWarnings(payload: LicensePayload, now: Date): string[] {
  const warnings: string[] = [];
  const end = new Date(`${payload.caducidad}T00:00:00Z`);
  if (now.getTime() > end.getTime()) warnings.push("licencia_caducada");
  return warnings;
}

export function loadLicense(dir: string, publicKey: KeyObject): LicensePayload | null {
  const file = path.join(dir, "licencia.json");
  if (!existsSync(file)) return null;
  const parsed = JSON.parse(readFileSync(file, "utf8")) as LicenseFile;
  return verifyLicense(parsed, publicKey);
}
