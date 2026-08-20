import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("licenses", () => {
  it("todas las dependencias directas son MIT/Apache/ISC/BSD", () => {
    const result = spawnSync("npm", ["run", "licenses"], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/ok /);
  });
});
