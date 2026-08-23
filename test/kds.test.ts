import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { configurarSlots, listarContornos } from "../src/modules/contornos/contornos.ts";
import { crearEmpleado } from "../src/modules/empleados/empleados.ts";
import {
  avanzarEtapa,
  ETAPAS_DESTINO,
  ETAPAS_TAREA,
  KdsError,
  tarjetasKds,
  type TarjetaKds,
} from "../src/modules/kds/kds.ts";
import { corregirOrden } from "../src/modules/ordenes/correcciones.ts";
import { enviarOrden } from "../src/modules/ordenes/enviar.ts";
import { versionEfectivaOrden } from "../src/modules/ordenes/ordenes.ts";
import { agregarLinea, enviarACocina, guardarNotasPedido } from "../src/modules/pedidos/pedidos.ts";
import { seedCartaDemo } from "../src/modules/productos/seed.ts";
import { abrirMesa } from "../src/modules/salon/salon.ts";
import { MemoryPrinter } from "../src/print/memory.ts";
import { openTestDb } from "./helpers.ts";

type Db = ReturnType<typeof openTestDb>;

function mesaPorNumero(db: Db, numero: number): number {
  return (db.prepare("SELECT id FROM mesas WHERE numero = ?").get(numero) as { id: number }).id;
}

/**
 * Una comanda legacy (mesa 1), una comanda de orden y una de corrección
 * (mesa 7). Cocina las tiene que ver todas en la misma pantalla.
 */
async function escenarioMixto() {
  const db = openTestDb();
  const ids = seedCartaDemo(db);
  await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
  const printer = new MemoryPrinter();
  const cfg = defaultConfig();

  const mesa1 = mesaPorNumero(db, 1);
  const { pedidoId } = abrirMesa(db, { mesaId: mesa1, cubiertos: 2, preset: "salon", meseroId: 1 });
  agregarLinea(db, pedidoId, { productoId: ids.jugo, cantidad: 2, nota: "sin hielo" });
  guardarNotasPedido(db, pedidoId, { indicaciones: "todo junto" });
  await enviarACocina(db, pedidoId, "1234", printer, cfg);

  const orden = await enviarOrden(
    db,
    {
      mesaId: ids.mesa7,
      empleadoId: 1,
      claveIdempotencia: "kds-orden-1",
      lineas: [{ productoId: ids.agua, cantidad: 3, nota: "bien fría" }],
      indicaciones: "primero bebidas",
    },
    printer,
    cfg,
  );
  const linea = versionEfectivaOrden(db, orden.ordenId)[0];
  const correccion = await corregirOrden(
    db,
    {
      ordenId: orden.ordenId,
      lineas: [
        {
          lineaClave: linea.lineaClave,
          productoId: linea.productoId,
          ordenLineaId: linea.ordenLineaId,
          cantidad: 1,
          nota: "sin hielo tampoco",
        },
      ],
      claveIdempotencia: "kds-correccion-1",
      pin: "1234",
    },
    printer,
    cfg,
  );

  return { db, ids, cfg, printer, mesa1, pedidoId, orden, correccion, lineaClave: linea.lineaClave };
}

function porId(tarjetas: TarjetaKds[], comandaId: number): TarjetaKds {
  const tarjeta = tarjetas.find((t) => t.id === comandaId);
  if (!tarjeta) throw new Error(`sin tarjeta ${comandaId}`);
  return tarjeta;
}

