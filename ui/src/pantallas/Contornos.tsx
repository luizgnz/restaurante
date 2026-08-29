import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Select } from "@/components/ui/select.tsx";
import type { ProductoCarta } from "./ConstructorOrden.tsx";
import type { SlotArmadoUi, VarianteArmadoUi } from "./ModalArmadoPlato.tsx";

export type GrupoContornoUi = {
  id: number;
  nombre: string;
  variantes: Array<VarianteArmadoUi & { activo?: boolean }>;
};

export type SlotEditorUi = SlotArmadoUi & { grupoIds: number[] };

type Props = {
  grupos: GrupoContornoUi[];
  productos: ProductoCarta[];
  onCrearGrupo: (nombre: string) => Promise<void>;
  onCrearVariante: (input: {
    grupoId: number;
    nombre: string;
    suplementoCentavos: number;
    extraCentavos: number;
  }) => Promise<void>;
  onCargarSlots: (productoId: number) => Promise<SlotArmadoUi[]>;
  onGuardarSlots: (productoId: number, slots: SlotEditorUi[]) => Promise<void>;
  onVolver: () => void;
};

function siguientePosicion(slots: SlotEditorUi[]): number {
  return slots.reduce((maximo, slot) => Math.max(maximo, slot.posicion), 0) + 1;
}

