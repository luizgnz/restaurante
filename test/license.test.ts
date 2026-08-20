import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { licenseWarnings, signLicense, verifyLicense } from "../src/license.ts";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

describe("license", () => {
  const payload = { localId: "local-1", extras: { nube: false }, caducidad: "2099-01-01" };

  it("acepta firma válida", () => {
    const file = signLicense(payload, privateKey);
    expect(verifyLicense(file, publicKey)).toEqual(payload);
  });

  it("rechaza firma inválida", () => {
    const file = signLicense(payload, privateKey);
    file.sig = Buffer.alloc(64).toString("base64");
    expect(() => verifyLicense(file, publicKey)).toThrow(/firma/i);
  });

  it("caducada no bloquea: verify ok y warning", () => {
    const p = { ...payload, caducidad: "2020-01-01" };
    const file = signLicense(p, privateKey);
    expect(verifyLicense(file, publicKey).localId).toBe("local-1");
    expect(licenseWarnings(p, new Date("2026-08-20"))).toContain("licencia_caducada");
  });
});
