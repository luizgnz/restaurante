import { describe, expect, it } from "vitest";
import {
  type BorradorOrden,
  cargarBorrador,
  claveBorrador,
  eliminarBorrador,
  guardarBorrador,
} from "../ui/src/lib/borradores.ts";

function memoriaStorage(): Storage {
  const datos = new Map<string, string>();
  return {
    get length() {
      return datos.size;
    },
    clear() {
      datos.clear();
    },
    getItem(key: string) {
      return datos.has(key) ? datos.get(key)! : null;
    },
    key(index: number) {
      return [...datos.keys()][index] ?? null;
    },
    removeItem(key: string) {
      datos.delete(key);
    },
    setItem(key: string, value: string) {
      datos.set(key, value);
    },
  };
}

function borradorEjemplo(parcial: Partial<BorradorOrden> = {}): BorradorOrden {
  return {
    version: 1,
    claveIdempotencia: "browser-uuid-1",
    lineas: [{ productoId: 10, cantidad: 2, nota: "sin cebolla" }],
    indicaciones: "urgente",
    actualizadoEn: "2026-08-22T12:00:00.000Z",
    ...parcial,
  };
}

describe("borradores localStorage", () => {
  it("genera claves separadas por contexto", () => {
    expect(claveBorrador({ tipo: "general" })).toBe("restaurante.borrador:general");
    expect(claveBorrador({ tipo: "mesa", mesaId: 7 })).toBe("restaurante.borrador:mesa:7");
    expect(claveBorrador({ tipo: "cuenta", cuentaId: 42 })).toBe("restaurante.borrador:cuenta:42");
  });

  it("guarda y carga un borrador", () => {
    const storage = memoriaStorage();
    const clave = claveBorrador({ tipo: "mesa", mesaId: 3 });
    const borrador = borradorEjemplo({ mesaId: 3 });

    guardarBorrador(storage, clave, borrador);
    expect(cargarBorrador(storage, clave)).toEqual(borrador);
  });

  it("mantiene claves independientes entre contextos", () => {
    const storage = memoriaStorage();
    const general = claveBorrador({ tipo: "general" });
    const mesa = claveBorrador({ tipo: "mesa", mesaId: 5 });
    const cuenta = claveBorrador({ tipo: "cuenta", cuentaId: 9 });

    guardarBorrador(storage, general, borradorEjemplo({ claveIdempotencia: "g1" }));
    guardarBorrador(storage, mesa, borradorEjemplo({ mesaId: 5, claveIdempotencia: "m5" }));
    guardarBorrador(
      storage,
      cuenta,
      borradorEjemplo({ cuentaId: 9, claveIdempotencia: "c9" }),
    );

    expect(cargarBorrador(storage, general)?.claveIdempotencia).toBe("g1");
    expect(cargarBorrador(storage, mesa)?.mesaId).toBe(5);
    expect(cargarBorrador(storage, cuenta)?.cuentaId).toBe(9);
  });

  it("conserva la clave de idempotencia tras recargar y volver a guardar", () => {
    const storage = memoriaStorage();
    const clave = claveBorrador({ tipo: "cuenta", cuentaId: 1 });
    const idempotencia = "persistente-uuid-abc";

    guardarBorrador(
      storage,
      clave,
      borradorEjemplo({ cuentaId: 1, claveIdempotencia: idempotencia, lineas: [] }),
    );
    const recargado = cargarBorrador(storage, clave);
    expect(recargado?.claveIdempotencia).toBe(idempotencia);

    guardarBorrador(storage, clave, {
      ...recargado!,
      lineas: [{ productoId: 1, cantidad: 1, nota: "" }],
      actualizadoEn: "2026-08-22T12:05:00.000Z",
    });
    expect(cargarBorrador(storage, clave)?.claveIdempotencia).toBe(idempotencia);
  });

  it("elimina el borrador tras un envío exitoso", () => {
    const storage = memoriaStorage();
    const clave = claveBorrador({ tipo: "general" });

    guardarBorrador(storage, clave, borradorEjemplo());
    eliminarBorrador(storage, clave);

    expect(cargarBorrador(storage, clave)).toBeNull();
    expect(storage.getItem(clave)).toBeNull();
  });

  it("devuelve null y limpia JSON malformado", () => {
    const storage = memoriaStorage();
    const clave = claveBorrador({ tipo: "mesa", mesaId: 2 });
    storage.setItem(clave, "{no es json");

    expect(cargarBorrador(storage, clave)).toBeNull();
    expect(storage.getItem(clave)).toBeNull();
  });

  it("devuelve null y limpia versiones incompatibles", () => {
    const storage = memoriaStorage();
    const clave = claveBorrador({ tipo: "general" });
    storage.setItem(
      clave,
      JSON.stringify({
        version: 2,
        claveIdempotencia: "x",
        lineas: [],
        indicaciones: "",
        actualizadoEn: "2026-08-22T12:00:00.000Z",
      }),
    );

    expect(cargarBorrador(storage, clave)).toBeNull();
    expect(storage.getItem(clave)).toBeNull();
  });

  it("conserva literalmente una clave de idempotencia con espacios", () => {
    const storage = memoriaStorage();
    const clave = claveBorrador({ tipo: "general" });
    const idempotencia = " browser-uuid-1 ";

    guardarBorrador(storage, clave, borradorEjemplo({ claveIdempotencia: idempotencia }));
    expect(cargarBorrador(storage, clave)?.claveIdempotencia).toBe(idempotencia);
  });

  it("rechaza y limpia una clave de idempotencia realmente vacía", () => {
    for (const idempotencia of ["", "   "]) {
      const storage = memoriaStorage();
      const clave = claveBorrador({ tipo: "cuenta", cuentaId: 3 });
      storage.setItem(
        clave,
        JSON.stringify({
          version: 1,
          claveIdempotencia: idempotencia,
          lineas: [],
          indicaciones: "",
          actualizadoEn: "2026-08-22T12:00:00.000Z",
        }),
      );

      expect(cargarBorrador(storage, clave)).toBeNull();
      expect(storage.getItem(clave)).toBeNull();
    }
  });

  it("rechaza y limpia una línea inválida aunque el resto sea válido", () => {
    const storage = memoriaStorage();
    const clave = claveBorrador({ tipo: "mesa", mesaId: 4 });
    storage.setItem(
      clave,
      JSON.stringify({
        version: 1,
        claveIdempotencia: "clave-valida",
        lineas: [{ productoId: "x", cantidad: 1, nota: "" }],
        indicaciones: "",
        actualizadoEn: "2026-08-22T12:00:00.000Z",
      }),
    );

    expect(cargarBorrador(storage, clave)).toBeNull();
    expect(storage.getItem(clave)).toBeNull();
  });

  it("acepta borrador vacío con líneas vacías", () => {
    const storage = memoriaStorage();
    const clave = claveBorrador({ tipo: "general" });
    const borrador = borradorEjemplo({ lineas: [], indicaciones: "" });

    guardarBorrador(storage, clave, borrador);
    expect(cargarBorrador(storage, clave)).toEqual(borrador);
  });
});
