import { describe, expect, it } from "vitest";
import { defaultConfig, type AppConfig, type PoliticaInventario } from "../src/config.ts";
import { obtenerCuenta } from "../src/modules/cuentas/cuentas.ts";
import { totalEfectivoCuenta } from "../src/modules/cuentas/totales.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import {
  ajustarConsumoDeCorreccion,
  firmaReservaEn,
  firmarReservadoDeCuenta,
  pendienteDeFirmar,
  type PendienteDeFirmar,
} from "../src/modules/inventario/asientos.ts";
import {
  avanzarEtapa,
  eventosDeCorreccion,
  ETAPAS_CANCELABLES,
  ETAPAS_TERMINALES,
  ETAPA_AVISO,
} from "../src/modules/kds/kds.ts";
import {
  calcularDiferencias,
  corregirOrden,
  indicacionesEfectivasOrden,
  type CambioOrdenInput,
  type EntradaCorreccion,
} from "../src/modules/ordenes/correcciones.ts";
import { enviarOrden } from "../src/modules/ordenes/enviar.ts";
import { versionEfectivaOrden, type LineaEfectiva, type NuevaLineaOrden } from "../src/modules/ordenes/ordenes.ts";
import { seedCartaDemo, type SeedIds } from "../src/modules/productos/seed.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { openTestDb } from "./helpers.ts";

type Db = ReturnType<typeof openTestDb>;

type Escenario = {
  db: Db;
  ids: SeedIds;
  cuentaId: number;
  ordenId: number;
  lineas: LineaEfectiva[];
};

let contadorClaves = 0;
function nuevaClave(): string {
  contadorClaves += 1;
  return `correccion-${contadorClaves}`;
}

async function ordenEnviada(
  productos: (ids: SeedIds) => NuevaLineaOrden[],
  cfg: AppConfig = defaultConfig(),
  indicaciones: string | null = null,
): Promise<Escenario> {
  const db = openTestDb();
  const ids = seedCartaDemo(db);
  await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
  const envio = await enviarOrden(
    db,
    {
      mesaId: ids.mesa7,
      empleadoId: 1,
      claveIdempotencia: "envio-base",
      indicaciones,
      lineas: productos(ids),
    },
    new MemoryPrinter(),
    cfg,
  );
  return {
    db,
    ids,
    cuentaId: envio.cuentaId,
    ordenId: envio.ordenId,
    lineas: versionEfectivaOrden(db, envio.ordenId),
  };
}

type EntradaTest = Omit<EntradaCorreccion, "claveIdempotencia" | "pin"> & {
  claveIdempotencia?: string;
  pin?: string;
};

function corregir(
  db: Db,
  entrada: EntradaTest,
  printer: MemoryPrinter = new MemoryPrinter(),
  cfg: AppConfig = defaultConfig(),
) {
  return corregirOrden(
    db,
    { pin: "1234", claveIdempotencia: nuevaClave(), ...entrada },
    printer,
    cfg,
  );
}

function cambio(linea: LineaEfectiva, cantidad: number, nota?: string | null): CambioOrdenInput {
  return {
    lineaClave: linea.lineaClave,
    productoId: linea.productoId,
    ordenLineaId: linea.ordenLineaId,
    cantidad,
    nota: nota === undefined ? linea.nota : nota,
  };
}

function ticket(printer: MemoryPrinter): string {
  return printer.chunks.map((c) => new TextDecoder().decode(c)).join("");
}

function reserva(db: Db, productoId: number): number {
  const row = db.prepare("SELECT reserved_real FROM stock WHERE producto_id = ?").get(productoId) as
    | { reserved_real: number }
    | undefined;
  return row?.reserved_real ?? 0;
}

function onHand(db: Db, productoId: number): number {
  const row = db.prepare("SELECT on_hand_real FROM stock WHERE producto_id = ?").get(productoId) as
    | { on_hand_real: number }
    | undefined;
  return row?.on_hand_real ?? 0;
}

function libro(
  db: Db,
  ordenId: number,
  lineaClave: string,
  productoId: number,
): { cantidadPorUnidad: number; reservada: number; firmada: number } | undefined {
  const fila = db
    .prepare(
      `SELECT cantidad_por_unidad, reservada_real, firmada_real FROM orden_linea_inventario
       WHERE orden_id = ? AND linea_clave = ? AND producto_id = ?`,
    )
    .get(ordenId, lineaClave, productoId) as
    | { cantidad_por_unidad: number; reservada_real: number; firmada_real: number }
    | undefined;
  if (!fila) return undefined;
  return {
    cantidadPorUnidad: fila.cantidad_por_unidad,
    reservada: fila.reservada_real,
    firmada: fila.firmada_real,
  };
}

function contar(db: Db, tabla: string): number {
  return (db.prepare(`SELECT count(*) AS c FROM ${tabla}`).get() as { c: number }).c;
}

function etapaDeOrdenLinea(db: Db, ordenLineaId: number | null): string {
  return (db.prepare("SELECT etapa FROM comanda_lineas WHERE orden_linea_id = ?").get(ordenLineaId) as {
    etapa: string;
  }).etapa;
}

function etapasDeCorreccion(db: Db, correccionId: number): string[] {
  return (
    db
      .prepare(
        `SELECT cl.etapa FROM comanda_lineas cl
         JOIN orden_correccion_lineas ocl ON ocl.id = cl.orden_correccion_linea_id
         WHERE ocl.correccion_id = ? ORDER BY cl.id`,
      )
      .all(correccionId) as { etapa: string }[]
  ).map((r) => r.etapa);
}

describe("calcularDiferencias", () => {
  const base: LineaEfectiva = {
    lineaClave: "h-a",
    ordenLineaId: 10,
    productoId: 5,
    nombre: "Hamburguesa",
    cantidad: 2,
    precioCentavos: 8900,
    nota: null,
    contornos: [],
  };

  it("informa el delta negativo de una reducción", () => {
    const diffs = calcularDiferencias([base], [{ lineaClave: "h-a", productoId: 5, cantidad: 1 }]);
    expect(diffs).toEqual([
      {
        lineaClave: "h-a",
        ordenLineaId: 10,
        productoId: 5,
        nombre: "Hamburguesa",
        delta: -1,
        cantidadAnterior: 2,
        cantidadNueva: 1,
        notaAnterior: null,
        notaNueva: null,
      },
    ]);
  });

  it("informa el delta positivo de un aumento", () => {
    const diffs = calcularDiferencias([base], [{ lineaClave: "h-a", productoId: 5, cantidad: 5 }]);
    expect(diffs[0]).toMatchObject({ delta: 3, cantidadAnterior: 2, cantidadNueva: 5 });
  });

  it("informa un cambio de nota aunque la cantidad no cambie", () => {
    const diffs = calcularDiferencias([base], [{ lineaClave: "h-a", productoId: 5, cantidad: 2, nota: "sin cebolla" }]);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({ delta: 0, notaAnterior: null, notaNueva: "sin cebolla" });
  });

  it("omite las líneas sin cambio de cantidad ni de nota", () => {
    expect(calcularDiferencias([base], [{ lineaClave: "h-a", productoId: 5, cantidad: 2 }])).toEqual([]);
  });

  it("trata una lineaClave desconocida como línea agregada desde cero", () => {
    const diffs = calcularDiferencias([base], [
      { lineaClave: "nueva-j", productoId: 9, cantidad: 2, nombre: "Jugo" },
    ]);
    expect(diffs).toEqual([
      {
        lineaClave: "nueva-j",
        ordenLineaId: null,
        productoId: 9,
        nombre: "Jugo",
        delta: 2,
        cantidadAnterior: 0,
        cantidadNueva: 2,
        notaAnterior: null,
        notaNueva: null,
      },
    ]);
  });

  it("no toca las líneas que el input no menciona", () => {
    const otra: LineaEfectiva = { ...base, lineaClave: "j-a", productoId: 9, nombre: "Jugo", cantidad: 3 };
    const diffs = calcularDiferencias([base, otra], [{ lineaClave: "j-a", productoId: 9, cantidad: 1 }]);
    expect(diffs.map((d) => d.lineaClave)).toEqual(["j-a"]);
  });

  it("normaliza notas en blanco a null", () => {
    const conNota: LineaEfectiva = { ...base, nota: "sin cebolla" };
    const diffs = calcularDiferencias([conNota], [{ lineaClave: "h-a", productoId: 5, cantidad: 2, nota: "   " }]);
    expect(diffs[0]).toMatchObject({ notaAnterior: "sin cebolla", notaNueva: null });
  });
});

