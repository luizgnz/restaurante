import type * as React from "react";
import { cn } from "@/lib/utils.ts";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full resize-y rounded-lg border border-input bg-card px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none transition-colors",
        "min-h-[5.5rem] placeholder:text-muted-foreground/70",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20",
        "disabled:pointer-events-none disabled:opacity-45",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