describe("tarjetasKds", () => {
  it("lista comandas legacy y de cuenta en la misma pantalla, la última primero", async () => {
    const e = await escenarioMixto();

    const tarjetas = tarjetasKds(e.db);

    expect(tarjetas.map((t) => t.tipo)).toEqual(["correccion", "orden", "legacy"]);
    expect(tarjetas.map((t) => t.referencia)).toEqual([
      "Mesa #7 · Orden #1 · Corrección #1",
      "Mesa #7 · Orden #1",
      "Mesa #1 · Orden #1",
    ]);
    expect(tarjetas.every((t) => t.mesero === "Ana")).toBe(true);
    e.db.close();
  });

  it("la comanda legacy conserva mesa, líneas, notas e indicaciones del pedido", async () => {
    const e = await escenarioMixto();

    const legacy = tarjetasKds(e.db).filter((t) => t.tipo === "legacy")[0];

    expect(legacy).toMatchObject({
      mesa: 1,
      ordenId: null,
      correccionId: null,
      indicaciones: "todo junto",
      indicacionesCambiadas: false,
      esAnulacion: false,
    });
    expect(legacy.lineas).toEqual([
      {
        id: legacy.lineas[0].id,
        etapa: "por_preparar",
        esAviso: false,
        nombre: "Jugo",
        cantidad: 2,
        cantidadAnterior: null,
        delta: null,
        nota: "sin hielo",
        notaAnterior: null,
        contornos: [],
      },
    ]);
    e.db.close();
  });

  it("la comanda de orden trae sus líneas y las indicaciones vigentes", async () => {
    const e = await escenarioMixto();

    const tarjeta = porId(tarjetasKds(e.db), e.orden.comandaId);

    expect(tarjeta).toMatchObject({
      tipo: "orden",
      mesa: 7,
      ordenId: e.orden.ordenId,
      ordenNumero: 1,
      correccionId: null,
      indicaciones: "primero bebidas",
    });
    expect(tarjeta.lineas).toEqual([
      {
        id: tarjeta.lineas[0].id,
        etapa: "por_preparar",
        esAviso: false,
        nombre: "Agua con gas",
        cantidad: 3,
        cantidadAnterior: null,
        delta: null,
        nota: "bien fría",
        notaAnterior: null,
        contornos: [],
      },
    ]);
    e.db.close();
  });

  it("la comanda de un plato con contornos muestra las selecciones por línea", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const grupos = listarContornos(db).grupos;
    const proteina = grupos.find((grupo) => grupo.nombre === "Proteína")!;
    const carbohidrato = grupos.find((grupo) => grupo.nombre === "Carbohidrato")!;
    const pollo = proteina.variantes.find((item) => item.nombre === "Pollo")!;
    const papas = carbohidrato.variantes.find((item) => item.nombre === "Papas fritas")!;
    configurarSlots(db, ids.hamburguesa, [
      { posicion: 1, nombre: "Proteína", permiteExtra: true, grupoIds: [proteina.id] },
      { posicion: 2, nombre: "Contorno", grupoIds: [carbohidrato.id] },
    ]);

    const envio = await enviarOrden(
      db,
      {
        mesaId: ids.mesa7,
        empleadoId: 1,
        claveIdempotencia: "kds-contornos-1",
        lineas: [
          {
            productoId: ids.hamburguesa,
            cantidad: 1,
            contornos: [
              { slotPosicion: 1, varianteId: pollo.id },
              { slotPosicion: 2, varianteId: papas.id },
              { slotPosicion: 1, varianteId: pollo.id },
            ],
          },
        ],
      },
      new MemoryPrinter(),
      defaultConfig(),
    );

    const tarjeta = porId(tarjetasKds(db), envio.comandaId);
    expect(tarjeta.lineas[0].contornos).toEqual([
      "Proteína: Pollo",
      "EXTRA: Pollo",
      "Contorno: Papas fritas",
    ]);
    db.close();
  });

  it("la corrección muestra delta, notas anterior y nueva, y su etapa de aviso", async () => {
    const e = await escenarioMixto();

    const tarjeta = porId(tarjetasKds(e.db), e.correccion.comandaId);

    expect(tarjeta).toMatchObject({
      tipo: "correccion",
      mesa: 7,
      ordenNumero: 1,
      numeroVersion: 1,
      correccionId: e.correccion.correccionId,
      esAnulacion: false,
      indicacionesCambiadas: false,
    });
    expect(tarjeta.lineas).toEqual([
      {
        id: tarjeta.lineas[0].id,
        etapa: "aviso",
        esAviso: true,
        nombre: "Agua con gas",
        cantidad: 1,
        cantidadAnterior: 3,
        delta: -2,
        nota: "sin hielo tampoco",
        notaAnterior: "bien fría",
        contornos: [],
      },
    ]);
    e.db.close();
  });

  it("una corrección de solo indicaciones es un aviso sin líneas y actualiza la orden", async () => {
    const e = await escenarioMixto();

    const soloIndicaciones = await corregirOrden(
      e.db,
      {
        ordenId: e.orden.ordenId,
        lineas: [],
        indicaciones: "servir al final",
        claveIdempotencia: "kds-correccion-2",
        pin: "1234",
      },
      e.printer,
      e.cfg,
    );

    const tarjetas = tarjetasKds(e.db);
    const aviso = porId(tarjetas, soloIndicaciones.comandaId);
    expect(aviso.lineas).toEqual([]);
    expect(aviso).toMatchObject({ indicaciones: "servir al final", indicacionesCambiadas: true });
    // La orden manda lo vigente: cocina no puede quedarse con las del envío.
    expect(porId(tarjetas, e.orden.comandaId).indicaciones).toBe("servir al final");
    e.db.close();
  });

  it("una anulación queda marcada como tal en la referencia", async () => {
    const e = await escenarioMixto();

    const anulacion = await corregirOrden(
      e.db,
      {
        ordenId: e.orden.ordenId,
        lineas: [{ lineaClave: e.lineaClave, productoId: e.ids.agua, cantidad: 0 }],
        claveIdempotencia: "kds-anulacion-1",
        pin: "1234",
      },
      e.printer,
      e.cfg,
    );

    const tarjeta = porId(tarjetasKds(e.db), anulacion.comandaId);
    expect(tarjeta.tipo).toBe("anulacion");
    expect(tarjeta.esAnulacion).toBe(true);
    expect(tarjeta.referencia).toBe("Mesa #7 · Orden #1 · Anulación #2");
    e.db.close();
  });

  it("un pedido legacy sin mesa se lista igual", async () => {
    const db = openTestDb();
    const ids = seedCartaDemo(db);
    await crearEmpleado(db, { nombre: "Ana", pin: "1234", derecho: "basico" });
    const pedidoId = Number(
      db
        .prepare(
          "INSERT INTO pedidos (mesa_id, preset, cubiertos, estado, mesero_id, abierto_en) VALUES (NULL, 'salon', 1, 'abierto', 1, ?)",
        )
        .run(new Date().toISOString()).lastInsertRowid,
    );
    agregarLinea(db, pedidoId, { productoId: ids.jugo, cantidad: 1 });
    await enviarACocina(db, pedidoId, "1234", new MemoryPrinter(), defaultConfig());

    const tarjetas = tarjetasKds(db);

    expect(tarjetas).toHaveLength(1);
    expect(tarjetas[0].mesa).toBeNull();
    expect(tarjetas[0].referencia).toBe("Sin mesa · Orden #1");
    db.close();
  });
});

