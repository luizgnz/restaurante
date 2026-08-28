import { LayoutGrid, MapPinned, Plus } from "lucide-react";
import { Button } from "../components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.tsx";

type Props = {
  onCrearProducto: () => void;
  onEditarMapa: () => void;
  onMesas: () => void;
};

export function Backend({ onCrearProducto, onEditarMapa, onMesas }: Props) {
  return (
    <section className="backend-odoo">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Backend</CardTitle>
          <CardDescription className="login-odoo__ayuda">
            Back-office del local. Módulo restaurante: carta y pisos.
          </CardDescription>
        </CardHeader>
        <CardContent className="backend-odoo__atajos">
          <Button type="button" className="tactil primario" onClick={onCrearProducto}>
            <Plus size={18} aria-hidden="true" />
            Crear producto
          </Button>
          <Button type="button" className="tactil primario" onClick={onEditarMapa}>
            <MapPinned size={18} aria-hidden="true" />
            Editar mapa
          </Button>
          <Button type="button" variant="secondary" className="tactil" onClick={onMesas}>
            <LayoutGrid size={18} aria-hidden="true" />
            Punto de venta
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