describe("corregirOrden", () => {
  it("nunca modifica las filas originales de la orden", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.hamburguesa, cantidad: 2, nota: "sin cebolla" }]);
    const antes = e.db
      .prepare("SELECT id, cantidad, precio_centavos, nota, linea_clave FROM orden_lineas WHERE orden_id = ?")
      .all(e.ordenId);

    await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 1)] });

    expect(
      e.db
        .prepare("SELECT id, cantidad, precio_centavos, nota, linea_clave FROM orden_lineas WHERE orden_id = ?")
        .all(e.ordenId),
    ).toEqual(antes);
    expect(versionEfectivaOrden(e.db, e.ordenId)[0]).toMatchObject({ cantidad: 1, nota: "sin cebolla" });
    expect(contar(e.db, "orden_correcciones")).toBe(1);
    e.db.close();
  });

  it("de 2 a 1 imprime «- 1 Hamburguesa» y guarda la corrección", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.hamburguesa, cantidad: 2 }]);
    const printer = new MemoryPrinter();

    const result = await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 1)] }, printer);

    expect(result.correccionId).toBeGreaterThan(0);
    expect(result.comandaId).toBeGreaterThan(0);
    expect(result.repetida).toBe(false);
    const texto = ticket(printer);
    expect(texto).toContain("CORRECCIÓN · Mesa 7 · Orden 1");
    expect(texto).toContain("- 1 Hamburguesa");
    expect(texto).not.toContain("+ ");
    const fila = e.db
      .prepare(
        `SELECT cantidad_anterior, cantidad_nueva, linea_clave, orden_linea_id, precio_centavos
         FROM orden_correccion_lineas WHERE correccion_id = ?`,
      )
      .get(result.correccionId) as {
      cantidad_anterior: number;
      cantidad_nueva: number;
      linea_clave: string;
      orden_linea_id: number | null;
      precio_centavos: number;
    };
    expect(fila).toEqual({
      cantidad_anterior: 2,
      cantidad_nueva: 1,
      linea_clave: e.lineas[0].lineaClave,
      orden_linea_id: e.lineas[0].ordenLineaId,
      precio_centavos: 8900,
    });
    expect((e.db.prepare("SELECT estado FROM ordenes WHERE id = ?").get(e.ordenId) as { estado: string }).estado).toBe(
      "corregida",
    );
    const comanda = e.db.prepare("SELECT tipo, orden_id, correccion_id FROM comandas WHERE id = ?").get(
      result.comandaId,
    ) as { tipo: string; orden_id: number; correccion_id: number };
    expect(comanda).toEqual({ tipo: "correccion", orden_id: e.ordenId, correccion_id: result.correccionId });
    e.db.close();
  });

  it("de 1 a 3 imprime «+ 2 Jugo»", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 1 }]);
    const printer = new MemoryPrinter();

    await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 3)] }, printer);

    expect(ticket(printer)).toContain("+ 2 Jugo");
    expect(versionEfectivaOrden(e.db, e.ordenId)[0].cantidad).toBe(3);
    e.db.close();
  });

  it("de 1 a 0 deja la línea cancelada en cocina y la marca como anulación", async () => {
    const e = await ordenEnviada((ids) => [
      { productoId: ids.hamburguesa, cantidad: 1 },
      { productoId: ids.jugo, cantidad: 2 },
    ]);
    const printer = new MemoryPrinter();
    const hamburguesa = e.lineas[0];

    const result = await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(hamburguesa, 0)] }, printer);

    expect(ticket(printer)).toContain("ANULADO: 1 Hamburguesa");
    expect(etapaDeOrdenLinea(e.db, hamburguesa.ordenLineaId)).toBe("cancelado");
    expect(etapaDeOrdenLinea(e.db, e.lineas[1].ordenLineaId)).toBe("por_preparar");
    expect(
      (e.db.prepare("SELECT es_anulacion FROM orden_correcciones WHERE id = ?").get(result.correccionId) as {
        es_anulacion: number;
      }).es_anulacion,
    ).toBe(1);
    expect((e.db.prepare("SELECT estado FROM ordenes WHERE id = ?").get(e.ordenId) as { estado: string }).estado).toBe(
      "corregida",
    );
    expect(versionEfectivaOrden(e.db, e.ordenId).filter((l) => l.cantidad > 0).map((l) => l.productoId)).toEqual([
      e.ids.jugo,
    ]);
    e.db.close();
  });

  it("dejar todas las cantidades en cero anula la orden y avisa a cocina", async () => {
    const e = await ordenEnviada((ids) => [
      { productoId: ids.hamburguesa, cantidad: 1 },
      { productoId: ids.jugo, cantidad: 2 },
    ]);
    const printer = new MemoryPrinter();

    const result = await corregir(
      e.db,
      {
        ordenId: e.ordenId,
        lineas: [cambio(e.lineas[0], 0), cambio(e.lineas[1], 0)],
        motivo: "cliente se fue",
      },
      printer,
    );

    expect((e.db.prepare("SELECT estado FROM ordenes WHERE id = ?").get(e.ordenId) as { estado: string }).estado).toBe(
      "anulada",
    );
    const texto = ticket(printer);
    expect(texto).toContain("ANULACIÓN · Mesa 7 · Orden 1");
    expect(texto).toContain("ANULADO: 1 Hamburguesa");
    expect(texto).toContain("ANULADO: 2 Jugo");
    expect(
      (e.db.prepare("SELECT tipo FROM comandas WHERE id = ?").get(result.comandaId) as { tipo: string }).tipo,
    ).toBe("anulacion");
    expect(totalEfectivoCuenta(e.db, e.cuentaId)).toBe(0);
    expect(reserva(e.db, e.ids.pan)).toBe(0);
    expect(reserva(e.db, e.ids.jugo)).toBe(0);
    e.db.close();
  });

  it("una corrección posterior compara contra la última versión efectiva", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.hamburguesa, cantidad: 2 }]);
    await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 1)] });

    const efectivas = versionEfectivaOrden(e.db, e.ordenId);
    expect(efectivas[0].cantidad).toBe(1);
    const printer = new MemoryPrinter();
    const segunda = await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(efectivas[0], 3)] }, printer);

    expect(ticket(printer)).toContain("+ 2 Hamburguesa");
    const fila = e.db
      .prepare("SELECT cantidad_anterior, cantidad_nueva FROM orden_correccion_lineas WHERE correccion_id = ?")
      .get(segunda.correccionId) as { cantidad_anterior: number; cantidad_nueva: number };
    expect(fila).toEqual({ cantidad_anterior: 1, cantidad_nueva: 3 });
    expect(
      (
        e.db.prepare("SELECT numero_version FROM orden_correcciones WHERE id = ?").get(segunda.correccionId) as {
          numero_version: number;
        }
      ).numero_version,
    ).toBe(2);
    expect(versionEfectivaOrden(e.db, e.ordenId)[0].cantidad).toBe(3);
    e.db.close();
  });

  it("agrega un producto nuevo por corrección con su propia lineaClave", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.hamburguesa, cantidad: 1 }]);
    const printer = new MemoryPrinter();

    const result = await corregir(
      e.db,
      {
        ordenId: e.ordenId,
        lineas: [{ lineaClave: "agregado-jugo", productoId: e.ids.jugo, cantidad: 2, nota: "sin hielo" }],
      },
      printer,
    );

    expect(ticket(printer)).toContain("+ 2 Jugo (sin hielo)");
    expect(contar(e.db, "orden_lineas")).toBe(1);
    const efectivas = versionEfectivaOrden(e.db, e.ordenId);
    expect(efectivas).toHaveLength(2);
    expect(efectivas[1]).toMatchObject({
      lineaClave: "agregado-jugo",
      ordenLineaId: null,
      productoId: e.ids.jugo,
      cantidad: 2,
      nota: "sin hielo",
      precioCentavos: 2500,
    });
    expect(reserva(e.db, e.ids.jugo)).toBe(2);
    expect(totalEfectivoCuenta(e.db, e.cuentaId)).toBe(8900 + 2 * 2500);
    expect(etapasDeCorreccion(e.db, result.correccionId)).toEqual(["por_preparar"]);
    e.db.close();
  });

  it("corrige la segunda de dos líneas del mismo producto usando lineaClave", async () => {
    const e = await ordenEnviada((ids) => [
      { productoId: ids.hamburguesa, cantidad: 1, nota: "sin cebolla" },
      { productoId: ids.hamburguesa, cantidad: 1, nota: "extra queso" },
    ]);
    expect(e.lineas[0].lineaClave).not.toBe(e.lineas[1].lineaClave);
    const printer = new MemoryPrinter();

    await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[1], 3)] }, printer);

    const efectivas = versionEfectivaOrden(e.db, e.ordenId);
    expect(efectivas[0]).toMatchObject({ lineaClave: e.lineas[0].lineaClave, cantidad: 1, nota: "sin cebolla" });
    expect(efectivas[1]).toMatchObject({ lineaClave: e.lineas[1].lineaClave, cantidad: 3, nota: "extra queso" });
    expect(ticket(printer)).toContain("+ 2 Hamburguesa (extra queso)");
    e.db.close();
  });

  it("corrige una línea agregada por una corrección anterior", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.hamburguesa, cantidad: 1 }]);
    const primera = await corregir(e.db, {
      ordenId: e.ordenId,
      lineas: [{ lineaClave: "agregado-jugo", productoId: e.ids.jugo, cantidad: 2 }],
    });
    const efectivas = versionEfectivaOrden(e.db, e.ordenId);
    const printer = new MemoryPrinter();

    const segunda = await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(efectivas[1], 0)] }, printer);

    expect(ticket(printer)).toContain("ANULADO: 2 Jugo");
    expect(versionEfectivaOrden(e.db, e.ordenId)[1].cantidad).toBe(0);
    expect(reserva(e.db, e.ids.jugo)).toBe(0);
    // La tarea que había creado la primera corrección se cancela; el evento que
    // la anula queda como aviso.
    expect(etapasDeCorreccion(e.db, primera.correccionId)).toEqual(["cancelado"]);
    expect(etapasDeCorreccion(e.db, segunda.correccionId)).toEqual(["aviso"]);
    e.db.close();
  });

  it("imprime NOTA CAMBIADA con la nota anterior cuando solo cambia la nota", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.hamburguesa, cantidad: 1, nota: "sin cebolla" }]);
    const printer = new MemoryPrinter();

    const result = await corregir(
      e.db,
      { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 1, "sin tomate")] },
      printer,
    );

    const texto = ticket(printer);
    expect(texto).toContain("NOTA CAMBIADA: Hamburguesa (antes: sin cebolla) → sin tomate");
    expect(texto).not.toContain("- 0");
    expect(versionEfectivaOrden(e.db, e.ordenId)[0].nota).toBe("sin tomate");
    expect(reserva(e.db, e.ids.pan)).toBe(1);
    expect(etapasDeCorreccion(e.db, result.correccionId)).toEqual(["aviso"]);
    expect(etapaDeOrdenLinea(e.db, e.lineas[0].ordenLineaId)).toBe("por_preparar");
    e.db.close();
  });

  it("rechaza una corrección sin cambios de cantidad, nota ni indicaciones", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }], defaultConfig(), "servir junto");
    const printer = new MemoryPrinter();

    await expect(
      corregir(
        e.db,
        { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 2)], indicaciones: "servir junto" },
        printer,
      ),
    ).rejects.toMatchObject({ codigo: "correccion_sin_cambios" });

    expect(contar(e.db, "orden_correcciones")).toBe(0);
    expect(printer.chunks).toHaveLength(0);
    e.db.close();
  });

  it("un PIN incorrecto no deja rastro en la base ni en el inventario", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.hamburguesa, cantidad: 2 }]);
    const printer = new MemoryPrinter();
    const panAntes = reserva(e.db, e.ids.pan);
    const jobsAntes = contar(e.db, "print_jobs");
    const comandasAntes = contar(e.db, "comandas");

    await expect(
      corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 0)], pin: "0000" }, printer),
    ).rejects.toMatchObject({ codigo: "pin_invalido" });

    expect(contar(e.db, "orden_correcciones")).toBe(0);
    expect(contar(e.db, "orden_correccion_lineas")).toBe(0);
    expect(contar(e.db, "auditoria_anulaciones")).toBe(0);
    expect(contar(e.db, "comandas")).toBe(comandasAntes);
    expect(contar(e.db, "print_jobs")).toBe(jobsAntes);
    expect(reserva(e.db, e.ids.pan)).toBe(panAntes);
    expect(printer.chunks).toHaveLength(0);
    expect((e.db.prepare("SELECT estado FROM ordenes WHERE id = ?").get(e.ordenId) as { estado: string }).estado).toBe(
      "enviada",
    );
    e.db.close();
  });

  it("un empleado sin derecho no puede corregir", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    await crearEmpleado(e.db, { nombre: "Nuevo", pin: "9999", derecho: "minimo" });

    await expect(
      corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 1)], pin: "9999" }),
    ).rejects.toMatchObject({ codigo: "sin_derecho" });
    expect(contar(e.db, "orden_correcciones")).toBe(0);
    e.db.close();
  });

  it("invalida la precuenta vigente y reabre la cuenta", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    const precuentaId = Number(
      e.db
        .prepare(
          "INSERT INTO precuentas (pedido_id, cuenta_id, numero, vigente, mesero_id, snapshot_json, emitida_en) VALUES (NULL, ?, 1, 1, 1, '{}', ?)",
        )
        .run(e.cuentaId, "2026-08-22T12:10:00.000Z").lastInsertRowid,
    );
    e.db.prepare("UPDATE cuentas SET estado = 'precuenta_emitida' WHERE id = ?").run(e.cuentaId);

    await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 1)] });

    expect(
      (e.db.prepare("SELECT vigente FROM precuentas WHERE id = ?").get(precuentaId) as { vigente: number }).vigente,
    ).toBe(0);
    expect(obtenerCuenta(e.db, e.cuentaId).estado).toBe("abierta");
    e.db.close();
  });

  it("con justificacion_anulacion rechaza un motivo en blanco y no persiste nada", async () => {
    const cfg: AppConfig = { ...defaultConfig(), auditoria_anulaciones: true, justificacion_anulacion: true };
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }], cfg);
    const printer = new MemoryPrinter();

    await expect(
      corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 0)], motivo: "   " }, printer, cfg),
    ).rejects.toMatchObject({ codigo: "justificacion_requerida" });

    expect(contar(e.db, "orden_correcciones")).toBe(0);
    expect(contar(e.db, "auditoria_anulaciones")).toBe(0);
    expect(reserva(e.db, e.ids.jugo)).toBe(2);
    expect(printer.chunks).toHaveLength(0);

    const conMotivo = await corregir(
      e.db,
      { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 0)], motivo: "  se equivocó la mesa  " },
      printer,
      cfg,
    );
    expect(
      (e.db.prepare("SELECT motivo FROM orden_correcciones WHERE id = ?").get(conMotivo.correccionId) as {
        motivo: string;
      }).motivo,
    ).toBe("se equivocó la mesa");
    e.db.close();
  });

  it("no exige justificación si la auditoría está apagada", async () => {
    const cfg: AppConfig = { ...defaultConfig(), auditoria_anulaciones: false, justificacion_anulacion: true };
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }], cfg);

    const result = await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 0)] }, undefined, cfg);

    expect(result.correccionId).toBeGreaterThan(0);
    expect(contar(e.db, "auditoria_anulaciones")).toBe(0);
    e.db.close();
  });

  it("una reducción sin anulación no exige justificación", async () => {
    const cfg: AppConfig = { ...defaultConfig(), auditoria_anulaciones: true, justificacion_anulacion: true };
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }], cfg);

    const result = await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 1)] }, undefined, cfg);

    expect(result.correccionId).toBeGreaterThan(0);
    expect(contar(e.db, "auditoria_anulaciones")).toBe(0);
    e.db.close();
  });

  it("escribe auditoría solo cuando auditoria_anulaciones está encendida", async () => {
    const apagada = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    await corregir(apagada.db, {
      ordenId: apagada.ordenId,
      lineas: [cambio(apagada.lineas[0], 0)],
      motivo: "sin auditoría",
    });
    expect(contar(apagada.db, "auditoria_anulaciones")).toBe(0);
    expect(contar(apagada.db, "orden_correcciones")).toBe(1);
    apagada.db.close();

    const cfg: AppConfig = { ...defaultConfig(), auditoria_anulaciones: true };
    const encendida = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }], cfg);
    const result = await corregir(
      encendida.db,
      { ordenId: encendida.ordenId, lineas: [cambio(encendida.lineas[0], 0)] },
      undefined,
      cfg,
    );

    const auditoria = encendida.db.prepare("SELECT * FROM auditoria_anulaciones").get() as {
      cuenta_id: number;
      orden_id: number;
      correccion_id: number;
      mesa_numero: number;
      orden_numero: number;
      empleado_id: number;
      resumen: string;
      justificacion: string | null;
      creada_en: string;
    };
    expect(auditoria).toMatchObject({
      cuenta_id: encendida.cuentaId,
      orden_id: encendida.ordenId,
      correccion_id: result.correccionId,
      mesa_numero: 7,
      orden_numero: 1,
      empleado_id: 1,
      justificacion: null,
    });
    expect(auditoria.resumen).toContain("2 Jugo");
    expect(auditoria.creada_en).toEqual(expect.any(String));
    encendida.db.close();
  });

  it("rechaza corregir una orden ya anulada", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 1 }]);
    await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 0)] });

    await expect(
      corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 2)] }),
    ).rejects.toMatchObject({ codigo: "orden_anulada" });
    expect(contar(e.db, "orden_correcciones")).toBe(1);
    e.db.close();
  });

  it("rechaza corregir una cuenta que ya está en caja", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    e.db.prepare("UPDATE cuentas SET estado = 'en_caja' WHERE id = ?").run(e.cuentaId);

    await expect(
      corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 1)] }),
    ).rejects.toMatchObject({ codigo: "cuenta_cerrada" });
    expect(contar(e.db, "orden_correcciones")).toBe(0);
    expect(reserva(e.db, e.ids.jugo)).toBe(2);
    e.db.close();
  });

  it("rechaza una lineaClave repetida en el mismo input", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    await expect(
      corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 1), cambio(e.lineas[0], 3)] }),
    ).rejects.toMatchObject({ codigo: "linea_duplicada" });
    expect(contar(e.db, "orden_correcciones")).toBe(0);
    e.db.close();
  });

  it("rechaza un ordenLineaId que no corresponde a la lineaClave", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    await expect(
      corregir(e.db, {
        ordenId: e.ordenId,
        lineas: [{ ...cambio(e.lineas[0], 1), ordenLineaId: 999999 }],
      }),
    ).rejects.toMatchObject({ codigo: "linea_desalineada" });
    expect(contar(e.db, "orden_correcciones")).toBe(0);
    e.db.close();
  });

  it("rechaza un producto distinto al de la lineaClave existente", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    await expect(
      corregir(e.db, {
        ordenId: e.ordenId,
        lineas: [{ lineaClave: e.lineas[0].lineaClave, productoId: e.ids.agua, cantidad: 2 }],
      }),
    ).rejects.toMatchObject({ codigo: "producto_desalineado" });
    expect(contar(e.db, "orden_correcciones")).toBe(0);
    e.db.close();
  });

  it("rechaza agregar una línea nueva en cero", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    await expect(
      corregir(e.db, {
        ordenId: e.ordenId,
        lineas: [{ lineaClave: "fantasma", productoId: e.ids.agua, cantidad: 0, nota: "sin hielo" }],
      }),
    ).rejects.toMatchObject({ codigo: "linea_agregada_en_cero" });
    expect(contar(e.db, "orden_correccion_lineas")).toBe(0);
    e.db.close();
  });

  it("rechaza una lineaClave que pertenece a otra orden", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    const otra = await enviarOrden(
      e.db,
      {
        mesaId: e.ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: "envio-otra-orden",
        lineas: [{ productoId: e.ids.agua, cantidad: 1 }],
      },
      new MemoryPrinter(),
      defaultConfig(),
    );
    const ajena = versionEfectivaOrden(e.db, otra.ordenId)[0];

    await expect(
      corregir(e.db, {
        ordenId: e.ordenId,
        lineas: [{ lineaClave: ajena.lineaClave, productoId: e.ids.agua, cantidad: 2 }],
      }),
    ).rejects.toMatchObject({ codigo: "linea_de_otra_orden" });
    expect(contar(e.db, "orden_correcciones")).toBe(0);
    e.db.close();
  });

  it("revierte todo si una línea agregada apunta a un producto inexistente", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    const printer = new MemoryPrinter();

    await expect(
      corregir(
        e.db,
        {
          ordenId: e.ordenId,
          lineas: [cambio(e.lineas[0], 1), { lineaClave: "fantasma", productoId: 999999, cantidad: 1 }],
        },
        printer,
      ),
    ).rejects.toMatchObject({ codigo: "producto_inexistente" });

    expect(contar(e.db, "orden_correcciones")).toBe(0);
    expect(contar(e.db, "orden_correccion_lineas")).toBe(0);
    expect(reserva(e.db, e.ids.jugo)).toBe(2);
    expect(printer.chunks).toHaveLength(0);
    e.db.close();
  });

  it("rechaza una cantidad negativa", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    await expect(
      corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], -1)] }),
    ).rejects.toMatchObject({ codigo: "cantidad_invalida" });
    expect(contar(e.db, "orden_correcciones")).toBe(0);
    e.db.close();
  });

  it("rechaza una orden inexistente", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    await expect(
      corregir(e.db, { ordenId: 999999, lineas: [cambio(e.lineas[0], 1)] }),
    ).rejects.toMatchObject({ codigo: "orden_inexistente" });
    e.db.close();
  });

  it("deja el job en cola si la impresora está caída, sin perder la corrección", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    const caida = new MemoryPrinter();
    caida.fail = true;

    const result = await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 1)] }, caida);

    expect(result.correccionId).toBeGreaterThan(0);
    const job = e.db.prepare("SELECT kind, status FROM print_jobs ORDER BY id DESC LIMIT 1").get() as {
      kind: string;
      status: string;
    };
    expect(job).toEqual({ kind: "correccion", status: "queued" });

    const sana = new MemoryPrinter();
    await corregir(
      e.db,
      { ordenId: e.ordenId, lineas: [cambio(versionEfectivaOrden(e.db, e.ordenId)[0], 4)] },
      sana,
    );
    expect(ticket(sana)).toContain("- 1 Jugo");
    expect(ticket(sana)).toContain("+ 3 Jugo");
    e.db.close();
  });
});

