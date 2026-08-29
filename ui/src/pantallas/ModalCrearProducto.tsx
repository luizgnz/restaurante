import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog.tsx";
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

  function intentarCerrar() {
    if (sucio) setConfirmando(true);
    else onCerrar();
  }

  if (!abierto) return null;

  return (
    <>
      <Dialog aria-label="Crear producto" onOverlayClick={intentarCerrar}>
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
      </Dialog>
      {confirmando ? (
        <Dialog aria-label="Confirmar descarte">
          <DialogContent className="confirmar-descarte" role="alertdialog">
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
        </Dialog>
      ) : null}
    </>
  );
}
