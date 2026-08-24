import { Layers3, LayoutDashboard, LayoutGrid, Plus, Shapes } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";

type Props = {
  onCrearProducto: () => void;
  onCategorias: () => void;
  onContornos: () => void;
  onEditarMapa: () => void;
  onMesas: () => void;
};

export function Backend({ onCrearProducto, onCategorias, onContornos, onEditarMapa, onMesas }: Props) {
  return (
    <section className="page-shell backend-odoo">
      <header className="page-header">
        <div>
          <span className="page-eyebrow">Backend · Administración</span>
          <h1>Configuración del local</h1>
          <p>Gestiona la carta, su estructura y la distribución del salón.</p>
        </div>
        <Button type="button" variant="outline" onClick={onMesas}>
          <LayoutDashboard size={18} aria-hidden="true" /> Punto de venta
        </Button>
      </header>
      <div className="backend-odoo__atajos">
        <Card className="backend-atajo">
          <Plus size={24} aria-hidden="true" />
          <div><h2>Nuevo producto</h2><p>Añade platos, bebidas o materiales.</p></div>
          <Button type="button" onClick={onCrearProducto}>Crear producto</Button>
        </Card>
        <Card className="backend-atajo">
          <Shapes size={24} aria-hidden="true" />
          <div><h2>Categorías</h2><p>Ordena la carta para encontrar productos rápido.</p></div>
          <Button type="button" variant="outline" onClick={onCategorias}>Administrar</Button>
        </Card>
        <Card className="backend-atajo">
          <Layers3 size={24} aria-hidden="true" />
          <div><h2>Contornos</h2><p>Configura opciones, suplementos y extras.</p></div>
          <Button type="button" variant="outline" onClick={onContornos}>Configurar</Button>
        </Card>
        <Card className="backend-atajo">
          <LayoutGrid size={24} aria-hidden="true" />
          <div><h2>Mapa del salón</h2><p>Organiza pisos, mesas y capacidad.</p></div>
          <Button type="button" variant="outline" onClick={onEditarMapa}>Editar mapa</Button>
        </Card>
      </div>
    </section>
  );
}
