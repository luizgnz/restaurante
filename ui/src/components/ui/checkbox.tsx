import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils.ts";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      className={cn(
        "size-5 shrink-0 rounded border border-input accent-primary shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Checkbox };
