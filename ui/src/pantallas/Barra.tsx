import { useEffect, useRef, useState } from "react";
import {
  Boxes,
  ChefHat,
  CircleUserRound,
  ClipboardList,
  LayoutGrid,
  LogOut,
  Menu,
  Settings,
  SlidersHorizontal,
  Utensils,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

export type Destino =
  | "plano"
  | "pedido"
  | "pedidos"
  | "inventario"
  | "kds"
  | "editar-mapa"
  | "categorias"
  | "contornos"
  | "recetas"
  | "backend"
  | "opciones";

type Props = {
  uiVersion?: "actual" | "nueva";
  vista: Destino;
  area: "mesero" | "cocina";
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
  onCocina: () => void;
  onCambiarArea: (area: "mesero" | "cocina") => void;
  notificacionesCocina?: number;
  onCerrarSesion: () => void;
  onCrearProducto?: () => void;
  onIr: (vista: Destino) => void;
};

export function Barra({
  uiVersion = "actual",
  vista,
  area,
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
  onCocina,
  onCambiarArea,
  notificacionesCocina = 0,
  onCerrarSesion,
  onIr,
}: Props) {
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
    <nav className="pos-nav" aria-label="Navegación principal">
      <div className="pos-nav__primary">
        {area === "mesero" ? (
          <>
            {puedeMesas ? <Button type="button" variant={vista === "plano" ? "secondary" : "ghost"} className={`tactil pos-nav__item ${vista === "plano" ? "is-on" : ""}`} title="Mesas (M)" onClick={onMesas}>
              <LayoutGrid size={20} aria-hidden="true" />
              <span className="pos-nav__label">Mesas</span>
            </Button> : null}
            {puedeOrdenes ? <Button
              type="button"
              variant={vista === "pedidos" ? "secondary" : "ghost"}
              className={`tactil pos-nav__item ${vista === "pedidos" ? "is-on" : ""}`}
              title={notificacionesCocina ? `${notificacionesCocina} cambios pendientes de cocina` : "Órdenes (O)"}
              onClick={onOrdenes}
            >
              <ClipboardList size={20} aria-hidden="true" />
              <span className="pos-nav__label">Órdenes</span>
              {notificacionesCocina ? <span className="pos-nav__badge" aria-hidden="true">{notificacionesCocina}</span> : null}
            </Button> : null}
          </>
        ) : puedeCocina ? (
          <Button type="button" variant={vista === "kds" ? "secondary" : "ghost"} className={`tactil pos-nav__item ${vista === "kds" ? "is-on" : ""}`} title="Pedidos de cocina" onClick={onCocina}>
            <ChefHat size={20} aria-hidden="true" />
            <span className="pos-nav__label">Cocina</span>
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
          {marca}
        </span>
      </div>
      <div className="pos-nav__right">
        {(puedeMesas || puedeOrdenes) && puedeCocina ? <div className="pos-nav__areas" role="group" aria-label="Cambiar vista de trabajo">
          <Button type="button" size="sm" variant={area === "mesero" ? "secondary" : "ghost"} aria-label="Vista Mesero" title="Vista Mesero" className={area === "mesero" ? "is-on" : ""} onClick={() => onCambiarArea("mesero")}><Utensils size={16} aria-hidden="true" /><span>{uiVersion === "nueva" ? "Vista Mesero" : "Mesero"}</span></Button>
          <Button type="button" size="sm" variant={area === "cocina" ? "secondary" : "ghost"} aria-label="Vista Cocina" title="Vista Cocina" className={area === "cocina" ? "is-on" : ""} onClick={() => onCambiarArea("cocina")}><ChefHat size={16} aria-hidden="true" /><span>{uiVersion === "nueva" ? "Vista Cocina" : "Cocina"}</span></Button>
        </div> : null}
        <div className="pos-odoo__iconos" ref={iconos}>
        <div className="pos-odoo__desplegable">
          <Button
            type="button"
            variant="outline"
            className="tactil icono"
            aria-label="Cuenta"
            aria-expanded={cuentaAbierta}
            title={`Cuenta (${nombre})`}
            onClick={() => {
              setCuentaAbierta((v) => !v);
              setMenuAbierto(false);
            }}
          >
            <CircleUserRound size={22} aria-hidden="true" />
          </Button>
          {cuentaAbierta ? (
            <div className="pos-odoo__panel" role="menu">
              <p className="pos-odoo__panel-nombre">{nombre}</p>
              <Button type="button" variant="ghost" role="menuitem" onClick={onCerrarSesion}>
                <LogOut size={18} aria-hidden="true" />
                <span>Cerrar sesión</span>
              </Button>
            </div>
          ) : null}
        </div>
        <div className="pos-odoo__desplegable">
          <Button
            type="button"
            variant="outline"
            className="tactil icono"
            aria-label="Menú"
            aria-expanded={menuAbierto}
            title="Menú"
            onClick={() => {
              setMenuAbierto((v) => !v);
              setCuentaAbierta(false);
            }}
          >
            <Menu size={22} aria-hidden="true" />
          </Button>
          {menuAbierto ? (
            <div className="pos-odoo__panel" role="menu">
              {area === "mesero" ? (
                <>
                  {puedeMesas ? <Button type="button" variant="ghost" role="menuitem" onClick={() => ir("plano")}><LayoutGrid size={18} aria-hidden="true" /><span>Mesas</span></Button> : null}
                  {puedeOrdenes ? <Button type="button" variant="ghost" role="menuitem" onClick={() => ir("pedidos")}><ClipboardList size={18} aria-hidden="true" /><span>Órdenes</span></Button> : null}
                </>
              ) : puedeCocina ? <Button type="button" variant="ghost" role="menuitem" onClick={() => ir("kds")}><ChefHat size={18} aria-hidden="true" /><span>Cocina</span></Button> : null}
              <Button type="button" variant="ghost" role="menuitem" onClick={() => ir("inventario")}>
                <Boxes size={18} aria-hidden="true" />
                <span>Inventario</span>
              </Button>
              {puedeAdministrar ? (
                <>
                  <Button type="button" variant="ghost" role="menuitem" onClick={() => ir("backend")}><SlidersHorizontal size={18} aria-hidden="true" /><span>Administración</span></Button>
                  <Button type="button" variant="ghost" role="menuitem" onClick={() => ir("opciones")}><Settings size={18} aria-hidden="true" /><span>Opciones</span></Button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      </div>
    </nav>
  );
}
