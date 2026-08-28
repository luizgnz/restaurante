import type * as React from "react";
import { cn } from "@/lib/utils.ts";

function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      className={cn(
        "size-[18px] min-h-[18px] min-w-[18px] shrink-0 cursor-pointer appearance-none rounded-[5px] border border-input bg-card outline-none transition-colors",
        "checked:border-primary checked:bg-primary",
        "focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-45",
        "after:hidden checked:after:block checked:after:h-2 checked:after:w-[5px] checked:after:translate-x-[5.5px] checked:after:translate-y-[2px] checked:after:rotate-45 checked:after:border-r-2 checked:after:border-b-2 checked:after:border-primary-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Checkbox };
