import { Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ejecutarAccionModal } from "../lib/flujo-cuentas.ts";
import { PinPad } from "./PinPad.tsx";
import type { OrdenCuentaUi } from "./CuentaMesa.tsx";
import type { ProductoCarta } from "./ConstructorOrden.tsx";

export type CambioOrdenUi = {
  lineaClave: string;
  ordenLineaId: number | null;
  productoId: number;
  cantidad: number;
  nota: string;
};

export type LineaEditable = {
  idUi: string;
  lineaClaveSustituta: string;
  lineaClaveOriginal: string | null;
  ordenLineaId: number | null;
  productoIdOriginal: number | null;
  productoId: number;
  cantidadOriginal: number;
  cantidad: number;
  notaOriginal: string;
  nota: string;
};

type Props = {
  orden: OrdenCuentaUi;
  productos: ProductoCarta[];
  modo?: "editar" | "anular";
  pedirJustificacionAlAnular: boolean;
  onGuardar: (
    cambio: { claveIdempotencia: string; lineas: CambioOrdenUi[]; indicaciones: string; motivo?: string },
    pin: string,
  ) => Promise<void>;
  onCancelar: () => void;
};

function uuid() {
  return globalThis.crypto?.randomUUID?.() ?? `ui-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function crearLineasEditables(
  orden: OrdenCuentaUi,
  modo: "editar" | "anular",
  generarId: () => string = uuid,
): LineaEditable[] {
  return orden.lineas
    .filter((linea) => linea.cantidad > 0)
    .map((linea) => ({
      idUi: linea.lineaClave,
      lineaClaveSustituta: generarId(),
      lineaClaveOriginal: linea.lineaClave,
      ordenLineaId: linea.ordenLineaId,
      productoIdOriginal: linea.productoId,
      productoId: linea.productoId,
      cantidadOriginal: linea.cantidad,
      cantidad: modo === "anular" ? 0 : linea.cantidad,
      notaOriginal: linea.nota ?? "",
      nota: linea.nota ?? "",
    }));
}

export function prepararLineasCorreccion(lineas: LineaEditable[]): CambioOrdenUi[] {
  const salida: CambioOrdenUi[] = [];
  for (const linea of lineas) {
    if (linea.lineaClaveOriginal === null && linea.cantidad === 0) continue;
    if (linea.lineaClaveOriginal && linea.productoIdOriginal !== linea.productoId) {
      salida.push({
        lineaClave: linea.lineaClaveOriginal,
        ordenLineaId: linea.ordenLineaId,
        productoId: linea.productoIdOriginal!,
        cantidad: 0,
        nota: linea.notaOriginal,
      });
      salida.push({
        lineaClave: linea.lineaClaveSustituta,
        ordenLineaId: null,
        productoId: linea.productoId,
        cantidad: linea.cantidad,
        nota: linea.nota,
      });
      continue;
    }
    salida.push({
      lineaClave: linea.lineaClaveOriginal ?? linea.lineaClaveSustituta,
      ordenLineaId: linea.ordenLineaId,
      productoId: linea.productoId,
      cantidad: linea.cantidad,
      nota: linea.nota,
    });
  }
  return salida;
}

export function ModalEditarOrden({
  orden,
  productos,
  modo = "editar",
  pedirJustificacionAlAnular,
  onGuardar,
  onCancelar,
}: Props) {
  const [lineas, setLineas] = useState<LineaEditable[]>(() => crearLineasEditables(orden, modo));
  const [claveIdempotencia] = useState(uuid);
  const [indicaciones, setIndicaciones] = useState(orden.indicaciones ?? "");
  const [motivo, setMotivo] = useState("");
  const [pidiendoPin, setPidiendoPin] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorPin, setErrorPin] = useState("");
  const guardandoRef = useRef(false);

  const diff = useMemo(() => {
    const cambios: string[] = [];
    for (const linea of lineas) {
      const nombreOriginal =
        productos.find((producto) => producto.id === linea.productoIdOriginal)?.nombre ?? "Producto";
      const nombreNuevo = productos.find((producto) => producto.id === linea.productoId)?.nombre ?? "Producto";
      if (linea.productoIdOriginal === null) cambios.push(`+ ${linea.cantidad} × ${nombreNuevo}`);
      else if (linea.productoId !== linea.productoIdOriginal) {
        cambios.push(`${nombreOriginal}: producto → ${nombreNuevo}`);
      }
      if (linea.cantidad !== linea.cantidadOriginal) {
        cambios.push(`${nombreNuevo}: cantidad ${linea.cantidadOriginal} → ${linea.cantidad}`);
      }
      if (linea.nota !== linea.notaOriginal) {
        cambios.push(`${nombreNuevo}: nota “${linea.notaOriginal || "sin nota"}” → “${linea.nota || "sin nota"}”`);
      }
    }
    const antes = orden.indicaciones ?? "";
    if (indicaciones !== antes) {
      cambios.push(`Indicaciones: “${antes || "sin indicaciones"}” → “${indicaciones || "sin indicaciones"}”`);
    }
    return cambios;
  }, [indicaciones, lineas, orden.indicaciones, productos]);

  const llegaACero = lineas.some(
    (linea) =>
      linea.cantidadOriginal > 0 &&
      (linea.cantidad === 0 ||
        (linea.productoIdOriginal !== null && linea.productoId !== linea.productoIdOriginal)),
  );
  const requiereMotivo = pedirJustificacionAlAnular && llegaACero;

  async function guardar(pin: string) {
    if (guardandoRef.current) return;
    guardandoRef.current = true;
    setGuardando(true);
    try {
      await ejecutarAccionModal(
        () =>
          onGuardar(
            {
              claveIdempotencia,
              lineas: prepararLineasCorreccion(lineas),
              indicaciones,
              ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
            },
            pin,
          ),
        setErrorPin,
      );
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  }

  return (
    <>
      <div className="modal-fondo" role="dialog" aria-modal="true" aria-label={`${modo === "anular" ? "Anular" : "Editar"} orden`}>
        <div className="modal-caja correccion-modal">
          <h2>{modo === "anular" ? "Anular" : "Editar"} orden #{orden.numero}</h2>
          <div className="correccion-modal__lineas">
            {lineas.map((linea) => (
              <div className="constructor-linea" key={linea.idUi}>
                <select
                  aria-label="Producto"
                  value={linea.productoId}
                  disabled={modo === "anular"}
                  onChange={(event) =>
                    setLineas((actuales) =>
                      actuales.map((item) =>
                        item.idUi === linea.idUi ? { ...item, productoId: Number(event.target.value) } : item,
                      ),
                    )
                  }
                >
                  {productos.map((producto) => (
                    <option key={producto.id} value={producto.id}>
                      {producto.nombre}
                    </option>
                  ))}
                </select>
                <div className="modal-cantidad">
                  <button
                    type="button"
                    aria-label="Quitar una unidad"
                    disabled={modo === "anular" || linea.cantidad === 0}
                    onClick={() =>
                      setLineas((actuales) =>
                        actuales.map((item) =>
                          item.idUi === linea.idUi ? { ...item, cantidad: Math.max(0, item.cantidad - 1) } : item,
                        ),
                      )
                    }
                  >
                    −
                  </button>
                  <strong>{linea.cantidad}</strong>
                  <button
                    type="button"
                    aria-label="Agregar una unidad"
                    disabled={modo === "anular"}
                    onClick={() =>
                      setLineas((actuales) =>
                        actuales.map((item) =>
                          item.idUi === linea.idUi ? { ...item, cantidad: item.cantidad + 1 } : item,
                        ),
                      )
                    }
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="icono-secundario"
                    title="Dejar línea en cero"
                    disabled={modo === "anular"}
                    onClick={() =>
                      setLineas((actuales) =>
                        actuales.map((item) => (item.idUi === linea.idUi ? { ...item, cantidad: 0 } : item)),
                      )
                    }
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {modo === "editar" ? (
            <button
              type="button"
              onClick={() => {
                const producto = productos[0];
                if (!producto) return;
                const id = uuid();
                setLineas((actuales) => [
                  ...actuales,
                  {
                    idUi: id,
                    lineaClaveSustituta: id,
                    lineaClaveOriginal: null,
                    ordenLineaId: null,
                    productoIdOriginal: null,
                    productoId: producto.id,
                    cantidadOriginal: 0,
                    cantidad: 1,
                    notaOriginal: "",
                    nota: "",
                  },
                ]);
              }}
            >
              <Plus size={18} aria-hidden="true" /> Agregar producto
            </button>
          ) : null}
          <label>
            Indicaciones del cliente
            <textarea
              value={indicaciones}
              disabled={modo === "anular"}
              onChange={(event) => setIndicaciones(event.target.value)}
            />
          </label>
          {requiereMotivo ? (
            <label>
              Justificación
              <textarea value={motivo} onChange={(event) => setMotivo(event.target.value)} />
            </label>
          ) : null}
          <div className="correccion-diff">
            <h3>Vista previa de cambios</h3>
            {diff.length ? (
              <ul>
                {diff.map((linea) => (
                  <li key={linea}>{linea}</li>
                ))}
              </ul>
            ) : (
              <p>Sin cambios</p>
            )}
          </div>
          <div className="constructor-orden__acciones">
            <button type="button" onClick={onCancelar} disabled={guardando}>
              Cancelar
            </button>
            <button
              type="button"
              className={modo === "anular" ? "peligro" : "primario"}
              disabled={diff.length === 0 || (requiereMotivo && !motivo.trim()) || guardando}
              onClick={() => setPidiendoPin(true)}
            >
              Continuar y pedir PIN
            </button>
          </div>
        </div>
      </div>
      {pidiendoPin ? (
        <PinPad
          titulo={`PIN para ${modo === "anular" ? "anular" : "corregir"} orden`}
          error={errorPin}
          onCancelar={() => setPidiendoPin(false)}
          onPin={guardar}
        />
      ) : null}
    </>
  );
}