describe("corregirOrden idempotente", () => {
  it("exige clave de idempotencia y no acepta espacios en blanco", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    for (const clave of ["", "   ", "\t\n", " \u00a0 "]) {
      await expect(
        corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 1)], claveIdempotencia: clave }),
      ).rejects.toMatchObject({ codigo: "clave_idempotencia_requerida" });
    }
    expect(contar(e.db, "orden_correcciones")).toBe(0);
    expect(reserva(e.db, e.ids.jugo)).toBe(2);
    e.db.close();
  });

  it("repetir la clave devuelve la misma corrección sin duplicar filas ni inventario", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 3 }]);
    const printer = new MemoryPrinter();
    const entrada = {
      ordenId: e.ordenId,
      lineas: [cambio(e.lineas[0], 1)],
      claveIdempotencia: "doble-clic",
    };

    const primera = await corregir(e.db, entrada, printer);
    const segunda = await corregir(e.db, entrada, printer);

    expect(segunda.correccionId).toBe(primera.correccionId);
    expect(segunda.comandaId).toBe(primera.comandaId);
    expect(primera.repetida).toBe(false);
    expect(segunda.repetida).toBe(true);
    expect(contar(e.db, "orden_correcciones")).toBe(1);
    expect(contar(e.db, "orden_correccion_lineas")).toBe(1);
    expect(contar(e.db, "comandas")).toBe(2);
    expect(contar(e.db, "print_jobs")).toBe(2);
    expect(reserva(e.db, e.ids.jugo)).toBe(1);
    expect(printer.chunks).toHaveLength(1);
    expect(versionEfectivaOrden(e.db, e.ordenId)[0].cantidad).toBe(1);
    e.db.close();
  });

  it("repetir la clave con otro payload no aplica el payload nuevo", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 3 }]);
    const primera = await corregir(e.db, {
      ordenId: e.ordenId,
      lineas: [cambio(e.lineas[0], 1)],
      claveIdempotencia: "misma-clave",
    });

    const segunda = await corregir(e.db, {
      ordenId: e.ordenId,
      lineas: [cambio(e.lineas[0], 0)],
      claveIdempotencia: "misma-clave",
    });

    expect(segunda).toEqual({ ...primera, repetida: true });
    expect(versionEfectivaOrden(e.db, e.ordenId)[0].cantidad).toBe(1);
    expect(contar(e.db, "orden_correcciones")).toBe(1);
    expect(reserva(e.db, e.ids.jugo)).toBe(1);
    expect((e.db.prepare("SELECT estado FROM ordenes WHERE id = ?").get(e.ordenId) as { estado: string }).estado).toBe(
      "corregida",
    );
    e.db.close();
  });

  it("un reintento con la misma clave despacha el job que quedó en cola", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 3 }]);
    const caida = new MemoryPrinter();
    caida.fail = true;
    const entrada = {
      ordenId: e.ordenId,
      lineas: [cambio(e.lineas[0], 2)],
      claveIdempotencia: "reintento",
    };
    await corregir(e.db, entrada, caida);
    expect(
      (e.db.prepare("SELECT status FROM print_jobs ORDER BY id DESC LIMIT 1").get() as { status: string }).status,
    ).toBe("queued");

    const sana = new MemoryPrinter();
    const reintento = await corregir(e.db, entrada, sana);

    expect(reintento.repetida).toBe(true);
    expect(ticket(sana)).toContain("- 1 Jugo");
    expect(sana.chunks).toHaveLength(1);
    expect(contar(e.db, "orden_correcciones")).toBe(1);
    expect(contar(e.db, "print_jobs")).toBe(2);
    expect(reserva(e.db, e.ids.jugo)).toBe(2);
    e.db.close();
  });

  it("un reintento de una anulación ya aplicada no falla con orden_anulada", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    const entrada = {
      ordenId: e.ordenId,
      lineas: [cambio(e.lineas[0], 0)],
      claveIdempotencia: "anular-una-vez",
    };
    const primera = await corregir(e.db, entrada);

    const reintento = await corregir(e.db, entrada);

    expect(reintento).toEqual({ ...primera, repetida: true });
    expect((e.db.prepare("SELECT estado FROM ordenes WHERE id = ?").get(e.ordenId) as { estado: string }).estado).toBe(
      "anulada",
    );
    expect(contar(e.db, "orden_correcciones")).toBe(1);
    e.db.close();
  });

  it("la misma clave en otra orden es otra corrección, no un reintento", async () => {
    const cfg = defaultConfig();
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 3 }], cfg);
    const otra = await enviarOrden(
      e.db,
      {
        mesaId: e.ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: "envio-2",
        lineas: [{ productoId: e.ids.agua, cantidad: 4 }],
      },
      new MemoryPrinter(),
      cfg,
    );
    const lineaOtra = versionEfectivaOrden(e.db, otra.ordenId)[0];

    const primera = await corregir(e.db, {
      ordenId: e.ordenId,
      lineas: [cambio(e.lineas[0], 1)],
      claveIdempotencia: "clave-compartida",
    });
    const segunda = await corregir(e.db, {
      ordenId: otra.ordenId,
      lineas: [cambio(lineaOtra, 2)],
      claveIdempotencia: "clave-compartida",
    });

    expect(primera.ordenId).toBe(e.ordenId);
    expect(segunda.ordenId).toBe(otra.ordenId);
    expect(segunda.repetida).toBe(false);
    expect(segunda.correccionId).not.toBe(primera.correccionId);
    expect(contar(e.db, "orden_correcciones")).toBe(2);
    expect(versionEfectivaOrden(e.db, e.ordenId)[0].cantidad).toBe(1);
    expect(versionEfectivaOrden(e.db, otra.ordenId)[0].cantidad).toBe(2);
    expect(reserva(e.db, e.ids.jugo)).toBe(1);
    expect(reserva(e.db, e.ids.agua)).toBe(2);
    e.db.close();
  });

  it("repetir la clave sobre la misma orden no arrastra la corrección de la otra", async () => {
    const cfg = defaultConfig();
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 3 }], cfg);
    const otra = await enviarOrden(
      e.db,
      {
        mesaId: e.ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: "envio-2",
        lineas: [{ productoId: e.ids.agua, cantidad: 4 }],
      },
      new MemoryPrinter(),
      cfg,
    );
    const lineaOtra = versionEfectivaOrden(e.db, otra.ordenId)[0];
    const enLaOtra = await corregir(e.db, {
      ordenId: otra.ordenId,
      lineas: [cambio(lineaOtra, 1)],
      claveIdempotencia: "clave-compartida",
    });

    const repetida = await corregir(e.db, {
      ordenId: otra.ordenId,
      lineas: [cambio(lineaOtra, 0)],
      claveIdempotencia: "clave-compartida",
    });

    expect(repetida).toEqual({ ...enLaOtra, repetida: true });
    expect(repetida.ordenId).toBe(otra.ordenId);
    // La orden que nunca se corrigió sigue intacta.
    expect(versionEfectivaOrden(e.db, e.ordenId)[0].cantidad).toBe(3);
    expect(reserva(e.db, e.ids.jugo)).toBe(3);
    e.db.close();
  });

  it("el esquema acota la unicidad a la orden", async () => {
    const cfg = defaultConfig();
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 1 }], cfg);
    const otra = await enviarOrden(
      e.db,
      {
        mesaId: e.ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: "envio-2",
        lineas: [{ productoId: e.ids.agua, cantidad: 1 }],
      },
      new MemoryPrinter(),
      cfg,
    );
    const insertar = (ordenId: number, clave: string) =>
      e.db
        .prepare(
          `INSERT INTO orden_correcciones (orden_id, numero_version, es_anulacion, creada_por_empleado_id, creada_en, clave_idempotencia)
           VALUES (?, ?, 0, 1, '2026-08-22T00:00:00.000Z', ?)`,
        )
        .run(ordenId, 90 + ordenId, clave);

    insertar(e.ordenId, "k");
    expect(() => insertar(e.ordenId, "k")).toThrow(/UNIQUE/);
    // La misma clave en otra orden es legítima.
    expect(() => insertar(otra.ordenId, "k")).not.toThrow();
    e.db.close();
  });
});

