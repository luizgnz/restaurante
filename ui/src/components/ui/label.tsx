import type * as React from "react";
import { cn } from "@/lib/utils.ts";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn("flex select-none flex-col gap-1.5 text-sm font-medium text-foreground", className)}
      {...props}
    />
  );
}

export { Label };
