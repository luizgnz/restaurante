import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { montarUi } from "../src/http/ui.ts";

describe("UI servida", () => {
  it("GET / entrega el HTML de Restaurante", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rest-ui-"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>Restaurante</title><h1>Restaurante</h1>");
    const app = new Hono();
    expect(montarUi(app, dir)).toBe(true);
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Restaurante");
  });
});