describe("corregirOrden normaliza la lineaClave", () => {
  it("una clave con espacios corrige la línea existente y no crea una nueva", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 3 }]);
    const original = e.lineas[0];

    await corregir(e.db, {
      ordenId: e.ordenId,
      lineas: [{ ...cambio(original, 1), lineaClave: ` ${original.lineaClave} ` }],
    });

    const efectiva = versionEfectivaOrden(e.db, e.ordenId);
    expect(efectiva).toHaveLength(1);
    expect(efectiva[0]).toMatchObject({ lineaClave: original.lineaClave, cantidad: 1 });
    expect(contar(e.db, "orden_correccion_lineas")).toBe(1);
    expect(
      (e.db.prepare("SELECT linea_clave FROM orden_correccion_lineas LIMIT 1").get() as { linea_clave: string })
        .linea_clave,
    ).toBe(original.lineaClave);
    expect(reserva(e.db, e.ids.jugo)).toBe(1);
    expect(totalEfectivoCuenta(e.db, e.cuentaId)).toBe(2500);
    e.db.close();
  });

  it("una clave de puros espacios no crea línea", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 3 }]);

    await expect(
      corregir(e.db, {
        ordenId: e.ordenId,
        lineas: [{ lineaClave: "   ", productoId: e.ids.jugo, cantidad: 2 }],
      }),
    ).rejects.toMatchObject({ codigo: "linea_sin_clave" });

    expect(contar(e.db, "orden_correcciones")).toBe(0);
    expect(reserva(e.db, e.ids.jugo)).toBe(3);
    e.db.close();
  });

  it("calcularDiferencias recorta igual que la corrección", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 3 }]);
    const original = e.lineas[0];

    const diferencias = calcularDiferencias(e.lineas, [
      { ...cambio(original, 1), lineaClave: `\t${original.lineaClave}\n` },
    ]);

    expect(diferencias).toHaveLength(1);
    expect(diferencias[0]).toMatchObject({
      lineaClave: original.lineaClave,
      cantidadAnterior: 3,
      cantidadNueva: 1,
      delta: -2,
    });
    e.db.close();
  });
});

