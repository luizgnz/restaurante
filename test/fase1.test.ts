import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { dinero, fechaCorta } from "../src/modules/formato.ts";
import { haceCuanto } from "../src/modules/tiempo.ts";
import { ComandaEnPantalla } from "../ui/src/pantallas/ComandaEnPantalla.tsx";
import { ConstructorOrden } from "../ui/src/pantallas/ConstructorOrden.tsx";
import { cargarBorrador, guardarBorrador, type BorradorOrden } from "../ui/src/lib/borradores.ts";
import { defaultConfig } from "../src/config.ts";
import { codigoDe, entornoApi, post } from "./helpers.ts";

function borradorDeEjemplo(): BorradorOrden {
  return {
    version: 1,
    claveIdempotencia: "fase1-1",
    lineas: [
      { productoId: 1, cantidad: 2, nota: "", adicionalCentavos: 500 },
      { productoId: 2, cantidad: 1, nota: "" },
    ],
    indicaciones: "",
    actualizadoEn: new Date(0).toISOString(),
  };
}

describe("fase 1 · formato compartido", () => {
  it("formatea dinero con separador de miles es-CL", () => {
    expect(dinero(8900)).toBe("$8.900");
    expect(dinero(43700)).toBe("$43.700");
    expect(dinero(0)).toBe("$0");
  });

  it("formatea fechas cortas legibles", () => {
    const texto = fechaCorta(new Date(2026, 7, 28, 14, 50).toISOString());
    expect(texto).toContain("28");
    expect(texto).toContain("14:50");
    expect(texto).toContain("2026");
  });

  it("describe esperas largas en días, no en horas", () => {
    const hace = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    expect(haceCuanto(hace)).toBe("Hace 8 días");
    expect(haceCuanto(new Date(Date.now() - 30 * 60000).toISOString())).toBe("Hace 30 minutos");
  });
});

describe("fase 1 · borrador con adicional de contornos", () => {
  it("conserva el adicional al guardar y cargar", () => {
    const storage = {
      getItem: (k: string) => (k in datos ? datos[k] : null),
      setItem: (k: string, v: string) => {
        datos[k] = v;
      },
      removeItem: (k: string) => delete datos[k],
    } as unknown as Storage;
    const datos: Record<string, string> = {};
    guardarBorrador(storage, "test", borradorDeEjemplo());
    const cargado = cargarBorrador(storage, "test");
    expect(cargado?.lineas[0].adicionalCentavos).toBe(500);
    expect(cargado?.lineas[1].adicionalCentavos).toBeUndefined();
  });

  it("descarta borradores con adicional inválido", () => {
    const storage = {
      getItem: (k: string) => (k in datos ? datos[k] : null),
      setItem: (k: string, v: string) => {
        datos[k] = v;
      },
      removeItem: (k: string) => delete datos[k],
    } as unknown as Storage;
    const datos: Record<string, string> = {};
    const malo = borradorDeEjemplo();
    (malo.lineas[0] as { adicionalCentavos: number }).adicionalCentavos = -5;
    guardarBorrador(storage, "test", malo);
    expect(cargarBorrador(storage, "test")).toBeNull();
  });
});

describe("fase 1 · resumen con precios", () => {
  const props = {
    mesaFija: { id: 7, numero: 7 },
    productos: [
      { id: 1, nombre: "Hamburguesa", precio_centavos: 8900, armable: 0 },
      { id: 2, nombre: "Café", precio_centavos: 1800, armable: 0 },
    ],
    onCambiar: () => undefined,
    onEnviar: async () => undefined,
    onCancelar: () => undefined,
  };

  it("muestra el precio de cada línea y el total estimado", () => {
    const html = renderToStaticMarkup(
      createElement(ConstructorOrden, {
        ...props,
        borrador: {
          version: 1,
          claveIdempotencia: "f1",
          lineas: borradorDeEjemplo().lineas.map((l, i) => ({ ...l, productoId: i === 0 ? 1 : 2 })),
          indicaciones: "",
          actualizadoEn: new Date(0).toISOString(),
        },
      }),
    );
    expect(html).toContain("$18.800");
    expect(html).toContain("$1.800");
    expect(html).toContain("Total estimado");
    expect(html).toContain("Enviar · $20.600");
  });

  it("sin líneas no muestra total", () => {
    const html = renderToStaticMarkup(
      createElement(ConstructorOrden, {
        ...props,
        borrador: { version: 1, claveIdempotencia: "f1", lineas: [], indicaciones: "", actualizadoEn: new Date(0).toISOString() },
      }),
    );
    expect(html).not.toContain("Total estimado");
  });
});

