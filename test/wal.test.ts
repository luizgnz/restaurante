import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrate } from "../src/db/migrate.ts";
import { openSalonDb } from "../src/db/open.ts";

describe("WAL", () => {
  it("abortar a mitad de transacción no deja pedido a medias", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rest-wal-"));
    mkdirSync(path.join(dir, "data"), { recursive: true });
    const file = path.join(dir, "data", "salon.sqlite");
    const db = openSalonDb(file, "linux");
    migrate(db);
    db.close();

    const fixture = fileURLToPath(new URL("./fixtures/abort-tx.ts", import.meta.url));
    const result = spawnSync(process.execPath, ["--import", "tsx", fixture, file], { encoding: "utf8" });
    expect(result.status).not.toBe(0);

    const reopened = openSalonDb(file, "linux");
    const n = reopened.prepare("SELECT count(*) AS c FROM pedidos").get() as { c: number };
    expect(n.c).toBe(0);
    expect(reopened.pragma("integrity_check", { simple: true })).toBe("ok");
    reopened.close();
  });
});
