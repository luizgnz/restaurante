import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps, HTMLAttributes } from "react";
import { cn } from "../../lib/utils.ts";

function Dialog({
  open = true,
  onOpenChange,
  onOverlayClick,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Root> & {
  onOverlayClick?: () => void;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange?.(next);
        if (!next) onOverlayClick?.();
      }}
      {...props}
    >
      <DialogPrimitive.Overlay className="modal-fondo fixed inset-0 z-40 bg-foreground/40 backdrop-blur-[2px]" />
      {children}
    </DialogPrimitive.Root>
  );
}

function DialogContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Content
      className={cn(
        "modal-caja fixed top-1/2 left-1/2 z-50 flex w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-xl outline-none",
        className,
      )}
      {...props}
      aria-modal="true"
    >
      {children}
    </DialogPrimitive.Content>
  );
}

function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col items-center gap-2 text-center", className)} {...props} />;
}

function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("m-0 text-xl font-semibold tracking-tight", className)} {...props} />;
}

function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex w-full flex-wrap items-center justify-end gap-2", className)} {...props} />;
}

function DialogClose({ className, ...props }: ComponentProps<typeof DialogPrimitive.Close>) {
  return (
    <DialogPrimitive.Close
      className={cn(
        "absolute top-4 right-4 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
      {...props}
    >
      <X className="size-4" />
    </DialogPrimitive.Close>
  );
}

export { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle };
