import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { DialogContent, DialogDescription, DialogFooter, DialogOverlay, DialogTitle } from "@/components/ui/dialog.tsx";
import { CrearProducto, type Categoria, type CrearProductoProps } from "./CrearProducto.tsx";

export type ModalCrearProductoProps = {
  abierto: boolean;
  categorias: Categoria[];
  ingredientesDisponibles?: Array<{ id: number; nombre: string }>;
  error?: string;
  onGuardar: CrearProductoProps["onGuardar"];
  onCerrar: () => void;
};

export function ModalCrearProducto({ abierto, categorias, ingredientesDisponibles = [], error = "", onGuardar, onCerrar }: ModalCrearProductoProps) {
  const [sucio, setSucio] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (!abierto) {
      setSucio(false);
      setConfirmando(false);
    }
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    function intentarCerrar() {
      if (sucio) setConfirmando(true);
      else onCerrar();
    }
    function puntero(e: PointerEvent) {
      if ((e.target as HTMLElement).closest(".crear-producto-modal, .confirmar-descarte")) return;
      intentarCerrar();
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") intentarCerrar();
    }
    document.addEventListener("pointerdown", puntero);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", puntero);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto, sucio, onCerrar]);

  if (!abierto) return null;

  return (
    <>
      <DialogOverlay role="dialog" aria-modal="true" aria-label="Crear producto">
        <DialogContent className="crear-producto-modal">
          <DialogTitle>Crear producto</DialogTitle>
          <CrearProducto
            categorias={categorias}
            ingredientesDisponibles={ingredientesDisponibles}
            error={error}
            onGuardar={onGuardar}
            onCancelar={() => {
              if (sucio) setConfirmando(true);
              else onCerrar();
            }}
            onDirtyChange={setSucio}
          />
        </DialogContent>
      </DialogOverlay>
      {confirmando ? (
        <DialogOverlay className="confirmar-descarte" role="alertdialog" aria-modal="true" aria-label="Confirmar descarte">
          <DialogContent>
            <DialogTitle>¿Descartar el producto?</DialogTitle>
            <DialogDescription>Se perderán los datos capturados.</DialogDescription>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmando(false)}>
                Seguir editando
              </Button>
              <Button type="button" variant="destructive" onClick={onCerrar}>
                Descartar
              </Button>
            </DialogFooter>
          </DialogContent>
        </DialogOverlay>
      ) : null}
    </>
  );
}
