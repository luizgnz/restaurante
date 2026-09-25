import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { ImagePlus, Minus, Move, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";

const MAX_ARCHIVO_LOGO = 5 * 1024 * 1024;
const MAX_LOGO_PROCESADO = 900 * 1024;
const TIPOS_LOGO = new Set(["image/png", "image/jpeg", "image/webp"]);

export type FuenteLogo = {
  url: string;
  ancho: number;
  alto: number;
  nombre: string;
};

type Punto = { x: number; y: number };
type Props = {
  fuente: FuenteLogo;
  onCancelar: () => void;
  onGuardar: (dataUrl: string) => void;
};

type SelectorProps = {
  logo: string | null;
  nombreRestaurante: string;
  onCambiar: (logo: string | null) => void;
};

export function validarArchivoLogo(file: Pick<File, "size" | "type">): string | null {
  if (!TIPOS_LOGO.has(file.type)) return "Selecciona una imagen PNG, JPEG o WebP.";
  if (file.size > MAX_ARCHIVO_LOGO) return "La imagen supera 5 MB. Selecciona un archivo más liviano.";
  return null;
}

export function limitesDesplazamiento(
  anchoImagen: number,
  altoImagen: number,
  ladoMarco: number,
  zoom: number,
): Punto {
  if (anchoImagen <= 0 || altoImagen <= 0 || ladoMarco <= 0) return { x: 0, y: 0 };
  const escalaBase = ladoMarco / Math.min(anchoImagen, altoImagen);
  return {
    x: Math.max(0, (anchoImagen * escalaBase * zoom - ladoMarco) / 2),
    y: Math.max(0, (altoImagen * escalaBase * zoom - ladoMarco) / 2),
  };
}

export function calcularRecorte(
  anchoImagen: number,
  altoImagen: number,
  ladoMarco: number,
  zoom: number,
  desplazamiento: Punto,
) {
  const escalaBase = ladoMarco / Math.min(anchoImagen, altoImagen);
  const escala = escalaBase * zoom;
  const ladoFuente = ladoMarco / escala;
  const centroX = anchoImagen / 2 - desplazamiento.x / escala;
  const centroY = altoImagen / 2 - desplazamiento.y / escala;
  return {
    x: Math.max(0, Math.min(anchoImagen - ladoFuente, centroX - ladoFuente / 2)),
    y: Math.max(0, Math.min(altoImagen - ladoFuente, centroY - ladoFuente / 2)),
    lado: ladoFuente,
  };
}

function limitarPunto(punto: Punto, limites: Punto): Punto {
  return {
    x: Math.max(-limites.x, Math.min(limites.x, punto.x)),
    y: Math.max(-limites.y, Math.min(limites.y, punto.y)),
  };
}

function blobADataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo preparar el logo."));
    reader.readAsDataURL(blob);
  });
}

function canvasABlob(canvas: HTMLCanvasElement, calidad: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("El navegador no pudo procesar la imagen.")),
      "image/webp",
      calidad,
    );
  });
}

async function crearLogoOptimizado(
  imagen: HTMLImageElement,
  ladoMarco: number,
  zoom: number,
  desplazamiento: Punto,
): Promise<string> {
  const recorte = calcularRecorte(imagen.naturalWidth, imagen.naturalHeight, ladoMarco, zoom, desplazamiento);
  const tamanos = [1024, 896, 768];
  const calidades = [0.9, 0.82, 0.74, 0.66];

  for (const tamano of tamanos) {
    const canvas = document.createElement("canvas");
    canvas.width = tamano;
    canvas.height = tamano;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("El navegador no permite recortar imágenes.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      imagen,
      recorte.x,
      recorte.y,
      recorte.lado,
      recorte.lado,
      0,
      0,
      tamano,
      tamano,
    );
    for (const calidad of calidades) {
      const blob = await canvasABlob(canvas, calidad);
      if (blob.size <= MAX_LOGO_PROCESADO) return blobADataUrl(blob);
    }
  }
  throw new Error("El recorte sigue siendo demasiado pesado. Prueba con otra imagen.");
}

