import type * as React from "react";
import { cn } from "@/lib/utils.ts";

function DialogOverlay({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("fixed inset-0 z-40 flex items-center justify-center bg-foreground/40 p-3", className)}
      {...props}
    />
  );
}

function DialogContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex max-h-[calc(100svh-1.5rem)] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-card p-5 text-card-foreground shadow-[0_16px_48px_rgb(16_18_22_/_0.14)]",
        className,
      )}
      {...props}
    />
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1", className)} {...props} />;
}

function DialogTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("m-0 text-lg font-semibold tracking-[-0.015em]", className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("m-0 text-sm leading-relaxed text-muted-foreground", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap justify-end gap-2", className)} {...props} />;
}

export { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogTitle };
