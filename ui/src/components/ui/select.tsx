import type { ComponentProps } from "react";
import { cn } from "../../lib/utils.ts";

function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "flex h-12 w-full min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-base text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
