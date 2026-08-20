import { describe, expect, it } from "vitest";
import { dataDir, programDir, salonDbPath } from "../src/paths.ts";

describe("paths", () => {
  it("usa RESTAURANTE_DATA_DIR cuando está definido", () => {
    const env = { RESTAURANTE_DATA_DIR: "/tmp/rest-test" };
    expect(dataDir(env, "darwin")).toBe("/tmp/rest-test");
    expect(salonDbPath(env, "darwin")).toBe("/tmp/rest-test/data/salon.sqlite");
  });

  it("en darwin usa Application Support si no hay override", () => {
    expect(dataDir({}, "darwin")).toBe("/Library/Application Support/Restaurante");
    expect(programDir({}, "darwin")).toBe("/usr/local/restaurante");
  });

  it("en win32 usa ProgramData si no hay override", () => {
    const env = { PROGRAMDATA: "C:\\ProgramData", PROGRAMFILES: "C:\\Program Files" };
    expect(dataDir(env, "win32")).toBe("C:\\ProgramData\\Restaurante");
    expect(programDir(env, "win32")).toBe("C:\\Program Files\\Restaurante");
  });

  it("nunca resuelve la BD desde cwd", () => {
    const env = { RESTAURANTE_DATA_DIR: "/var/restaurante" };
    expect(salonDbPath(env, "darwin")).not.toContain(process.cwd());
  });
});
