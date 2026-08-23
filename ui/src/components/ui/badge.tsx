import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils.ts";

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold", {
  variants: {
    variant: {
      default: "bg-primary/12 text-primary",
      success: "bg-emerald-100 text-emerald-800",
      warning: "bg-amber-100 text-amber-900",
      danger: "bg-red-100 text-red-800",
      secondary: "bg-secondary text-secondary-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
