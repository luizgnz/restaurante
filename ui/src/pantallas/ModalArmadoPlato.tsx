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

export function ModalArmadoPlato({ productoNombre, slots, variantes, onConfirmar, onCancelar }: Props) {
  const [elegidas, setElegidas] = useState<Record<number, number | undefined>>({});
  const [extras, setExtras] = useState<SeleccionArmado[]>([]);

  const completos = slots.every((slot) => elegidas[slot.posicion] !== undefined);

  function variantesDe(slot: SlotArmadoUi): VarianteArmadoUi[] {
    const grupos = new Set(slot.grupos.map((grupo) => grupo.id));
    return variantes.filter((variante) => grupos.has(variante.grupoId));
  }

  function nombreVariante(varianteId: number): string {
    return variantes.find((variante) => variante.id === varianteId)?.nombre ?? "?";
  }

  function confirmar() {
    if (!completos) return;
    const selecciones: SeleccionArmado[] = [];
    for (const slot of slots) {
      const elegida = elegidas[slot.posicion];
      if (elegida === undefined) return;
      selecciones.push({ slotPosicion: slot.posicion, varianteId: elegida });
      for (const extra of extras.filter((item) => item.slotPosicion === slot.posicion)) {
        selecciones.push(extra);
      }
    }
    const partes = slots.map((slot) => nombreVariante(elegidas[slot.posicion]!));
    for (const extra of extras) partes.push(`+ Extra ${nombreVariante(extra.varianteId)}`);
    onConfirmar(selecciones, partes.join(" · "));
  }

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
          <span>{Object.values(elegidas).filter((valor) => valor !== undefined).length} de {slots.length} selecciones</span>
          <div><i style={{ width: `${slots.length ? (Object.values(elegidas).filter((valor) => valor !== undefined).length / slots.length) * 100 : 0}%` }} /></div>
        </div>
        {slots.map((slot) => {
          const gruposDistintos = slot.grupos.length > 1;
          return (
            <fieldset className="armado-plato__slot" key={slot.posicion}>
              <legend><span>{slot.posicion}</span>{slot.nombre}{elegidas[slot.posicion] ? <Check size={18} aria-hidden="true" /> : null}</legend>
              {slot.grupos.map((grupo) => {
                const delGrupo = variantesDe(slot).filter((variante) => variante.grupoId === grupo.id);
                if (delGrupo.length === 0) return null;
                return (
                  <div key={grupo.id}>
                    {gruposDistintos ? <p className="armado-plato__grupo">{grupo.nombre}</p> : null}
                    <div className="armado-plato__variantes">
                      {delGrupo.map((variante) => {
                        const elegida = elegidas[slot.posicion] === variante.id;
                        return (
                          <Button
                            type="button"
                            variant={elegida ? "default" : "outline"}
                            key={variante.id}
                            className={`tactil${elegida ? " is-on" : ""}`}
                            aria-pressed={elegida}
                            onClick={() => setElegidas({ ...elegidas, [slot.posicion]: variante.id })}
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
          <Button type="button" className="primario" size="lg" disabled={!completos} onClick={confirmar}>
            <Check size={19} aria-hidden="true" /> Agregar a la orden
          </Button>
        </div>
      </div>
    </div>
  );
}