export function EditorLogo({ fuente, onCancelar, onGuardar }: Props) {
  const marcoRef = useRef<HTMLDivElement>(null);
  const imagenRef = useRef<HTMLImageElement>(null);
  const arrastreRef = useRef<{ pointerId: number; inicio: Punto; origen: Punto } | null>(null);
  const [ladoMarco, setLadoMarco] = useState(300);
  const [zoom, setZoom] = useState(1);
  const [desplazamiento, setDesplazamiento] = useState<Punto>({ x: 0, y: 0 });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const limites = useMemo(
    () => limitesDesplazamiento(fuente.ancho, fuente.alto, ladoMarco, zoom),
    [fuente.alto, fuente.ancho, ladoMarco, zoom],
  );
  const escalaBase = ladoMarco / Math.min(fuente.ancho, fuente.alto);

  useEffect(() => {
    const marco = marcoRef.current;
    if (!marco) return;
    const medir = () => setLadoMarco(marco.getBoundingClientRect().width || 300);
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(marco);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setDesplazamiento((actual) => limitarPunto(actual, limites));
  }, [limites.x, limites.y]);

  function mover(event: ReactPointerEvent<HTMLDivElement>) {
    const arrastre = arrastreRef.current;
    if (!arrastre || arrastre.pointerId !== event.pointerId) return;
    setDesplazamiento(limitarPunto({
      x: arrastre.origen.x + event.clientX - arrastre.inicio.x,
      y: arrastre.origen.y + event.clientY - arrastre.inicio.y,
    }, limites));
  }

  function terminarArrastre(event: ReactPointerEvent<HTMLDivElement>) {
    if (arrastreRef.current?.pointerId === event.pointerId) arrastreRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  async function guardar() {
    const imagen = imagenRef.current;
    if (!imagen) return;
    setGuardando(true);
    setError("");
    try {
      onGuardar(await crearLogoOptimizado(imagen, ladoMarco, zoom, desplazamiento));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo preparar el logo.");
      setGuardando(false);
    }
  }

  return (
    <Dialog aria-label="Editar logo" onOverlayClick={guardando ? undefined : onCancelar}>
      <DialogContent className="logo-editor-dialog">
        <DialogHeader>
          <DialogTitle>Ajustar logo</DialogTitle>
          <DialogDescription>Mueve la imagen y usa el zoom para elegir la parte que quieres mostrar.</DialogDescription>
        </DialogHeader>
        <div
          ref={marcoRef}
          className="logo-editor__marco"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            arrastreRef.current = {
              pointerId: event.pointerId,
              inicio: { x: event.clientX, y: event.clientY },
              origen: desplazamiento,
            };
          }}
          onPointerMove={mover}
          onPointerUp={terminarArrastre}
          onPointerCancel={terminarArrastre}
          aria-label="Área de recorte del logo"
        >
          <img
            ref={imagenRef}
            src={fuente.url}
            alt="Vista previa del logo para recortar"
            draggable={false}
            style={{
              width: fuente.ancho * escalaBase * zoom,
              height: fuente.alto * escalaBase * zoom,
              left: `calc(50% + ${desplazamiento.x}px)`,
              top: `calc(50% + ${desplazamiento.y}px)`,
            }}
          />
          <span className="logo-editor__guia" aria-hidden="true" />
          <span className="logo-editor__mover" aria-hidden="true"><Move size={18} />Arrastra para encuadrar</span>
        </div>
        <div className="logo-editor__zoom">
          <Button type="button" size="icon" variant="outline" aria-label="Alejar logo" disabled={zoom <= 1} onClick={() => setZoom((actual) => Math.max(1, Number((actual - 0.1).toFixed(1))))}><Minus size={18} /></Button>
          <label htmlFor="logo-zoom">Zoom
            <input id="logo-zoom" type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
          <Button type="button" size="icon" variant="outline" aria-label="Acercar logo" disabled={zoom >= 3} onClick={() => setZoom((actual) => Math.min(3, Number((actual + 0.1).toFixed(1))))}><Plus size={18} /></Button>
        </div>
        <p className="logo-editor__archivo"><ImagePlus size={16} aria-hidden="true" />{fuente.nombre} · salida cuadrada optimizada</p>
        {error ? <p className="settings-feedback is-error" role="alert">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={guardando} onClick={onCancelar}>Cancelar</Button>
          <Button type="button" disabled={guardando} onClick={guardar}>{guardando ? "Preparando…" : "Usar este recorte"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SelectorLogo({ logo, nombreRestaurante, onCambiar }: SelectorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fuenteRef = useRef<FuenteLogo | null>(null);
  const [fuente, setFuente] = useState<FuenteLogo | null>(null);
  const [error, setError] = useState("");
  const [logoFallido, setLogoFallido] = useState(false);

  useEffect(() => setLogoFallido(false), [logo]);
  useEffect(() => {
    fuenteRef.current = fuente;
  }, [fuente]);
  useEffect(() => () => {
    if (fuenteRef.current) URL.revokeObjectURL(fuenteRef.current.url);
  }, []);

  function cerrarEditor() {
    if (fuente) URL.revokeObjectURL(fuente.url);
    setFuente(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function seleccionar(file?: File) {
    if (!file) return;
    const problema = validarArchivoLogo(file);
    if (problema) {
      setError(problema);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setError("");
    const url = URL.createObjectURL(file);
    const imagen = new Image();
    imagen.onload = () => setFuente({ url, ancho: imagen.naturalWidth, alto: imagen.naturalHeight, nombre: file.name });
    imagen.onerror = () => {
      URL.revokeObjectURL(url);
      setError("No pudimos abrir esa imagen. Prueba con otro archivo PNG, JPEG o WebP.");
      if (inputRef.current) inputRef.current.value = "";
    };
    imagen.src = url;
  }

  return (
    <div className="logo-selector">
      <div className="logo-selector__preview">
        {logo && !logoFallido ? (
          <img src={logo} alt={`Logo de ${nombreRestaurante}`} onError={() => setLogoFallido(true)} />
        ) : (
          <span aria-hidden="true"><ImagePlus size={26} /></span>
        )}
        <div>
          <strong>{logo && !logoFallido ? "Logo actual" : "Sin logo disponible"}</strong>
          <small>El nombre del restaurante siempre seguirá visible.</small>
        </div>
      </div>
      <input
        ref={inputRef}
        className="visually-hidden"
        id="archivo-logo"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => seleccionar(event.target.files?.[0])}
      />
      <div className="logo-selector__actions">
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}><Upload size={18} />{logo ? "Cambiar logo" : "Seleccionar logo"}</Button>
        {logo ? <Button type="button" variant="ghost" onClick={() => onCambiar(null)}><Trash2 size={18} />Quitar logo</Button> : null}
      </div>
      <p className="logo-selector__help">PNG, JPEG o WebP · máximo 5 MB. Podrás elegir el recorte y ajustar el zoom antes de guardarlo.</p>
      {logoFallido ? <p className="settings-feedback is-error" role="alert">El logo guardado no puede mostrarse. Selecciona otra imagen.</p> : null}
      {error ? <p className="settings-feedback is-error" role="alert">{error}</p> : null}
      {fuente ? (
        <EditorLogo
          fuente={fuente}
          onCancelar={cerrarEditor}
          onGuardar={(dataUrl) => {
            onCambiar(dataUrl);
            cerrarEditor();
          }}
        />
      ) : null}
    </div>
  );
}