describe("fase 1 · comanda legible", () => {
  it("separa los contornos con puntos medios", () => {
    const html = renderToStaticMarkup(
      createElement(ComandaEnPantalla, {
        restaurante: "Restaurante",
        comanda: {
          mesaNumero: 1,
          ordenNumero: 3,
          mesero: "Ana",
          indicaciones: null,
          lineas: [
            {
              nombre: "Menú del día",
              cantidad: 1,
              nota: null,
              contornos: ["Proteína: Carne", "Contorno: Papas fritas", "Segundo contorno: Arroz", "Segundo contorno: Ensalada rusa"],
            },
          ],
        },
        onCerrar: () => undefined,
      }),
    );
    expect(html).toContain("Proteína: Carne · Contorno: Papas fritas");
    expect(html).not.toContain("CarneContorno");
  });
});

describe("fase 1 · atribución y PIN configurable", () => {
  it("la respuesta del envío atribuye la orden a quien firmó el PIN", async () => {
    const e = await entornoApi();
    const res = await post(e.app, "/api/ordenes", {
      mesaId: e.ids.mesa7,
      claveIdempotencia: "fase1-mesero",
      pin: "1234",
      lineas: [{ productoId: e.ids.hamburguesa, cantidad: 1 }],
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { mesero: string };
    expect(body.mesero).toBe("Ana");
    e.db.close();
  });

  it("sin pin_al_emitir_precuenta la precuenta sale solo con la sesión", async () => {
    const e = await entornoApi({ ...defaultConfigSinPinPrecuenta() });
    const orden = await post(e.app, "/api/ordenes", {
      mesaId: e.ids.mesa7,
      claveIdempotencia: "fase1-pin",
      pin: "1234",
      lineas: [{ productoId: e.ids.hamburguesa, cantidad: 1 }],
    });
    const { cuentaId } = (await orden.json()) as { cuentaId: number };
    await post(e.app, "/api/sesion/abrir", { usuario: "admin", password: "admin" });
    const res = await post(e.app, `/api/cuentas/${cuentaId}/precuenta`, {});
    expect(res.status).toBe(201);
    e.db.close();
  });

  it("con pin_al_emitir_precuenta el backend exige el PIN aunque la UI no lo mande", async () => {
    const e = await entornoApi();
    const orden = await post(e.app, "/api/ordenes", {
      mesaId: e.ids.mesa7,
      claveIdempotencia: "fase1-pin2",
      pin: "1234",
      lineas: [{ productoId: e.ids.hamburguesa, cantidad: 1 }],
    });
    const { cuentaId } = (await orden.json()) as { cuentaId: number };
    await post(e.app, "/api/sesion/abrir", { usuario: "admin", password: "admin" });
    const res = await post(e.app, `/api/cuentas/${cuentaId}/precuenta`, {});
    expect(res.status).toBe(403);
    expect(await codigoDe(res)).toBe("credenciales_invalidas");
    e.db.close();
  });

  it("reimprime la precuenta vigente de la cuenta", async () => {
    const e = await entornoApi();
    const orden = await post(e.app, "/api/ordenes", {
      mesaId: e.ids.mesa7,
      claveIdempotencia: "fase1-reimp",
      pin: "1234",
      lineas: [{ productoId: e.ids.hamburguesa, cantidad: 1 }],
    });
    const { cuentaId } = (await orden.json()) as { cuentaId: number };
    await post(e.app, `/api/cuentas/${cuentaId}/precuenta`, { pin: "1234" });
    const res = await post(e.app, `/api/cuentas/${cuentaId}/precuenta/reimprimir`, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { numero: number; snapshot: { totalCentavos: number } };
    expect(body.numero).toBe(1);
    expect(body.snapshot.totalCentavos).toBe(8900);
    const trabajos = e.db
      .prepare("SELECT count(*) AS c FROM print_jobs WHERE kind = 'precuenta'")
      .get() as { c: number };
    expect(trabajos.c).toBeGreaterThanOrEqual(2);
    e.db.close();
  });
});

function defaultConfigSinPinPrecuenta() {
  const cfg = defaultConfig();
  return { ...cfg, pin_al_emitir_precuenta: false };
}
