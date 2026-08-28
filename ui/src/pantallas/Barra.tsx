import { useEffect, useRef, useState } from "react";
import { LayoutGrid, ListOrdered, Menu, UserRound } from "lucide-react";
import { Button } from "../components/ui/button.tsx";

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
    <nav>
      <Button
        type="button"
        variant={vista === "plano" ? "default" : "secondary"}
        className={`tactil ${vista === "plano" ? "is-on" : ""}`}
        title="Mesas (M)"
        onClick={onMesas}
      >
        <LayoutGrid size={18} aria-hidden="true" />
        Mesas
      </Button>
      <Button
        type="button"
        variant={vista === "pedidos" ? "default" : "secondary"}
        className={`tactil ${vista === "pedidos" ? "is-on" : ""}`}
        title="Órdenes (O)"
        onClick={onOrdenes}
      >
        <ListOrdered size={18} aria-hidden="true" />
        Órdenes
      </Button>
      <span className="pos-odoo__marca">
        {logo ? <img src={logo} alt="" className="pos-odoo__logo" /> : null}
        {marca}
      </span>
      <div className="pos-odoo__iconos" ref={iconos}>
        <div className="pos-odoo__desplegable">
          <Button
            type="button"
            size="icon"
            className="tactil icono"
            aria-label="Cuenta"
            aria-expanded={cuentaAbierta}
            title={`Cuenta (${nombre})`}
            onClick={() => {
              setCuentaAbierta((v) => !v);
              setMenuAbierto(false);
            }}
          >
            <UserRound size={22} aria-hidden="true" />
          </Button>
          {cuentaAbierta ? (
            <div className="pos-odoo__panel" role="menu">
              <p className="pos-odoo__panel-nombre">{nombre}</p>
              <Button type="button" variant="secondary" className="tactil w-full" role="menuitem" onClick={onCerrarSesion}>
                Cerrar sesión
              </Button>
            </div>
          ) : null}
        </div>
        <div className="pos-odoo__desplegable">
          <Button
            type="button"
            size="icon"
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
              <Button type="button" variant="ghost" className="tactil w-full justify-start" role="menuitem" onClick={() => ir("plano")}>
                Mesas
              </Button>
              <Button type="button" variant="ghost" className="tactil w-full justify-start" role="menuitem" onClick={() => ir("pedidos")}>
                Órdenes
              </Button>
              <Button type="button" variant="ghost" className="tactil w-full justify-start" role="menuitem" onClick={() => ir("producto-nuevo")}>
                Crear producto
              </Button>
              <Button type="button" variant="ghost" className="tactil w-full justify-start" role="menuitem" onClick={() => ir("editar-mapa")}>
                Editar mapa
              </Button>
              <Button type="button" variant="ghost" className="tactil w-full justify-start" role="menuitem" onClick={() => ir("backend")}>
                Backend
              </Button>
              <Button type="button" variant="ghost" className="tactil w-full justify-start" role="menuitem" onClick={() => ir("opciones")}>
                Opciones
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
