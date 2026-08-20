import { describe, expect, it } from "vitest";
import { available } from "../src/modules/inventario/cifras.ts";
import { firmar, reservarPorEnvio } from "../src/modules/inventario/asientos.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { openTestDb } from "./helpers.ts";

describe("inventario", () => {
  it("default: enviar reserva, precuenta no firma, caja firma", () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    const politica = "reserva_al_enviar_firme_al_enviar_caja" as const;
    const lineas = [{ productoId: ids.hamburguesa, cantidad: 5 }];

    reservarPorEnvio(db, lineas, politica);
    const panTrasReserva = db.prepare("SELECT on_hand_real, reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as {
      on_hand_real: number;
      reserved_real: number;
    };
    expect(panTrasReserva.on_hand_real).toBe(20);
    expect(panTrasReserva.reserved_real).toBe(5);
    expect(available(panTrasReserva.on_hand_real, panTrasReserva.reserved_real)).toBe(15);

    firmar(db, lineas, "precuenta", politica);
    const panTrasPrecuenta = db.prepare("SELECT on_hand_real, reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as {
      on_hand_real: number;
      reserved_real: number;
    };
    expect(panTrasPrecuenta.on_hand_real).toBe(20);
    expect(panTrasPrecuenta.reserved_real).toBe(5);

    firmar(db, lineas, "caja", politica);
    const panTrasCaja = db.prepare("SELECT on_hand_real, reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as {
      on_hand_real: number;
      reserved_real: number;
    };
    expect(panTrasCaja.on_hand_real).toBe(15);
    expect(panTrasCaja.reserved_real).toBe(0);
    db.close();
  });

  it("descuento_al_enviar baja on_hand al enviar", () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    reservarPorEnvio(db, [{ productoId: ids.hamburguesa, cantidad: 5 }], "descuento_al_enviar");
    const pan = db.prepare("SELECT on_hand_real, reserved_real FROM stock WHERE producto_id = ?").get(ids.pan) as {
      on_hand_real: number;
      reserved_real: number;
    };
    expect(pan.on_hand_real).toBe(15);
    expect(pan.reserved_real).toBe(0);
    db.close();
  });
});
