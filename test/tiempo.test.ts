import { describe, expect, it } from "vitest";
import { haceCuanto } from "../src/modules/tiempo.ts";

describe("haceCuanto", () => {
  it("dice Hace dos minutos", () => {
    const ahora = Date.parse("2026-08-20T12:10:00Z");
    expect(haceCuanto("2026-08-20T12:08:00Z", ahora)).toBe("Hace dos minutos");
    expect(haceCuanto("2026-08-20T12:09:00Z", ahora)).toBe("Hace un minuto");
    expect(haceCuanto("2026-08-20T12:09:50Z", ahora)).toBe("Hace un momento");
    expect(haceCuanto("2026-08-20T12:05:00Z", ahora)).toBe("Hace 5 minutos");
  });
});
