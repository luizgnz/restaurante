import type * as React from "react";
import { cn } from "@/lib/utils.ts";

/* Interruptor on/off nativo (input + role="switch"), mismo patrón sin Radix
   que checkbox.tsx: las utilidades ganan a los estilos globales de input del
   CSS heredado (min-height 42px, padding), por eso los min-* explícitos. */
function Switch({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      role="switch"
      className={cn(
        "relative h-6 w-11 min-h-6 min-w-11 shrink-0 cursor-pointer appearance-none rounded-full border border-input bg-secondary p-0 outline-none transition-colors",
        "checked:border-primary checked:bg-primary",
        "focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-45",
        "after:absolute after:top-[2px] after:left-[2px] after:size-[18px] after:rounded-full after:bg-card after:shadow-[0_1px_2px_rgb(16_18_22/0.25)] after:transition-transform",
        "checked:after:translate-x-5",
        className,
      )}
      {...props}
    />
  );
}

export { Switch };
