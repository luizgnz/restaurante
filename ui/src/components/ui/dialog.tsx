import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils.ts";

type DialogProps = HTMLAttributes<HTMLDivElement> & {
  onOverlayClick?: () => void;
};

function Dialog({ className, onClick, onOverlayClick, ...props }: DialogProps) {
  return (
    <div
      className={cn("modal-fondo", className)}
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        onClick?.(event);
        if (event.target === event.currentTarget) onOverlayClick?.();
      }}
      {...props}
    />
  );
}

function DialogContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("modal-caja", className)} {...props} />;
}

function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col items-center gap-2 text-center", className)} {...props} />;
}

function DialogTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("m-0 text-xl font-semibold", className)} {...props} />;
}

function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex w-full flex-wrap items-center justify-end gap-2", className)} {...props} />;
}

export { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle };
