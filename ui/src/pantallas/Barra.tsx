import { useEffect, useRef, useState } from "react";
import { Boxes, ChefHat, ClipboardList, LayoutGrid, Utensils } from "lucide-react";

export type Destino =
  | "plano"
  | "pedido"
  | "pedidos"
  | "inventario"
  | "kds"
  | "editar-mapa"
  | "categorias"
  | "contornos"
  | "backend"
  | "opciones";

type Props = {
  vista: Destino;
  area: "mesero" | "cocina";
  marca: string;
  logo?: string | null;
  nombre: string;
  onMesas: () => void;
  onOrdenes: () => void;
  onInventario: () => void;
  onCocina: () => void;
  onCambiarArea: (area: "mesero" | "cocina") => void;
  notificacionesCocina?: number;
  onCerrarSesion: () => void;
  onCrearProducto: () => void;
  onIr: (vista: Destino) => void;
};

function IconoPersona() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" fill="currentColor" />
      <path d="M5 19c.8-3.5 3.4-5.2 7-5.2s6.2 1.7 7 5.2" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconoMenu() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Barra({
  vista,
  area,
  marca,
  logo,
  nombre,
  onMesas,
  onOrdenes,
  onInventario,
  onCocina,
  onCambiarArea,
  notificacionesCocina = 0,
  onCerrarSesion,
  onCrearProducto,
  onIr,
}: Props) {
  const [cuentaAbierta, setCuentaAbierta] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const iconos = useRef<HTMLDivElement>(null);

  function ir(d: Destino) {
    setMenuAbierto(false);
    onIr(d);
  }

  function crearProducto() {
    setMenuAbierto(false);
    onCrearProducto();
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
      {area === "mesero" ? (
        <>
          <button type="button" className={`tactil pos-nav__item ${vista === "plano" ? "is-on" : ""}`} title="Mesas (M)" onClick={onMesas}>
            <LayoutGrid size={20} aria-hidden="true" />
            <span className="pos-nav__label">Mesas</span>
          </button>
          <button
            type="button"
            className={`tactil pos-nav__item ${vista === "pedidos" ? "is-on" : ""}`}
            title={notificacionesCocina ? `${notificacionesCocina} cambios pendientes de cocina` : "Órdenes (O)"}
            onClick={onOrdenes}
          >
            <ClipboardList size={20} aria-hidden="true" />
            <span className="pos-nav__label">Órdenes</span>
            {notificacionesCocina ? <span className="pos-nav__badge" aria-hidden="true">{notificacionesCocina}</span> : null}
          </button>
        </>
      ) : (
        <button type="button" className={`tactil pos-nav__item ${vista === "kds" ? "is-on" : ""}`} title="Pedidos de cocina" onClick={onCocina}>
          <ChefHat size={20} aria-hidden="true" />
          <span className="pos-nav__label">Cocina</span>
        </button>
      )}
      <button
        type="button"
        className={`tactil pos-nav__item ${vista === "inventario" ? "is-on" : ""}`}
        title="Inventario"
        onClick={onInventario}
      >
        <Boxes size={20} aria-hidden="true" />
        <span className="pos-nav__label">Inventario</span>
      </button>
      <span className="pos-odoo__marca">
        {logo ? <img src={logo} alt="" className="pos-odoo__logo" /> : null}
        {marca}
      </span>
      <div className="pos-nav__areas" role="group" aria-label="Cambiar vista de trabajo">
        <button type="button" aria-label="Vista Mesero" title="Vista Mesero" className={area === "mesero" ? "is-on" : ""} onClick={() => onCambiarArea("mesero")}><Utensils size={16} aria-hidden="true" /><span>Mesero</span></button>
        <button type="button" aria-label="Vista Cocina" title="Vista Cocina" className={area === "cocina" ? "is-on" : ""} onClick={() => onCambiarArea("cocina")}><ChefHat size={16} aria-hidden="true" /><span>Cocina</span></button>
      </div>
      <div className="pos-odoo__iconos" ref={iconos}>
        <div className="pos-odoo__desplegable">
          <button
            type="button"
            className="tactil icono"
            aria-label="Cuenta"
            aria-expanded={cuentaAbierta}
            title={`Cuenta (${nombre})`}
            onClick={() => {
              setCuentaAbierta((v) => !v);
              setMenuAbierto(false);
            }}
          >
            <IconoPersona />
          </button>
          {cuentaAbierta ? (
            <div className="pos-odoo__panel" role="menu">
              <p className="pos-odoo__panel-nombre">{nombre}</p>
              <button type="button" className="tactil" role="menuitem" onClick={onCerrarSesion}>
                Cerrar sesión
              </button>
            </div>
          ) : null}
        </div>
        <div className="pos-odoo__desplegable">
          <button
            type="button"
            className="tactil icono"
            aria-label="Menú"
            aria-expanded={menuAbierto}
            title="Menú"
            onClick={() => {
              setMenuAbierto((v) => !v);
              setCuentaAbierta(false);
            }}
          >
            <IconoMenu />
          </button>
          {menuAbierto ? (
            <div className="pos-odoo__panel" role="menu">
              {area === "mesero" ? (
                <>
                  <button type="button" className="tactil" role="menuitem" onClick={() => ir("plano")}>Mesas</button>
                  <button type="button" className="tactil" role="menuitem" onClick={() => ir("pedidos")}>Órdenes</button>
                </>
              ) : <button type="button" className="tactil" role="menuitem" onClick={() => ir("kds")}>Cocina</button>}
              <button type="button" className="tactil" role="menuitem" onClick={() => ir("inventario")}>
                Inventario
              </button>
              {area === "mesero" ? (
                <>
                  <button type="button" className="tactil" role="menuitem" onClick={crearProducto}>Crear producto</button>
                  <button type="button" className="tactil" role="menuitem" onClick={() => ir("editar-mapa")}>Editar mapa</button>
                  <button type="button" className="tactil" role="menuitem" onClick={() => ir("backend")}>Backend</button>
                  <button type="button" className="tactil" role="menuitem" onClick={() => ir("opciones")}>Opciones</button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
