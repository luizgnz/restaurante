import { useEffect, useRef, useState } from "react";
import {
  Boxes,
  ClipboardList,
  LayoutGrid,
  LogOut,
  Menu,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

export type Destino =
  | "plano"
  | "pedido"
  | "pedidos"
  | "inventario"
  | "editar-mapa"
  | "categorias"
  | "contornos"
  | "recetas"
  | "backend"
  | "opciones";

type Props = {
  vista: Destino;
  marca: string;
  logo?: string | null;
  nombre: string;
  puedeMesas?: boolean;
  puedeOrdenes?: boolean;
  puedeCocina?: boolean;
  puedeAdministrar?: boolean;
  onMesas: () => void;
  onOrdenes: () => void;
  onInventario: () => void;
  notificacionesCocina?: number;
  onCerrarSesion: () => void;
  onCrearProducto?: () => void;
  onIr: (vista: Destino) => void;
};

export function Barra({
  vista,
  marca,
  logo,
  nombre,
  puedeMesas = true,
  puedeOrdenes = true,
  puedeCocina = true,
  puedeAdministrar = true,
  onMesas,
  onOrdenes,
  onInventario,
  notificacionesCocina = 0,
  onCerrarSesion,
  onIr,
}: Props) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const iconos = useRef<HTMLDivElement>(null);

  function ir(d: Destino) {
    setMenuAbierto(false);
    onIr(d);
  }

  useEffect(() => {
    if (!menuAbierto) return;
    function cerrar(e: PointerEvent) {
      if (iconos.current && !iconos.current.contains(e.target as Node)) {
        setMenuAbierto(false);
      }
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuAbierto(false);
      }
    }
    document.addEventListener("pointerdown", cerrar);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", cerrar);
      document.removeEventListener("keydown", tecla);
    };
  }, [menuAbierto]);

  return (
    <nav className="pos-nav" aria-label="Navegación principal">
      <div className="pos-nav__primary">
        {puedeMesas ? (
          <Button type="button" variant={vista === "plano" ? "secondary" : "ghost"} className={`tactil pos-nav__item ${vista === "plano" ? "is-on" : ""}`} title="Mesas (M)" onClick={onMesas}>
            <LayoutGrid size={20} aria-hidden="true" />
            <span className="pos-nav__label">Mesas</span>
          </Button>
        ) : null}
        {puedeOrdenes || puedeCocina ? (
          <Button
            type="button"
            variant={vista === "pedidos" ? "secondary" : "ghost"}
            className={`tactil pos-nav__item ${vista === "pedidos" ? "is-on" : ""}`}
            title={notificacionesCocina ? `${notificacionesCocina} cambios pendientes de cocina` : "Órdenes (O)"}
            onClick={onOrdenes}
          >
            <ClipboardList size={20} aria-hidden="true" />
            <span className="pos-nav__label">Órdenes</span>
            {notificacionesCocina ? <span className="pos-nav__badge" aria-hidden="true">{notificacionesCocina}</span> : null}
          </Button>
        ) : null}
        <Button
          type="button"
          variant={vista === "inventario" ? "secondary" : "ghost"}
          className={`tactil pos-nav__item ${vista === "inventario" ? "is-on" : ""}`}
          title="Inventario"
          onClick={onInventario}
        >
          <Boxes size={20} aria-hidden="true" />
          <span className="pos-nav__label">Inventario</span>
        </Button>
      </div>
      <div className="pos-nav__identity">
        <span className="pos-odoo__marca">
          {logo ? <img src={logo} alt="" className="pos-odoo__logo" /> : null}
          <span className="hidden max-w-[28vw] truncate min-[420px]:inline-block">{marca}</span>
        </span>
      </div>
      <div className="pos-nav__right">
        <div className="pos-odoo__iconos" ref={iconos}>
          <div className="pos-odoo__desplegable">
            <Button
              type="button"
              variant="outline"
              className="tactil icono"
              aria-label="Menú y cuenta"
              aria-expanded={menuAbierto}
              title={`Menú (${nombre})`}
              onClick={() => setMenuAbierto((v) => !v)}
            >
              <Menu size={22} aria-hidden="true" />
            </Button>
            {menuAbierto ? (
              <div className="pos-odoo__panel" role="menu">
                <div className="pos-odoo__sesion">
                  <span className="pos-odoo__sesion-avatar" aria-hidden="true">{nombre.trim().charAt(0).toLocaleUpperCase("es")}</span>
                  <span className="pos-odoo__sesion-datos">
                    <small>Sesión actual</small>
                    <strong>{nombre}</strong>
                  </span>
                </div>
                {puedeMesas ? (
                  <Button type="button" variant="ghost" className="pos-odoo__panel-duplicado-movil" role="menuitem" onClick={() => ir("plano")}>
                    <LayoutGrid size={18} aria-hidden="true" />
                    <span>Mesas</span>
                  </Button>
                ) : null}
                {puedeOrdenes || puedeCocina ? (
                  <Button type="button" variant="ghost" className="pos-odoo__panel-duplicado-movil" role="menuitem" onClick={() => ir("pedidos")}>
                    <ClipboardList size={18} aria-hidden="true" />
                    <span>Órdenes</span>
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" className="pos-odoo__panel-duplicado-movil" role="menuitem" onClick={() => ir("inventario")}>
                  <Boxes size={18} aria-hidden="true" />
                  <span>Inventario</span>
                </Button>
                {puedeAdministrar ? (
                  <>
                    <Button type="button" variant="ghost" role="menuitem" onClick={() => ir("backend")}>
                      <SlidersHorizontal size={18} aria-hidden="true" />
                      <span>Administración</span>
                    </Button>
                    <Button type="button" variant="ghost" role="menuitem" onClick={() => ir("opciones")}>
                      <Settings size={18} aria-hidden="true" />
                      <span>Opciones</span>
                    </Button>
                  </>
                ) : null}
                <div className="pos-odoo__panel-sep" role="separator" aria-hidden="true" />
                <Button type="button" variant="ghost" role="menuitem" onClick={onCerrarSesion}>
                  <LogOut size={18} aria-hidden="true" />
                  <span>Cerrar sesión</span>
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </nav>
  );
}
