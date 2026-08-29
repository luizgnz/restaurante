import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { createContext, useContext } from "react";
import type { ComponentProps, HTMLAttributes } from "react";
import { cn } from "@/lib/utils.ts";

/**
 * Envoltorio sobre el Dialog real de Radix (foco atrapado, Escape, aria-modal
 * de fabrica) en vez de divs a mano. `open` por defecto en `true` porque en
 * esta app el padre monta/desmonta el dialogo condicionalmente -- no hay
 * DialogTrigger. `onOverlayClick` mantiene el mismo callback que ya usaban
 * las pantallas para "cerrar al tocar afuera" o Escape.
 *
 * `aria-label` se recibe en `Dialog` (como ya usaban las pantallas) pero el
 * unico nodo DOM real es `DialogPrimitive.Content`, asi que se reenvia via
 * contexto hasta `DialogContent`. `aria-modal="true"` se fija explicito en
 * `DialogContent` porque Radix no lo agrega solo -- Cursor lo hacia igual.
 */
const DialogLabelContext = createContext<string | undefined>(undefined);

function Dialog({
  open = true,
  onOpenChange,
  onOverlayClick,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Root> & {
  onOverlayClick?: () => void;
  "aria-label"?: string;
}) {
  const { "aria-label": ariaLabel, ...rootProps } = props;
  return (
    <DialogLabelContext.Provider value={ariaLabel}>
      <DialogPrimitive.Root
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          if (!next) onOverlayClick?.();
        }}
        {...rootProps}
      >
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/40 p-3" />
        {children}
      </DialogPrimitive.Root>
    </DialogLabelContext.Provider>
  );
}

function DialogContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  const ariaLabel = useContext(DialogLabelContext);
  return (
    <DialogPrimitive.Content
      aria-modal="true"
      aria-label={ariaLabel}
      className={cn(
        "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100svh-1.5rem)] w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-card p-5 text-card-foreground shadow-[0_16px_48px_rgb(16_18_22_/_0.14)] outline-none",
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  );
}

function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1", className)} {...props} />;
}

function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("m-0 text-lg font-semibold tracking-[-0.015em]", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("m-0 text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-wrap justify-end gap-2", className)} {...props} />;
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

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle };
