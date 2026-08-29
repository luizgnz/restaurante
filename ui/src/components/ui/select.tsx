import type * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils.ts";

function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <span className="relative block w-full">
      <select
        className={cn(
          "h-[var(--control-h)] min-h-[var(--control-h)] w-full appearance-none rounded-lg border border-input bg-card px-3 pr-9 text-sm text-foreground outline-none transition-colors",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20",
          "disabled:pointer-events-none disabled:opacity-45",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </span>
  );
}

export { Select };