describe("avanzarEtapa", () => {
  it("la taxonomía separa tareas de destinos válidos", () => {
    expect([...ETAPAS_TAREA]).toEqual(["por_preparar", "en_proceso"]);
    expect([...ETAPAS_DESTINO]).toEqual(["en_proceso", "listo", "servido"]);
  });

  it("avanza una tarea de por_preparar a en_proceso y a listo", async () => {
    const e = await escenarioMixto();
    const linea = e.db
      .prepare("SELECT id FROM comanda_lineas WHERE comanda_id = ?")
      .get(e.orden.comandaId) as { id: number };

    avanzarEtapa(e.db, linea.id, "en_proceso");
    expect(etapaDe(e.db, linea.id)).toBe("en_proceso");
    avanzarEtapa(e.db, linea.id, "listo");
    expect(etapaDe(e.db, linea.id)).toBe("listo");
    e.db.close();
  });

  it("no pisa un aviso: la corrección es historia, no una tarea", async () => {
    const e = await escenarioMixto();
    const aviso = e.db
      .prepare("SELECT id FROM comanda_lineas WHERE comanda_id = ?")
      .get(e.correccion.comandaId) as { id: number };

    expect(() => avanzarEtapa(e.db, aviso.id, "en_proceso")).toThrow(KdsError);
    expect(etapaDe(e.db, aviso.id)).toBe("aviso");
    e.db.close();
  });

  for (const terminal of ["listo", "servido", "cancelado"]) {
    it(`no reescribe lo ${terminal}`, async () => {
      const e = await escenarioMixto();
      const linea = e.db
        .prepare("SELECT id FROM comanda_lineas WHERE comanda_id = ?")
        .get(e.orden.comandaId) as { id: number };
      e.db.prepare("UPDATE comanda_lineas SET etapa = ? WHERE id = ?").run(terminal, linea.id);

      try {
        avanzarEtapa(e.db, linea.id, "servido");
        expect.unreachable("una etapa terminal no se avanza");
      } catch (err) {
        expect((err as KdsError).codigo).toBe("etapa_no_avanzable");
      }
      expect(etapaDe(e.db, linea.id)).toBe(terminal);
      e.db.close();
    });
  }

  it("rechaza una etapa fuera de la taxonomía y una línea inexistente", async () => {
    const e = await escenarioMixto();
    const linea = e.db
      .prepare("SELECT id FROM comanda_lineas WHERE comanda_id = ?")
      .get(e.orden.comandaId) as { id: number };

    try {
      avanzarEtapa(e.db, linea.id, "inventada");
      expect.unreachable("etapa inválida");
    } catch (err) {
      expect((err as KdsError).codigo).toBe("etapa_invalida");
    }
    // `por_preparar` no es destino: volver atrás no es avanzar.
    try {
      avanzarEtapa(e.db, linea.id, "por_preparar");
      expect.unreachable("no se vuelve atrás");
    } catch (err) {
      expect((err as KdsError).codigo).toBe("etapa_invalida");
    }
    try {
      avanzarEtapa(e.db, 99999, "en_proceso");
      expect.unreachable("línea inexistente");
    } catch (err) {
      expect((err as KdsError).codigo).toBe("linea_inexistente");
    }
    expect(etapaDe(e.db, linea.id)).toBe("por_preparar");
    e.db.close();
  });
});

function etapaDe(db: Db, comandaLineaId: number): string {
  return (db.prepare("SELECT etapa FROM comanda_lineas WHERE id = ?").get(comandaLineaId) as { etapa: string }).etapa;
}
