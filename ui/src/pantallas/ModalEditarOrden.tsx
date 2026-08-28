import { Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ejecutarAccionModal } from "../lib/flujo-cuentas.ts";
import { Button } from "../components/ui/button.tsx";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";
import { Select, SelectItem } from "../components/ui/select.tsx";
import { Textarea } from "../components/ui/textarea.tsx";
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
      <Dialog aria-label={`${modo === "anular" ? "Anular" : "Editar"} orden`}>
        <DialogContent className="correccion-modal">
          <DialogTitle>{modo === "anular" ? "Anular" : "Editar"} orden #{orden.numero}</DialogTitle>
          <div className="correccion-modal__lineas">
            {lineas.map((linea) => (
              <div className="constructor-linea" key={linea.idUi}>
                <Select
                  aria-label="Producto"
                  value={String(linea.productoId)}
                  disabled={modo === "anular"}
                  onValueChange={(value) =>
                    setLineas((actuales) =>
                      actuales.map((item) =>
                        item.idUi === linea.idUi ? { ...item, productoId: Number(value) } : item,
                      ),
                    )
                  }
                >
                  {productos.map((producto) => (
                    <SelectItem key={producto.id} value={String(producto.id)}>
                      {producto.nombre}
                    </SelectItem>
                  ))}
                </Select>
                <div className="modal-cantidad">
                  <Button
                    type="button"
                    variant="secondary"
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
                  </Button>
                  <strong>{linea.cantidad}</strong>
                  <Button
                    type="button"
                    variant="secondary"
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
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
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
                  </Button>
                </div>
                <Label>
                  Nota del producto
                  <Input
                    value={linea.nota}
                    disabled={modo === "anular"}
                    onChange={(event) =>
                      setLineas((actuales) =>
                        actuales.map((item) => (item.idUi === linea.idUi ? { ...item, nota: event.target.value } : item)),
                      )
                    }
                  />
                </Label>
              </div>
            ))}
          </div>
          {modo === "editar" ? (
            <Button
              type="button"
              variant="secondary"
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
            </Button>
          ) : null}
          <Label>
            Indicaciones del cliente
            <Textarea
              value={indicaciones}
              disabled={modo === "anular"}
              onChange={(event) => setIndicaciones(event.target.value)}
            />
          </Label>
          {requiereMotivo ? (
            <Label>
              Justificación
              <Textarea value={motivo} onChange={(event) => setMotivo(event.target.value)} />
            </Label>
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
            <Button type="button" variant="secondary" onClick={onCancelar} disabled={guardando}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant={modo === "anular" ? "destructive" : "default"}
              disabled={diff.length === 0 || (requiereMotivo && !motivo.trim()) || guardando}
              onClick={() => setPidiendoPin(true)}
            >
              Continuar y pedir PIN
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