describe("corregirOrden revalida dentro de la transacción", () => {
  it("no resucita una orden anulada mientras se verifica el PIN", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    const printer = new MemoryPrinter();

    const pendiente = corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 5)] }, printer);
    // Corre mientras `corregirOrden` está bloqueado en el await del PIN.
    e.db.prepare("UPDATE ordenes SET estado = 'anulada' WHERE id = ?").run(e.ordenId);

    await expect(pendiente).rejects.toMatchObject({ codigo: "orden_anulada" });
    expect(contar(e.db, "orden_correcciones")).toBe(0);
    expect(contar(e.db, "orden_correccion_lineas")).toBe(0);
    expect(reserva(e.db, e.ids.jugo)).toBe(2);
    expect(printer.chunks).toHaveLength(0);
    expect((e.db.prepare("SELECT estado FROM ordenes WHERE id = ?").get(e.ordenId) as { estado: string }).estado).toBe(
      "anulada",
    );
    e.db.close();
  });

  it("no corrige si la cuenta se fue a caja mientras se verifica el PIN", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    const printer = new MemoryPrinter();

    const pendiente = corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 1)] }, printer);
    e.db.prepare("UPDATE cuentas SET estado = 'en_caja', cerrada_en = ? WHERE id = ?").run(
      "2026-08-22T13:00:00.000Z",
      e.cuentaId,
    );

    await expect(pendiente).rejects.toMatchObject({ codigo: "cuenta_cerrada" });
    expect(contar(e.db, "orden_correcciones")).toBe(0);
    expect(reserva(e.db, e.ids.jugo)).toBe(2);
    expect(contar(e.db, "print_jobs")).toBe(1);
    expect(printer.chunks).toHaveLength(0);
    e.db.close();
  });

  it("calcula el diff contra la versión efectiva vigente al abrir la transacción", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 4 }]);
    const printer = new MemoryPrinter();

    const pendiente = corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 3)] }, printer);
    // Otra sesión baja la línea a 2 mientras se verifica el PIN.
    const correccionAjena = Number(
      e.db
        .prepare(
          `INSERT INTO orden_correcciones
            (orden_id, numero_version, es_anulacion, creada_por_empleado_id, creada_en, clave_idempotencia)
            VALUES (?, 1, 0, 1, ?, 'ajena')`,
        )
        .run(e.ordenId, "2026-08-22T12:30:00.000Z").lastInsertRowid,
    );
    e.db
      .prepare(
        `INSERT INTO orden_correccion_lineas
          (correccion_id, orden_linea_id, producto_id, cantidad_anterior, cantidad_nueva, linea_clave, precio_centavos)
          VALUES (?, ?, ?, 4, 2, ?, 2500)`,
      )
      .run(correccionAjena, e.lineas[0].ordenLineaId, e.ids.jugo, e.lineas[0].lineaClave);

    const result = await pendiente;

    const fila = e.db
      .prepare("SELECT cantidad_anterior, cantidad_nueva FROM orden_correccion_lineas WHERE correccion_id = ?")
      .get(result.correccionId) as { cantidad_anterior: number; cantidad_nueva: number };
    expect(fila).toEqual({ cantidad_anterior: 2, cantidad_nueva: 3 });
    expect(ticket(printer)).toContain("+ 1 Jugo");
    expect(
      (
        e.db.prepare("SELECT numero_version FROM orden_correcciones WHERE id = ?").get(result.correccionId) as {
          numero_version: number;
        }
      ).numero_version,
    ).toBe(2);
    expect(versionEfectivaOrden(e.db, e.ordenId)[0].cantidad).toBe(3);
    e.db.close();
  });
});