export function Contornos({
  grupos,
  productos,
  onCrearGrupo,
  onCrearVariante,
  onCargarSlots,
  onGuardarSlots,
  onVolver,
}: Props) {
  const [grupoNombre, setGrupoNombre] = useState("");
  const [variante, setVariante] = useState({ grupoId: 0, nombre: "", suplementoCentavos: 0, extraCentavos: 0 });
  const [productoId, setProductoId] = useState(0);
  const [slots, setSlots] = useState<SlotEditorUi[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function ejecutar(accion: () => Promise<void>) {
    setError("");
    try {
      await accion();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function elegirProducto(id: number) {
    setProductoId(id);
    if (!id) {
      setSlots([]);
      return;
    }
    await ejecutar(async () => {
      const cargados = await onCargarSlots(id);
      setSlots(
        cargados.map((slot) => ({
          ...slot,
          grupoIds: slot.grupos.map((grupo) => grupo.id),
        })),
      );
    });
  }

  function cambiarSlot(indice: number, patch: Partial<SlotEditorUi>) {
    setSlots(slots.map((slot, i) => (i === indice ? { ...slot, ...patch } : slot)));
  }

  function alternarGrupo(indice: number, grupoId: number) {
    const actuales = slots[indice].grupoIds;
    cambiarSlot(indice, {
      grupoIds: actuales.includes(grupoId) ? actuales.filter((id) => id !== grupoId) : [...actuales, grupoId],
    });
  }

  return (
    <section className="page-shell contornos-admin">
      <header className="page-header cuenta-mesa__cabecera">
        <div>
          <span className="page-eyebrow">Configuración de la carta</span>
          <h1>Contornos</h1>
          <p>Configura variantes globales y las opciones que acepta cada plato.</p>
        </div>
        <Button type="button" variant="outline" onClick={onVolver}>Volver</Button>
      </header>

      {error ? <p role="alert">{error}</p> : null}

      <div className="contornos-admin__columnas">
        <Card className="tarjeta">
          <h2>Grupos y variantes</h2>
          {grupos.length === 0 ? <p>No hay grupos de contornos.</p> : null}
          {grupos.map((grupo) => (
            <section className="contornos-admin__grupo" key={grupo.id}>
              <h3>{grupo.nombre}</h3>
              {grupo.variantes.length === 0 ? <p className="login-odoo__ayuda">Sin variantes.</p> : null}
              <ul>
                {grupo.variantes.map((item) => (
                  <li key={item.id}>
                    <span>{item.nombre}</span>
                    <span>
                      Suplemento ${item.suplementoCentavos} · Extra ${item.extraCentavos}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <form
            className="form-odoo contornos-admin__formulario"
            onSubmit={(event) => {
              event.preventDefault();
              ejecutar(async () => {
                await onCrearGrupo(grupoNombre);
                setGrupoNombre("");
              });
            }}
          >
            <h3>Nuevo grupo</h3>
            <label>
              Nombre
              <Input value={grupoNombre} onChange={(event) => setGrupoNombre(event.target.value)} required />
            </label>
            <Button type="submit">Crear grupo</Button>
          </form>

          <form
            className="form-odoo contornos-admin__formulario"
            onSubmit={(event) => {
              event.preventDefault();
              ejecutar(async () => {
                await onCrearVariante(variante);
                setVariante({ ...variante, nombre: "", suplementoCentavos: 0, extraCentavos: 0 });
              });
            }}
          >
            <h3>Nueva variante</h3>
            <label>
              Grupo
              <Select
                value={variante.grupoId || ""}
                onChange={(event) => setVariante({ ...variante, grupoId: Number(event.target.value) })}
                required
              >
                <option value="">Selecciona un grupo</option>
                {grupos.map((grupo) => <option key={grupo.id} value={grupo.id}>{grupo.nombre}</option>)}
              </Select>
            </label>
            <label>
              Nombre
              <Input value={variante.nombre} onChange={(event) => setVariante({ ...variante, nombre: event.target.value })} required />
            </label>
            <label>
              Suplemento
              <Input
                type="number"
                min="0"
                value={variante.suplementoCentavos}
                onChange={(event) => setVariante({ ...variante, suplementoCentavos: Number(event.target.value) })}
              />
            </label>
            <label>
              Precio extra
              <Input
                type="number"
                min="0"
                value={variante.extraCentavos}
                onChange={(event) => setVariante({ ...variante, extraCentavos: Number(event.target.value) })}
              />
            </label>
            <Button type="submit">Crear variante</Button>
          </form>
        </Card>

        <Card className="tarjeta">
          <h2>Slots por plato</h2>
          <label>
            Producto
            <Select value={productoId || ""} onChange={(event) => elegirProducto(Number(event.target.value))}>
              <option value="">Selecciona un producto</option>
              {productos.map((producto) => <option key={producto.id} value={producto.id}>{producto.nombre}</option>)}
            </Select>
          </label>

          {productoId ? (
            <>
              {slots.map((slot, indice) => (
                <fieldset className="contornos-admin__slot" key={`${slot.posicion}-${indice}`}>
                  <legend>Slot {indice + 1}</legend>
                  <label>
                    Posición
                    <Input
                      type="number"
                      min="1"
                      value={slot.posicion}
                      onChange={(event) => cambiarSlot(indice, { posicion: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    Nombre
                    <Input value={slot.nombre} onChange={(event) => cambiarSlot(indice, { nombre: event.target.value })} />
                  </label>
                  <div className="contornos-admin__checks">
                    <span>Grupos permitidos</span>
                    {grupos.map((grupo) => (
                      <label key={grupo.id}>
                        <Checkbox
                          checked={slot.grupoIds.includes(grupo.id)}
                          onChange={() => alternarGrupo(indice, grupo.id)}
                        />
                        {grupo.nombre}
                      </label>
                    ))}
                  </div>
                  <label>
                    <Checkbox
                      checked={slot.permiteExtra}
                      onChange={(event) => cambiarSlot(indice, { permiteExtra: event.target.checked })}
                    />
                    Permite extras
                  </label>
                  <Button type="button" variant="destructive" onClick={() => setSlots(slots.filter((_, i) => i !== indice))}>
                    Quitar slot
                  </Button>
                </fieldset>
              ))}
              <div className="form-odoo__acciones">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setSlots([
                      ...slots,
                      { posicion: siguientePosicion(slots), nombre: "", permiteExtra: false, grupos: [], grupoIds: [] },
                    ])
                  }
                >
                  Agregar slot
                </Button>
                <Button
                  type="button"
                  disabled={guardando}
                  onClick={() =>
                    ejecutar(async () => {
                      setGuardando(true);
                      try {
                        await onGuardarSlots(productoId, slots);
                      } finally {
                        setGuardando(false);
                      }
                    })
                  }
                >
                  {guardando ? "Guardando…" : "Guardar slots"}
                </Button>
              </div>
            </>
          ) : <p className="login-odoo__ayuda">Elige un producto para configurar su armado.</p>}
        </Card>
      </div>
    </section>
  );
}
