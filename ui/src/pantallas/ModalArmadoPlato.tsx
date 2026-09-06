import { useState } from "react";
import { Check, Minus, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";

export type SlotArmadoUi = {
  posicion: number;
  nombre: string;
  permiteExtra: boolean;
  grupos: Array<{ id: number; nombre: string }>;
};

export type VarianteArmadoUi = {
  id: number;
  grupoId: number;
  nombre: string;
  suplementoCentavos: number;
  extraCentavos: number;
};

export type SeleccionArmado = { slotPosicion: number; varianteId: number };

export type EleccionPorGrupo = Record<number, number | undefined>;
export type EleccionPorSlot = Record<number, EleccionPorGrupo | undefined>;

type Props = {
  productoNombre: string;
  slots: SlotArmadoUi[];
  variantes: VarianteArmadoUi[];
  onConfirmar: (selecciones: SeleccionArmado[], resumen: string) => void;
  onCancelar: () => void;
};

function precio(cantidad: number): string {
  return `$${cantidad}`;
}

/** Grupos del slot que tienen variantes activas: son los que exigen una elección. */
export function gruposRequeridos(slot: SlotArmadoUi, variantes: VarianteArmadoUi[]): Array<{ id: number; nombre: string }> {
  const conVariantes = new Set(variantes.map((variante) => variante.grupoId));
  return slot.grupos.filter((grupo) => conVariantes.has(grupo.id));
}

export function armadoCompleto(slots: SlotArmadoUi[], variantes: VarianteArmadoUi[], elegidas: EleccionPorSlot): boolean {
  return slots.every((slot) =>
    gruposRequeridos(slot, variantes).every((grupo) => elegidas[slot.posicion]?.[grupo.id] !== undefined),
  );
}

/** Construye el payload de selecciones (una por grupo + extras) o null si falta algo. */
export function construirSelecciones(
  slots: SlotArmadoUi[],
  variantes: VarianteArmadoUi[],
  elegidas: EleccionPorSlot,
  extras: SeleccionArmado[],
): SeleccionArmado[] | null {
  if (!armadoCompleto(slots, variantes, elegidas)) return null;
  const selecciones: SeleccionArmado[] = [];
  for (const slot of slots) {
    for (const grupo of gruposRequeridos(slot, variantes)) {
      const varianteId = elegidas[slot.posicion]?.[grupo.id];
      if (varianteId === undefined) return null;
      selecciones.push({ slotPosicion: slot.posicion, varianteId });
    }
    for (const extra of extras.filter((item) => item.slotPosicion === slot.posicion)) {
      selecciones.push(extra);
    }
  }
  return selecciones;
}

export function resumenArmado(
  slots: SlotArmadoUi[],
  variantes: VarianteArmadoUi[],
  elegidas: EleccionPorSlot,
  extras: SeleccionArmado[],
): string | null {
  if (!armadoCompleto(slots, variantes, elegidas)) return null;
  const nombreVariante = (varianteId: number): string =>
    variantes.find((variante) => variante.id === varianteId)?.nombre ?? "?";
  const partes: string[] = [];
  for (const slot of slots) {
    const delSlot = gruposRequeridos(slot, variantes)
      .map((grupo) => elegidas[slot.posicion]?.[grupo.id])
      .filter((varianteId): varianteId is number => varianteId !== undefined)
      .map(nombreVariante);
    if (delSlot.length === 0) return null;
    partes.push(delSlot.join(" + "));
  }
  for (const extra of extras) partes.push(`+ Extra ${nombreVariante(extra.varianteId)}`);
  return partes.join(" · ");
}

export function ModalArmadoPlato({ productoNombre, slots, variantes, onConfirmar, onCancelar }: Props) {
  const [elegidas, setElegidas] = useState<EleccionPorSlot>({});
  const [extras, setExtras] = useState<SeleccionArmado[]>([]);

  const completo = armadoCompleto(slots, variantes, elegidas);

  function variantesDe(slot: SlotArmadoUi): VarianteArmadoUi[] {
    const grupos = new Set(slot.grupos.map((grupo) => grupo.id));
    return variantes.filter((variante) => grupos.has(variante.grupoId));
  }

  function nombreVariante(varianteId: number): string {
    return variantes.find((variante) => variante.id === varianteId)?.nombre ?? "?";
  }

  function confirmar() {
    const selecciones = construirSelecciones(slots, variantes, elegidas, extras);
    const resumen = resumenArmado(slots, variantes, elegidas, extras);
    if (selecciones === null || resumen === null) return;
    onConfirmar(selecciones, resumen);
  }

  function elegirVariante(slot: SlotArmadoUi, grupoId: number, varianteId: number) {
    setElegidas({ ...elegidas, [slot.posicion]: { ...(elegidas[slot.posicion] ?? {}), [grupoId]: varianteId } });
  }

  const gruposTotales = slots.reduce((total, slot) => total + gruposRequeridos(slot, variantes).length, 0);
  const gruposElegidos = slots.reduce(
    (total, slot) =>
      total + gruposRequeridos(slot, variantes).filter((grupo) => elegidas[slot.posicion]?.[grupo.id] !== undefined).length,
    0,
  );

  return (
    <div
      className="modal-fondo"
      role="dialog"
      aria-modal="true"
      aria-label={`Armado de ${productoNombre}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancelar();
      }}
    >
      <div className="modal-caja armado-plato">
        <header className="armado-plato__cabecera">
          <div>
            <span className="armado-plato__eyebrow">Personaliza tu plato</span>
            <h2>{productoNombre}</h2>
            <p>Elige una opción en cada sección. Puedes agregar extras donde estén disponibles.</p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Cerrar armado" onClick={onCancelar}>
            <X size={21} aria-hidden="true" />
          </Button>
        </header>
        <div className="armado-plato__progreso" aria-label="Progreso del armado">
          <span>{gruposElegidos} de {gruposTotales} selecciones</span>
          <div><i style={{ width: `${gruposTotales ? (gruposElegidos / gruposTotales) * 100 : 0}%` }} /></div>
        </div>
        {slots.map((slot) => {
          const gruposDistintos = slot.grupos.length > 1;
          const requeridos = gruposRequeridos(slot, variantes);
          const slotCompleto = requeridos.every((grupo) => elegidas[slot.posicion]?.[grupo.id] !== undefined);
          return (
            <fieldset className="armado-plato__slot" key={slot.posicion}>
              <legend><span>{slot.posicion}</span>{slot.nombre}{slotCompleto ? <Check size={18} aria-hidden="true" /> : null}</legend>
              {slot.grupos.map((grupo) => {
                const delGrupo = variantesDe(slot).filter((variante) => variante.grupoId === grupo.id);
                if (delGrupo.length === 0) return null;
                return (
                  <div key={grupo.id}>
                    {gruposDistintos ? <p className="armado-plato__grupo">{grupo.nombre}</p> : null}
                    <div className="armado-plato__variantes">
                      {delGrupo.map((variante) => {
                        const elegida = elegidas[slot.posicion]?.[grupo.id] === variante.id;
                        return (
                          <Button
                            type="button"
                            variant={elegida ? "default" : "outline"}
                            key={variante.id}
                            className={`tactil${elegida ? " is-on" : ""}`}
                            aria-pressed={elegida}
                            onClick={() => elegirVariante(slot, grupo.id, variante.id)}
                          >
                            {variante.nombre}
                            {variante.suplementoCentavos > 0 ? (
                              <span className="armado-plato__precio"> +{precio(variante.suplementoCentavos)}</span>
                            ) : null}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {slot.permiteExtra ? (
                <div className="armado-plato__extras">
                  <p><Sparkles size={16} aria-hidden="true" /> Extras opcionales</p>
                  {variantesDe(slot).filter((variante) => variante.extraCentavos > 0).map((variante) => (
                    <Button
                      type="button"
                      key={`extra-${variante.id}`}
                      variant="secondary"
                      size="sm"
                      className="armado-plato__extra"
                      onClick={() => setExtras([...extras, { slotPosicion: slot.posicion, varianteId: variante.id }])}
                    >
                      + Extra {variante.nombre}
                      {variante.extraCentavos > 0 ? ` (${precio(variante.extraCentavos)})` : ""}
                    </Button>
                  ))}
                </div>
              ) : null}
            </fieldset>
          );
        })}
        {extras.length > 0 ? (
          <ul className="armado-plato__extras-elegidos">
            {extras.map((extra, indice) => (
              <li key={`${extra.slotPosicion}-${extra.varianteId}-${indice}`}>
                + Extra {nombreVariante(extra.varianteId)}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Quitar extra ${nombreVariante(extra.varianteId)}`}
                  onClick={() => setExtras(extras.filter((item, i) => i !== indice))}
                >
                  <Minus size={16} aria-hidden="true" /> Quitar
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="constructor-orden__acciones">
          <Button type="button" variant="outline" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button type="button" size="lg" disabled={!completo} onClick={confirmar}>
            <Check size={19} aria-hidden="true" /> Agregar a la orden
          </Button>
        </div>
      </div>
    </div>
  );
}