describe("corregirOrden y las etapas de cocina", () => {
  it("una cancelación solo puede pisar tareas pendientes", () => {
    expect([...ETAPAS_TERMINALES]).toEqual(["listo", "servido", "cancelado"]);
    expect([...ETAPAS_CANCELABLES]).toEqual(["por_preparar", "en_proceso"]);
    for (const terminal of ETAPAS_TERMINALES) {
      expect(ETAPAS_CANCELABLES).not.toContain(terminal);
    }
    expect(ETAPAS_CANCELABLES).not.toContain(ETAPA_AVISO);
    expect(ETAPAS_TERMINALES).not.toContain(ETAPA_AVISO);
  });

  it("solo un delta positivo entra como tarea para cocina", async () => {
    const e = await ordenEnviada((ids) => [
      { productoId: ids.jugo, cantidad: 2 },
      { productoId: ids.agua, cantidad: 2 },
    ]);

    const result = await corregir(e.db, {
      ordenId: e.ordenId,
      lineas: [
        cambio(e.lineas[0], 1),
        cambio(e.lineas[1], 5),
        { lineaClave: "agregado-hamburguesa", productoId: e.ids.hamburguesa, cantidad: 1 },
      ],
    });

    const filas = e.db
      .prepare(
        `SELECT ocl.linea_clave AS clave, ocl.cantidad_nueva AS nueva, cl.etapa
         FROM comanda_lineas cl
         JOIN orden_correccion_lineas ocl ON ocl.id = cl.orden_correccion_linea_id
         WHERE ocl.correccion_id = ? ORDER BY cl.id`,
      )
      .all(result.correccionId) as { clave: string; nueva: number; etapa: string }[];
    expect(filas).toEqual([
      { clave: e.lineas[0].lineaClave, nueva: 1, etapa: "aviso" },
      { clave: e.lineas[1].lineaClave, nueva: 5, etapa: "por_preparar" },
      { clave: "agregado-hamburguesa", nueva: 1, etapa: "por_preparar" },
    ]);
    expect(
      (
        e.db
          .prepare(
            `SELECT count(*) AS c FROM comanda_lineas cl
             JOIN orden_correccion_lineas ocl ON ocl.id = cl.orden_correccion_linea_id
             WHERE ocl.cantidad_nueva = 0 AND cl.etapa = 'por_preparar'`,
          )
          .get() as { c: number }
      ).c,
    ).toBe(0);
    e.db.close();
  });

  for (const terminal of ["listo", "servido"]) {
    it(`no reescribe una etapa terminal: lo ${terminal} sigue ${terminal}`, async () => {
      const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
      const original = e.db.prepare("SELECT id FROM comanda_lineas WHERE orden_linea_id = ?").get(
        e.lineas[0].ordenLineaId,
      ) as { id: number };
      avanzarEtapa(e.db, original.id, terminal);

      const result = await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 0)] });

      expect(etapaDeOrdenLinea(e.db, e.lineas[0].ordenLineaId)).toBe(terminal);
      expect(etapasDeCorreccion(e.db, result.correccionId)).toEqual(["aviso"]);
      expect(versionEfectivaOrden(e.db, e.ordenId)[0].cantidad).toBe(0);
      e.db.close();
    });
  }

  it("un aviso previo tampoco se reescribe cuando la línea se anula después", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 3 }]);
    const primera = await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 2)] });
    expect(etapasDeCorreccion(e.db, primera.correccionId)).toEqual(["aviso"]);

    const segunda = await corregir(e.db, {
      ordenId: e.ordenId,
      lineas: [cambio(versionEfectivaOrden(e.db, e.ordenId)[0], 0)],
    });

    expect(etapasDeCorreccion(e.db, primera.correccionId)).toEqual(["aviso"]);
    expect(etapasDeCorreccion(e.db, segunda.correccionId)).toEqual(["aviso"]);
    expect(etapaDeOrdenLinea(e.db, e.lineas[0].ordenLineaId)).toBe("cancelado");
    e.db.close();
  });

  it("cancela una etapa no terminal como en_proceso", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    const original = e.db.prepare("SELECT id FROM comanda_lineas WHERE orden_linea_id = ?").get(
      e.lineas[0].ordenLineaId,
    ) as { id: number };
    avanzarEtapa(e.db, original.id, "en_proceso");

    await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 0)] });

    expect(etapaDeOrdenLinea(e.db, e.lineas[0].ordenLineaId)).toBe("cancelado");
    e.db.close();
  });

  it("la comanda de corrección existe aunque todo sea aviso", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);

    const result = await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 1)] });

    const comanda = e.db.prepare("SELECT tipo, envio_n, correccion_id FROM comandas WHERE id = ?").get(
      result.comandaId,
    ) as { tipo: string; envio_n: number; correccion_id: number };
    expect(comanda).toEqual({ tipo: "correccion", envio_n: 1, correccion_id: result.correccionId });
    expect(etapasDeCorreccion(e.db, result.correccionId)).toEqual(["aviso"]);
    e.db.close();
  });

  it("expone el evento completo de cada corrección para la pantalla de cocina", async () => {
    const e = await ordenEnviada(
      (ids) => [
        { productoId: ids.jugo, cantidad: 3 },
        { productoId: ids.hamburguesa, cantidad: 1, nota: "sin cebolla" },
      ],
      defaultConfig(),
      "servir junto",
    );
    const baja = await corregir(e.db, {
      ordenId: e.ordenId,
      lineas: [cambio(e.lineas[0], 1), cambio(e.lineas[1], 1, "sin tomate")],
    });
    const soloIndicaciones = await corregir(e.db, {
      ordenId: e.ordenId,
      lineas: [],
      indicaciones: "servir al final",
    });

    const eventos = eventosDeCorreccion(e.db, e.ordenId);
    expect(eventos).toHaveLength(2);
    expect(eventos[0]).toMatchObject({
      comandaId: baja.comandaId,
      correccionId: baja.correccionId,
      numeroVersion: 1,
      esAnulacion: false,
      cambiaIndicaciones: false,
      indicaciones: null,
    });
    expect(eventos[0].lineas).toEqual([
      {
        comandaLineaId: expect.any(Number),
        correccionLineaId: expect.any(Number),
        etapa: "aviso",
        lineaClave: e.lineas[0].lineaClave,
        productoId: e.ids.jugo,
        nombre: "Jugo",
        cantidadAnterior: 3,
        cantidadNueva: 1,
        delta: -2,
        notaAnterior: null,
        notaNueva: null,
      },
      {
        comandaLineaId: expect.any(Number),
        correccionLineaId: expect.any(Number),
        etapa: "aviso",
        lineaClave: e.lineas[1].lineaClave,
        productoId: e.ids.hamburguesa,
        nombre: "Hamburguesa",
        cantidadAnterior: 1,
        cantidadNueva: 1,
        delta: 0,
        notaAnterior: "sin cebolla",
        notaNueva: "sin tomate",
      },
    ]);
    // La corrección de solo indicaciones no tiene líneas: la comanda es el aviso.
    expect(eventos[1]).toMatchObject({
      comandaId: soloIndicaciones.comandaId,
      numeroVersion: 2,
      cambiaIndicaciones: true,
      indicaciones: "servir al final",
      lineas: [],
    });
    e.db.close();
  });
});

