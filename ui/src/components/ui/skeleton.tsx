import { cn } from "@/lib/utils.ts";

/**
 * Bloque gris animado que representa contenido mientras carga. Regla del
 * proyecto: cargar nunca debe verse igual a vacío — si una pantalla no tiene
 * datos todavía, muestra Skeletons, no el estado "sin datos".
 */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}
