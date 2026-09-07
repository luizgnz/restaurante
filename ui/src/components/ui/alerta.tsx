import { AlertTriangle, Info, X } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils.ts";

type AlertaTono = "peligro" | "aviso" | "info";

/**
 * Un solo componente de error/aviso para toda la UI. Los tonos usan los
 * mismos tokens de estado que Badge (soft de fondo + color de estado), que
 * siguen la regla "el color significa estado": peligro = rojo, aviso =
 * ámbar, info = azul.
 */
const tonoClases: Record<AlertaTono, string> = {
  peligro:
    "border-[color-mix(in_oklab,var(--destructive)_30%,var(--border))] bg-[var(--destructive-soft)] text-[var(--destructive)]",
  aviso: "border-[color-mix(in_oklab,var(--warning)_40%,var(--border))] bg-[var(--warning-soft)] text-[var(--warning)]",
  info: "border-[color-mix(in_oklab,var(--info)_35%,var(--border))] bg-[var(--info-soft)] text-[var(--info)]",
};

type AlertaProps = {
  tono?: AlertaTono;
  children: ReactNode;
  onCerrar?: () => void;
} & HTMLAttributes<HTMLDivElement>;

export function Alerta({ tono = "peligro", children, onCerrar, className, ...props }: AlertaProps) {
  const Icono = tono === "info" ? Info : AlertTriangle;
  return (
    <div
      role="alert"
      className={cn("flex items-start gap-2.5 rounded-lg border p-3 text-sm", tonoClases[tono], className)}
      {...props}
    >
      <Icono size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {onCerrar ? (
        <button
          type="button"
          aria-label="Cerrar aviso"
          className="-m-1 shrink-0 rounded-md bg-transparent p-1 text-inherit transition-colors hover:bg-card/60"
          onClick={onCerrar}
        >
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