describe("corregirOrden e inventario por línea", () => {
  const politicas: PoliticaInventario[] = [
    "descuento_al_enviar",
    "reserva_al_enviar_firme_al_precuenta",
    "reserva_al_enviar_firme_al_enviar_caja",
  ];

  for (const politica of politicas) {
    const descuenta = politica === "descuento_al_enviar";

    it(`baja y sube un producto directo con ${politica}`, async () => {
      const cfg: AppConfig = { ...defaultConfig(), politica_inventario: politica };
      const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }], cfg);
      expect(onHand(e.db, e.ids.jugo)).toBe(descuenta ? 8 : 10);
      expect(reserva(e.db, e.ids.jugo)).toBe(descuenta ? 0 : 2);

      await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 1)] }, undefined, cfg);
      expect(onHand(e.db, e.ids.jugo)).toBe(descuenta ? 9 : 10);
      expect(reserva(e.db, e.ids.jugo)).toBe(descuenta ? 0 : 1);

      const efectiva = versionEfectivaOrden(e.db, e.ordenId)[0];
      await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(efectiva, 3)] }, undefined, cfg);
      expect(onHand(e.db, e.ids.jugo)).toBe(descuenta ? 7 : 10);
      expect(reserva(e.db, e.ids.jugo)).toBe(descuenta ? 0 : 3);
      expect(libro(e.db, e.ordenId, e.lineas[0].lineaClave, e.ids.jugo)).toEqual({
        cantidadPorUnidad: 1,
        reservada: descuenta ? 0 : 3,
        firmada: descuenta ? 3 : 0,
      });
      e.db.close();
    });

    it(`baja y sube los componentes de una receta con ${politica}`, async () => {
      const cfg: AppConfig = { ...defaultConfig(), politica_inventario: politica };
      const e = await ordenEnviada((ids) => [{ productoId: ids.hamburguesa, cantidad: 2 }], cfg);
      const saldo = (productoId: number) => (descuenta ? onHand(e.db, productoId) : reserva(e.db, productoId));
      expect(saldo(e.ids.pan)).toBe(descuenta ? 18 : 2);
      expect(saldo(e.ids.carne)).toBe(descuenta ? 1700 : 300);

      await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 1)] }, undefined, cfg);
      expect(saldo(e.ids.pan)).toBe(descuenta ? 19 : 1);
      expect(saldo(e.ids.carne)).toBe(descuenta ? 1850 : 150);
      expect(saldo(e.ids.lechuga)).toBe(descuenta ? 380 : 20);

      const efectiva = versionEfectivaOrden(e.db, e.ordenId)[0];
      await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(efectiva, 3)] }, undefined, cfg);
      expect(saldo(e.ids.pan)).toBe(descuenta ? 17 : 3);
      expect(saldo(e.ids.carne)).toBe(descuenta ? 1550 : 450);
      expect(libro(e.db, e.ordenId, e.lineas[0].lineaClave, e.ids.carne)).toEqual({
        cantidadPorUnidad: 150,
        reservada: descuenta ? 0 : 450,
        firmada: descuenta ? 450 : 0,
      });
      e.db.close();
    });
  }

  it("el libro guarda un renglón por componente con su cantidad por unidad", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.hamburguesa, cantidad: 2 }]);

    const filas = e.db
      .prepare(
        `SELECT producto_id, cantidad_por_unidad, reservada_real, firmada_real
         FROM orden_linea_inventario WHERE orden_id = ? ORDER BY producto_id`,
      )
      .all(e.ordenId) as {
      producto_id: number;
      cantidad_por_unidad: number;
      reservada_real: number;
      firmada_real: number;
    }[];
    expect(filas).toEqual([
      { producto_id: e.ids.pan, cantidad_por_unidad: 1, reservada_real: 2, firmada_real: 0 },
      { producto_id: e.ids.carne, cantidad_por_unidad: 150, reservada_real: 300, firmada_real: 0 },
      { producto_id: e.ids.queso, cantidad_por_unidad: 1, reservada_real: 2, firmada_real: 0 },
      { producto_id: e.ids.lechuga, cantidad_por_unidad: 20, reservada_real: 40, firmada_real: 0 },
    ]);
    e.db.close();
  });

  it("firmar mueve la reserva a firmada y hacerlo dos veces no descuenta dos veces", async () => {
    const cfg: AppConfig = { ...defaultConfig(), politica_inventario: "reserva_al_enviar_firme_al_precuenta" };
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }], cfg);
    expect(pendienteDeFirmar(e.db, [e.ordenId])).toEqual([
      { ordenId: e.ordenId, lineaClave: e.lineas[0].lineaClave, productoId: e.ids.jugo, cantidad: 2 },
    ] satisfies PendienteDeFirmar[]);

    firmarReservadoDeCuenta(e.db, e.cuentaId);
    expect(onHand(e.db, e.ids.jugo)).toBe(8);
    expect(reserva(e.db, e.ids.jugo)).toBe(0);
    expect(libro(e.db, e.ordenId, e.lineas[0].lineaClave, e.ids.jugo)).toEqual({
      cantidadPorUnidad: 1,
      reservada: 0,
      firmada: 2,
    });
    expect(pendienteDeFirmar(e.db, [e.ordenId])).toEqual([]);

    firmarReservadoDeCuenta(e.db, e.cuentaId);
    expect(onHand(e.db, e.ids.jugo)).toBe(8);
    expect(reserva(e.db, e.ids.jugo)).toBe(0);
    e.db.close();
  });

  it("el momento de firmar lo decide la política, pero el llamador; lo firmado sale del libro", async () => {
    expect(firmaReservaEn("reserva_al_enviar_firme_al_precuenta", "precuenta")).toBe(true);
    expect(firmaReservaEn("reserva_al_enviar_firme_al_precuenta", "caja")).toBe(false);
    expect(firmaReservaEn("reserva_al_enviar_firme_al_enviar_caja", "precuenta")).toBe(false);
    expect(firmaReservaEn("reserva_al_enviar_firme_al_enviar_caja", "caja")).toBe(true);
    expect(firmaReservaEn("descuento_al_enviar", "precuenta")).toBe(false);
    expect(firmaReservaEn("descuento_al_enviar", "caja")).toBe(false);
  });

  it("cambiar la política después del envío no deja la reserva colgada", async () => {
    const cfg: AppConfig = { ...defaultConfig(), politica_inventario: "reserva_al_enviar_firme_al_precuenta" };
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }], cfg);
    // El local cambia la política con la orden viva: la firmeza no puede depender
    // de la configuración de hoy, porque estas dos unidades ya están apartadas.
    cfg.politica_inventario = "descuento_al_enviar";

    firmarReservadoDeCuenta(e.db, e.cuentaId);

    expect(onHand(e.db, e.ids.jugo)).toBe(8);
    expect(reserva(e.db, e.ids.jugo)).toBe(0);
    expect(pendienteDeFirmar(e.db, [e.ordenId])).toEqual([]);
    e.db.close();
  });

  it("firma también lo pendiente de una orden anulada", async () => {
    const cfg: AppConfig = { ...defaultConfig(), politica_inventario: "reserva_al_enviar_firme_al_precuenta" };
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }], cfg);
    e.db.prepare("UPDATE ordenes SET estado = 'anulada' WHERE id = ?").run(e.ordenId);

    firmarReservadoDeCuenta(e.db, e.cuentaId);

    expect(reserva(e.db, e.ids.jugo)).toBe(0);
    expect(onHand(e.db, e.ids.jugo)).toBe(8);
    e.db.close();
  });

  it("precuenta → orden nueva → reducir la orden vieja devuelve stock sin reserva negativa", async () => {
    const cfg: AppConfig = { ...defaultConfig(), politica_inventario: "reserva_al_enviar_firme_al_precuenta" };
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }], cfg);
    firmarReservadoDeCuenta(e.db, e.cuentaId);
    e.db.prepare("UPDATE cuentas SET estado = 'precuenta_emitida' WHERE id = ?").run(e.cuentaId);
    await enviarOrden(
      e.db,
      {
        mesaId: e.ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: "envio-cerveza",
        lineas: [{ productoId: e.ids.agua, cantidad: 1 }],
      },
      new MemoryPrinter(),
      cfg,
    );
    // La orden nueva reabrió la cuenta: el estado ya no dice nada sobre la firmeza.
    expect(obtenerCuenta(e.db, e.cuentaId).estado).toBe("abierta");
    expect(onHand(e.db, e.ids.jugo)).toBe(8);

    await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 1)] }, undefined, cfg);

    expect(onHand(e.db, e.ids.jugo)).toBe(9);
    expect(reserva(e.db, e.ids.jugo)).toBe(0);
    expect(libro(e.db, e.ordenId, e.lineas[0].lineaClave, e.ids.jugo)).toEqual({
      cantidadPorUnidad: 1,
      reservada: 0,
      firmada: 1,
    });
    e.db.close();
  });

  it("precuenta → orden nueva → aumentar la orden vieja: la segunda firma solo lo pendiente", async () => {
    const cfg: AppConfig = { ...defaultConfig(), politica_inventario: "reserva_al_enviar_firme_al_precuenta" };
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }], cfg);
    firmarReservadoDeCuenta(e.db, e.cuentaId);
    e.db.prepare("UPDATE cuentas SET estado = 'precuenta_emitida' WHERE id = ?").run(e.cuentaId);
    await enviarOrden(
      e.db,
      {
        mesaId: e.ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: "envio-agua",
        lineas: [{ productoId: e.ids.agua, cantidad: 1 }],
      },
      new MemoryPrinter(),
      cfg,
    );

    await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 3)] }, undefined, cfg);
    expect(onHand(e.db, e.ids.jugo)).toBe(8);
    expect(reserva(e.db, e.ids.jugo)).toBe(1);

    // Segunda precuenta sobre la cuenta reabierta.
    firmarReservadoDeCuenta(e.db, e.cuentaId);

    expect(onHand(e.db, e.ids.jugo)).toBe(7);
    expect(reserva(e.db, e.ids.jugo)).toBe(0);
    expect(onHand(e.db, e.ids.agua)).toBe(9);
    expect(libro(e.db, e.ordenId, e.lineas[0].lineaClave, e.ids.jugo)).toEqual({
      cantidadPorUnidad: 1,
      reservada: 0,
      firmada: 3,
    });
    e.db.close();
  });

  it("una línea con insumos y sin libro no se corrige a ciegas", async () => {
    const cfg: AppConfig = { ...defaultConfig(), politica_inventario: "reserva_al_enviar_firme_al_precuenta" };
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }], cfg);
    e.db.prepare("DELETE FROM orden_linea_inventario WHERE orden_id = ?").run(e.ordenId);
    const printer = new MemoryPrinter();

    await expect(
      corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 0)] }, printer, cfg),
    ).rejects.toMatchObject({ codigo: "inventario_sin_trazabilidad" });

    // Ni una fila, ni un movimiento de stock, ni un ticket: el único job en la
    // tabla es el del envío.
    expect(contar(e.db, "orden_correcciones")).toBe(0);
    expect(contar(e.db, "orden_correccion_lineas")).toBe(0);
    expect(contar(e.db, "print_jobs")).toBe(1);
    expect(printer.chunks).toHaveLength(0);
    expect(onHand(e.db, e.ids.jugo)).toBe(10);
    expect(reserva(e.db, e.ids.jugo)).toBe(2);
    expect((e.db.prepare("SELECT estado FROM ordenes WHERE id = ?").get(e.ordenId) as { estado: string }).estado).toBe(
      "enviada",
    );
    expect(versionEfectivaOrden(e.db, e.ordenId)[0].cantidad).toBe(2);
    e.db.close();
  });

  it("una receta sin libro tampoco se corrige, aunque el delta sea positivo", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.hamburguesa, cantidad: 1 }]);
    e.db.prepare("DELETE FROM orden_linea_inventario WHERE orden_id = ?").run(e.ordenId);

    await expect(
      corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 3)] }),
    ).rejects.toMatchObject({ codigo: "inventario_sin_trazabilidad" });

    expect(contar(e.db, "orden_correcciones")).toBe(0);
    expect(reserva(e.db, e.ids.pan)).toBe(1);
    expect(reserva(e.db, e.ids.carne)).toBe(150);
    e.db.close();
  });

  it("la API de inventario también se niega a mover una línea sin libro", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    e.db.prepare("DELETE FROM orden_linea_inventario WHERE orden_id = ?").run(e.ordenId);

    let capturado: unknown;
    try {
      ajustarConsumoDeCorreccion(
        e.db,
        e.ordenId,
        [{ lineaClave: e.lineas[0].lineaClave, productoId: e.ids.jugo, delta: -1, esNueva: false }],
        "reserva_al_enviar_firme_al_precuenta",
      );
    } catch (error) {
      capturado = error;
    }

    expect(capturado).toMatchObject({ codigo: "inventario_sin_trazabilidad" });
    expect(reserva(e.db, e.ids.jugo)).toBe(2);
    e.db.close();
  });

  it("un producto sin inventario rastreado se corrige sin libro", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 1 }]);
    const cafe = (e.db.prepare("SELECT id FROM productos WHERE nombre = ?").get("Café") as { id: number }).id;
    const conCafe = await enviarOrden(
      e.db,
      {
        mesaId: e.ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: "envio-cafe",
        lineas: [{ productoId: cafe, cantidad: 2 }],
      },
      new MemoryPrinter(),
      defaultConfig(),
    );
    const lineaCafe = versionEfectivaOrden(e.db, conCafe.ordenId)[0];
    expect(
      (e.db.prepare("SELECT count(*) AS c FROM orden_linea_inventario WHERE orden_id = ?").get(conCafe.ordenId) as {
        c: number;
      }).c,
    ).toBe(0);

    await corregir(e.db, { ordenId: conCafe.ordenId, lineas: [cambio(lineaCafe, 1)] });

    expect(versionEfectivaOrden(e.db, conCafe.ordenId)[0].cantidad).toBe(1);
    expect(
      (e.db.prepare("SELECT count(*) AS c FROM orden_linea_inventario WHERE orden_id = ?").get(conCafe.ordenId) as {
        c: number;
      }).c,
    ).toBe(0);
    e.db.close();
  });
});

