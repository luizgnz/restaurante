import { useEffect, useRef, useState } from "react";

export type Destino = "plano" | "pedido" | "pedidos" | "editar-mapa" | "backend" | "opciones";

type Props = {
  vista: Destino;
  marca: string;
  logo?: string | null;
  nombre: string;
  onMesas: () => void;
  onOrdenes: () => void;
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

export function Barra({ vista, marca, logo, nombre, onMesas, onOrdenes, onCerrarSesion, onCrearProducto, onIr }: Props) {
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
    <nav>
      <button type="button" className={`tactil ${vista === "plano" ? "is-on" : ""}`} title="Mesas (M)" onClick={onMesas}>
        Mesas
      </button>
      <button
        type="button"
        className={`tactil ${vista === "pedidos" ? "is-on" : ""}`}
        title="Órdenes (O)"
        onClick={onOrdenes}
      >
        Órdenes
      </button>
      <span className="pos-odoo__marca">
        {logo ? <img src={logo} alt="" className="pos-odoo__logo" /> : null}
        {marca}
      </span>
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
              <button type="button" className="tactil" role="menuitem" onClick={() => ir("plano")}>
                Mesas
              </button>
              <button type="button" className="tactil" role="menuitem" onClick={() => ir("pedidos")}>
                Órdenes
              </button>
              <button type="button" className="tactil" role="menuitem" onClick={crearProducto}>
                Crear producto
              </button>
              <button type="button" className="tactil" role="menuitem" onClick={() => ir("editar-mapa")}>
                Editar mapa
              </button>
              <button type="button" className="tactil" role="menuitem" onClick={() => ir("backend")}>
                Backend
              </button>
              <button type="button" className="tactil" role="menuitem" onClick={() => ir("opciones")}>
                Opciones
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
