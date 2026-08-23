import { describe, expect, it, vi } from "vitest";
import type { CuentaDetalleUi } from "../ui/src/pantallas/CuentaMesa.tsx";
import {
  completarEnvioBorrador,
  contextoNuevaOrdenDeCuenta,
  cuentaConocidaDeMesa,
  ejecutarAccionModal,
  estadoMesaConCuentas,
  registrarCuentaConocida,
  vistaTrasAccionCuenta,
} from "../ui/src/lib/flujo-cuentas.ts";

function cuenta(id: number, mesaId: number, numero: number, estado: CuentaDetalleUi["estado"] = "abierta"): CuentaDetalleUi {
  return {
    id,
    mesa: { id: mesaId, numero },
    estado,
    notaPrivada: null,
    totalCentavos: 0,
    ordenes: [],
  };
}

describe("flujo UI de cuentas conocidas", () => {
  it("Nueva orden de una cuenta produce contexto fijo de esa cuenta y mesa", () => {
    expect(contextoNuevaOrdenDeCuenta(cuenta(8, 3, 7))).toEqual({
      tipo: "cuenta",
      cuentaId: 8,
      mesaId: 3,
      mesaNumero: 7,
    });
  });

  it("conserva varias cuentas conocidas indexadas por mesa", () => {
    const conocidas = registrarCuentaConocida(
      registrarCuentaConocida({}, cuenta(8, 3, 7)),
      cuenta(9, 4, 8, "precuenta_emitida"),
    );

    expect(cuentaConocidaDeMesa(conocidas, 3)?.id).toBe(8);
    expect(cuentaConocidaDeMesa(conocidas, 4)?.id).toBe(9);
    expect(estadoMesaConCuentas("libre", conocidas, 3)).toBe("en_cocina");
    expect(estadoMesaConCuentas("libre", conocidas, 4)).toBe("precuenta");
  });

  it("mantiene en caja una mesa conocida y vuelve al plano tras handoff", () => {
    const conocidas = registrarCuentaConocida({}, cuenta(8, 3, 7, "en_caja"));

    expect(estadoMesaConCuentas("libre", conocidas, 3)).toBe("en_caja");
    expect(vistaTrasAccionCuenta("enviar-caja")).toBe("plano");
    expect(cuentaConocidaDeMesa(conocidas, 3)?.estado).toBe("en_caja");
  });
});

describe("finalización segura del borrador", () => {
  it("elimina el borrador solo después de cargar la cuenta", async () => {
    const pasos: string[] = [];
    await completarEnvioBorrador({
      cuentaId: 8,
      cargarCuenta: async () => {
        pasos.push("cuenta");
        return cuenta(8, 3, 7);
      },
      eliminarBorrador: () => pasos.push("borrador"),
    });

    expect(pasos).toEqual(["cuenta", "borrador"]);
  });

  it("conserva el borrador si falla cargar la cuenta", async () => {
    const eliminar = vi.fn();

    await expect(
      completarEnvioBorrador({
        cuentaId: 8,
        cargarCuenta: async () => {
          throw new Error("GET caído");
        },
        eliminarBorrador: eliminar,
      }),
    ).rejects.toThrow("GET caído");
    expect(eliminar).not.toHaveBeenCalled();
  });
});

describe("reintentos dentro de modal", () => {
  it("expone el error y permite ejecutar nuevamente la acción", async () => {
    const errores: string[] = [];
    let intentos = 0;
    const accion = async () => {
      intentos += 1;
      if (intentos === 1) throw new Error("PIN inválido");
    };

    expect(await ejecutarAccionModal(accion, (error) => errores.push(error))).toBe(false);
    expect(errores.at(-1)).toBe("PIN inválido");
    expect(await ejecutarAccionModal(accion, (error) => errores.push(error))).toBe(true);
    expect(errores.at(-1)).toBe("");
    expect(intentos).toBe(2);
  });
});
