import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";

export function montarUi(app: Hono, uiDist: string): boolean {
  if (!existsSync(path.join(uiDist, "index.html"))) return false;
  const html = () => readFileSync(path.join(uiDist, "index.html"), "utf8");
  app.get("/", (c) => c.html(html()));
  app.get("/index.html", (c) => c.html(html()));
  const root = path.relative(process.cwd(), uiDist) || ".";
  app.use("/*", serveStatic({ root }));
  return true;
}

export function abrirEnNavegador(url: string): void {
  if (process.env.RESTAURANTE_NO_OPEN === "1") return;
  if (process.platform === "darwin") spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  else if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  else spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}