describe("corregirOrden usa las proporciones del envío, no la carta de hoy", () => {
  function cambiarReceta(db: Db, ids: SeedIds): void {
    db.prepare("UPDATE receta_lineas SET cantidad_real = 200 WHERE producto_id = ? AND ingrediente_id = ?").run(
      ids.hamburguesa,
      ids.carne,
    );
    db.prepare("DELETE FROM receta_lineas WHERE producto_id = ? AND ingrediente_id = ?").run(
      ids.hamburguesa,
      ids.queso,
    );
  }

  it("una reducción devuelve lo que se apartó, aunque la receta haya cambiado", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.hamburguesa, cantidad: 2 }]);
    expect(reserva(e.db, e.ids.carne)).toBe(300);
    expect(reserva(e.db, e.ids.queso)).toBe(2);
    cambiarReceta(e.db, e.ids);

    await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 1)] });

    // 150 por unidad, la del envío; con la receta nueva habría liberado 200.
    expect(reserva(e.db, e.ids.carne)).toBe(150);
    // Y el queso que ya no está en la receta igual se libera: si no, quedaría
    // reservado para siempre.
    expect(reserva(e.db, e.ids.queso)).toBe(1);
    expect(libro(e.db, e.ordenId, e.lineas[0].lineaClave, e.ids.carne)).toEqual({
      cantidadPorUnidad: 150,
      reservada: 150,
      firmada: 0,
    });
    e.db.close();
  });

  it("un aumento consume las proporciones del envío y no descuadra el renglón", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.hamburguesa, cantidad: 1 }]);
    cambiarReceta(e.db, e.ids);

    await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 3)] });

    expect(reserva(e.db, e.ids.carne)).toBe(450);
    expect(reserva(e.db, e.ids.queso)).toBe(3);
    // La invariante del renglón: reservada = cantidad_por_unidad × unidades.
    expect(libro(e.db, e.ordenId, e.lineas[0].lineaClave, e.ids.carne)).toEqual({
      cantidadPorUnidad: 150,
      reservada: 450,
      firmada: 0,
    });
    e.db.close();
  });

  it("una línea nueva de la corrección sí usa la receta vigente", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 1 }]);
    cambiarReceta(e.db, e.ids);

    await corregir(e.db, {
      ordenId: e.ordenId,
      lineas: [
        cambio(e.lineas[0], 1),
        { lineaClave: "hamburguesa-nueva", productoId: e.ids.hamburguesa, cantidad: 2 },
      ],
    });

    expect(reserva(e.db, e.ids.carne)).toBe(400);
    expect(reserva(e.db, e.ids.queso)).toBe(0);
    expect(libro(e.db, e.ordenId, "hamburguesa-nueva", e.ids.carne)).toEqual({
      cantidadPorUnidad: 200,
      reservada: 400,
      firmada: 0,
    });
    expect(libro(e.db, e.ordenId, "hamburguesa-nueva", e.ids.queso)).toBeUndefined();
    e.db.close();
  });

  it("corregir dos veces una línea agregada conserva la receta con la que nació", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 1 }]);

    await corregir(e.db, {
      ordenId: e.ordenId,
      lineas: [{ lineaClave: "hamburguesa-nueva", productoId: e.ids.hamburguesa, cantidad: 1 }],
    });
    cambiarReceta(e.db, e.ids);
    const agregada = versionEfectivaOrden(e.db, e.ordenId).find((l) => l.lineaClave === "hamburguesa-nueva");
    if (!agregada) throw new Error("la línea agregada no aparece en la versión efectiva");
    await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(agregada, 2)] });

    expect(reserva(e.db, e.ids.carne)).toBe(300);
    expect(reserva(e.db, e.ids.queso)).toBe(2);
    e.db.close();
  });
});

describe("corregirOrden e indicaciones", () => {
  it("expone las indicaciones vigentes en la cuenta sin perder las originales", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 1 }], defaultConfig(), "servir junto");
    expect(obtenerCuenta(e.db, e.cuentaId).ordenes[0]).toMatchObject({
      indicaciones: "servir junto",
      indicacionesOriginales: "servir junto",
    });
    const printer = new MemoryPrinter();

    const result = await corregir(
      e.db,
      { ordenId: e.ordenId, lineas: [], indicaciones: "servir al final" },
      printer,
    );

    const texto = ticket(printer);
    expect(texto).toContain("INDICACIONES CAMBIADAS: servir al final");
    expect(
      (e.db.prepare("SELECT indicaciones FROM ordenes WHERE id = ?").get(e.ordenId) as { indicaciones: string })
        .indicaciones,
    ).toBe("servir junto");
    expect(
      (
        e.db.prepare("SELECT indicaciones FROM orden_correcciones WHERE id = ?").get(result.correccionId) as {
          indicaciones: string;
        }
      ).indicaciones,
    ).toBe("servir al final");
    expect(indicacionesEfectivasOrden(e.db, e.ordenId)).toBe("servir al final");
    expect(obtenerCuenta(e.db, e.cuentaId).ordenes[0]).toMatchObject({
      indicaciones: "servir al final",
      indicacionesOriginales: "servir junto",
    });
    e.db.close();
  });

  it("borrar las indicaciones deja cuerpo visible en el ticket", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 1 }], defaultConfig(), "servir junto");
    const printer = new MemoryPrinter();

    await corregir(e.db, { ordenId: e.ordenId, lineas: [], indicaciones: "  " }, printer);

    const texto = ticket(printer);
    expect(texto).toContain("INDICACIONES BORRADAS");
    expect(texto).not.toContain("Indicaciones: servir junto");
    expect(indicacionesEfectivasOrden(e.db, e.ordenId)).toBeNull();
    expect(obtenerCuenta(e.db, e.cuentaId).ordenes[0].indicaciones).toBeNull();
    expect(obtenerCuenta(e.db, e.cuentaId).ordenes[0].indicacionesOriginales).toBe("servir junto");
    e.db.close();
  });

  it("una corrección de cantidad conserva las indicaciones vigentes como contexto", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }], defaultConfig(), "servir junto");
    const printer = new MemoryPrinter();

    await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 1)] }, printer);

    const texto = ticket(printer);
    expect(texto).toContain("Indicaciones: servir junto");
    expect(texto).not.toContain("INDICACIONES CAMBIADAS");
    e.db.close();
  });
});

describe("corregirOrden y el precio congelado", () => {
  it("una línea agregada conserva su precio si la carta cambia después", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.hamburguesa, cantidad: 1 }]);

    const result = await corregir(e.db, {
      ordenId: e.ordenId,
      lineas: [{ lineaClave: "agregado-jugo", productoId: e.ids.jugo, cantidad: 2 }],
    });

    expect(totalEfectivoCuenta(e.db, e.cuentaId)).toBe(8900 + 2 * 2500);
    e.db.prepare("UPDATE productos SET precio_centavos = 9900 WHERE id = ?").run(e.ids.jugo);

    expect(
      (
        e.db.prepare("SELECT precio_centavos FROM orden_correccion_lineas WHERE correccion_id = ?").get(
          result.correccionId,
        ) as { precio_centavos: number }
      ).precio_centavos,
    ).toBe(2500);
    expect(versionEfectivaOrden(e.db, e.ordenId)[1].precioCentavos).toBe(2500);
    expect(totalEfectivoCuenta(e.db, e.cuentaId)).toBe(8900 + 2 * 2500);
    e.db.close();
  });

  it("corregir una línea original no la reprecia con la carta nueva", async () => {
    const e = await ordenEnviada((ids) => [{ productoId: ids.jugo, cantidad: 2 }]);
    e.db.prepare("UPDATE productos SET precio_centavos = 9900 WHERE id = ?").run(e.ids.jugo);

    const result = await corregir(e.db, { ordenId: e.ordenId, lineas: [cambio(e.lineas[0], 3)] });

    expect(
      (
        e.db.prepare("SELECT precio_centavos FROM orden_correccion_lineas WHERE correccion_id = ?").get(
          result.correccionId,
        ) as { precio_centavos: number }
      ).precio_centavos,
    ).toBe(2500);
    expect(versionEfectivaOrden(e.db, e.ordenId)[0].precioCentavos).toBe(2500);
    expect(totalEfectivoCuenta(e.db, e.cuentaId)).toBe(3 * 2500);
    e.db.close();
  });
});
