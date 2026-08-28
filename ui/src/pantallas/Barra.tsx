import { useEffect, useRef, useState } from "react";
import { LayoutGrid, ListOrdered, Menu, UserRound } from "lucide-react";
import { Button } from "../components/ui/button.tsx";
import { cn } from "../lib/utils.ts";

export type Destino = "plano" | "pedido" | "pedidos" | "producto-nuevo" | "editar-mapa" | "backend" | "opciones";

type Props = {
  vista: Destino;
  marca: string;
  logo?: string | null;
  nombre: string;
  onMesas: () => void;
  onOrdenes: () => void;
  onCerrarSesion: () => void;
  onIr: (vista: Destino) => void;
};

export function Barra({ vista, marca, logo, nombre, onMesas, onOrdenes, onCerrarSesion, onIr }: Props) {
  const [cuentaAbierta, setCuentaAbierta] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const iconos = useRef<HTMLDivElement>(null);

  function ir(d: Destino) {
    setMenuAbierto(false);
    onIr(d);
  }

  useEffect(() => {
    if (!cuentaAbierta && !menuAbierto) return;
    function cerrar(e: PointerEvent) {
      if (iconos.current && !iconos.current.contains(e.target as Node)) {
        setCuentaAbierta(false);
        setMenuAbierto(false);
      }
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setCuentaAbierta(false);
        setMenuAbierto(false);
      }
    }
    document.addEventListener("pointerdown", cerrar);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", cerrar);
      document.removeEventListener("keydown", tecla);
    };
  }, [cuentaAbierta, menuAbierto]);

  return (
    <nav className="flex items-center gap-1.5 border-b border-border bg-card/90 px-2 py-2 shadow-xs backdrop-blur-md sm:gap-2 sm:px-4">
      <Button
        type="button"
        variant={vista === "plano" ? "default" : "ghost"}
        size="sm"
        title="Mesas (M)"
        onClick={onMesas}
      >
        <LayoutGrid size={16} aria-hidden="true" />
        <span className="hidden min-[380px]:inline">Mesas</span>
      </Button>
      <Button
        type="button"
        variant={vista === "pedidos" ? "default" : "ghost"}
        size="sm"
        title="Órdenes (O)"
        onClick={onOrdenes}
      >
        <ListOrdered size={16} aria-hidden="true" />
        <span className="hidden min-[380px]:inline">Órdenes</span>
      </Button>
      <span className="pos-odoo__marca mx-auto flex min-h-9 items-center justify-center gap-2 text-sm font-semibold tracking-tight sm:text-base">
        {logo ? <img src={logo} alt="" className="pos-odoo__logo size-8 rounded-xl object-contain" /> : null}
        {marca}
      </span>
      <div className="pos-odoo__iconos flex items-center gap-1" ref={iconos}>
        <div className="pos-odoo__desplegable relative">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Cuenta"
            aria-expanded={cuentaAbierta}
            title={`Cuenta (${nombre})`}
            onClick={() => {
              setCuentaAbierta((v) => !v);
              setMenuAbierto(false);
            }}
          >
            <UserRound size={18} aria-hidden="true" />
          </Button>
          {cuentaAbierta ? (
            <div className="pos-odoo__panel absolute top-[calc(100%+8px)] right-0 z-20 flex min-w-52 flex-col gap-2 rounded-2xl border border-border bg-popover p-2 shadow-lg" role="menu">
              <p className="pos-odoo__panel-nombre px-2 py-1 text-sm text-muted-foreground">{nombre}</p>
              <Button type="button" variant="secondary" className="w-full" role="menuitem" onClick={onCerrarSesion}>
                Cerrar sesión
              </Button>
            </div>
          ) : null}
        </div>
        <div className="pos-odoo__desplegable relative">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Menú"
            aria-expanded={menuAbierto}
            title="Menú"
            onClick={() => {
              setMenuAbierto((v) => !v);
              setCuentaAbierta(false);
            }}
          >
            <Menu size={18} aria-hidden="true" />
          </Button>
          {menuAbierto ? (
            <div className="pos-odoo__panel absolute top-[calc(100%+8px)] right-0 z-20 flex min-w-52 flex-col gap-1 rounded-2xl border border-border bg-popover p-2 shadow-lg" role="menu">
              {(
                [
                  ["plano", "Mesas"],
                  ["pedidos", "Órdenes"],
                  ["producto-nuevo", "Crear producto"],
                  ["editar-mapa", "Editar mapa"],
                  ["backend", "Backend"],
                  ["opciones", "Opciones"],
                ] as const
              ).map(([destino, etiqueta]) => (
                <Button
                  key={destino}
                  type="button"
                  variant="ghost"
                  className={cn("w-full justify-start", vista === destino && "bg-muted")}
                  role="menuitem"
                  onClick={() => ir(destino)}
                >
                  {etiqueta}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
