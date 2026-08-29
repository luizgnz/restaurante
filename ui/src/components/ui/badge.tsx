import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils.ts";

/** El color de un badge siempre significa estado, nunca decora. */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground",
        secondary: "bg-secondary text-muted-foreground",
        outline: "border border-border text-muted-foreground",
        success: "bg-[var(--success-soft)] text-[var(--success)]",
        warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
        danger: "bg-[var(--destructive-soft)] text-[var(--destructive)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge, badgeVariants };
