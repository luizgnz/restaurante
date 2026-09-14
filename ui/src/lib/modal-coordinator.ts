import { useCallback, useState } from "react";

export type ModalActivo =
  | "pin"
  | "vista-previa"
  | "comanda"
  | "precuenta"
  | "reimpresion"
  | "confirmar-cierre"
  | "confirmar-cancelacion"
  | "cuenta"
  | "editar-orden"
  | "crear-producto";

/** Mantiene una sola capa interactiva activa y reemplaza la anterior al abrir otra. */
export function useModalCoordinator() {
  const [modalActivo, setModalActivo] = useState<ModalActivo | null>(null);
  const abrirModal = useCallback((modal: ModalActivo) => setModalActivo(modal), []);
  const cerrarModal = useCallback((modal?: ModalActivo) => {
    setModalActivo((actual) => !modal || actual === modal ? null : actual);
  }, []);
  return { modalActivo, abrirModal, cerrarModal };
}
