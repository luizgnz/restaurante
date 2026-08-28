import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils.ts";

/**
 * Dirección "Turno": el negro es el color de acción. Verde, ámbar y rojo
 * quedan libres para significar estado (libre, atrasada, anulada) y no
 * compiten con la marca. Peso 500, sin sombra: la jerarquía la da el
 * contraste, no el relieve.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-colors outline-none select-none disabled:pointer-events-none disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/88",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        outline: "border border-border bg-card text-foreground hover:bg-secondary",
        ghost: "bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        success: "bg-success text-success-foreground hover:bg-success/90",
      },
      size: {
        default: "h-[var(--control-h)]",
        sm: "h-[var(--control-h-sm)] rounded-md px-3 text-[0.8125rem]",
        lg: "h-[calc(var(--control-h)+8px)] px-6 text-base",
        icon: "h-[var(--control-h)] w-[var(--control-h)] p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
