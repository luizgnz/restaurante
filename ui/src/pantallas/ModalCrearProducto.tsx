import { useEffect, useState } from "react";
import { CrearProducto, type Categoria, type CrearProductoProps } from "./CrearProducto.tsx";

export type ModalCrearProductoProps = {
  abierto: boolean;
  categorias: Categoria[];
  error?: string;
  onGuardar: CrearProductoProps["onGuardar"];
  onCerrar: () => void;
};

export function ModalCrearProducto({ abierto, categorias, error = "", onGuardar, onCerrar }: ModalCrearProductoProps) {
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
      <div className="modal-fondo" role="dialog" aria-modal="true" aria-label="Crear producto">
        <div className="modal-caja crear-producto-modal">
          <h2>Crear producto</h2>
          <CrearProducto
            categorias={categorias}
            error={error}
            onGuardar={onGuardar}
            onCancelar={() => {
              if (sucio) setConfirmando(true);
              else onCerrar();
            }}
            onDirtyChange={setSucio}
          />
        </div>
      </div>
      {confirmando ? (
        <div className="modal-fondo confirmar-descarte" role="alertdialog" aria-modal="true" aria-label="Confirmar descarte">
          <div className="modal-caja">
            <h2>¿Descartar el producto?</h2>
            <p className="login-odoo__ayuda">Se perderán los datos capturados.</p>
            <div className="form-odoo__acciones">
              <button type="button" className="tactil" onClick={() => setConfirmando(false)}>
                Seguir editando
              </button>
              <button type="button" className="peligro tactil" onClick={onCerrar}>
                Descartar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
