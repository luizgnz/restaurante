import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe("compilación de la interfaz", () => {
  it("usa TypeScript 7 nativo y comprueba tipos en todas las rutas de build", () => {
    expect(manifest.devDependencies.typescript).toMatch(/^\^7\./);
    expect(manifest.scripts.typecheck).toBe("tsc -p tsconfig.json --noEmit");
    expect(manifest.scripts.build).toContain("npm run typecheck && vite build");
    expect(manifest.scripts["build:ui"]).toBe("npm run build");
    expect(manifest.scripts.start).toContain("npm run build:ui");
  });
});
