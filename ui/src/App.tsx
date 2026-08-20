import { useEffect, useState } from "react";
import { api } from "./api.ts";
import { Complementos } from "./pantallas/Complementos.tsx";
import { Login } from "./pantallas/Login.tsx";
import { Pedido } from "./pantallas/Pedido.tsx";
import { Pedidos, type PedidoEnCurso } from "./pantallas/Pedidos.tsx";
import { PinPad } from "./pantallas/PinPad.tsx";
import { Plano, type Mesa } from "./pantallas/Plano.tsx";

type Vista = "plano" | "pedido" | "pedidos" | "complementos";
type Administrador = { id: number; nombre: string; derecho: string };
type Sesion = { abierta: boolean; administrador: Administrador | null };

export function App() {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [vista, setVista] = useState<Vista>("plano");
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [piso, setPiso] = useState("Salón");
  const [pisoId, setPisoId] = useState<number | null>(null);
  const [tieneFondo, setTieneFondo] = useState(false);
  const [fondoTick, setFondoTick] = useState(0);
  const [productos, setProductos] = useState<{ id: number; nombre: string; precio_centavos: number; armable: number }[]>([]);
  const [lineas, setLineas] = useState<
    { id: number; nombre: string; cantidad: number; estado: string; sePuedeEditar?: boolean }[]
  >([]);
  const [pedidos, setPedidos] = useState<PedidoEnCurso[]>([]);
  const [mensajes, setMensajes] = useState<string[]>([]);
  const [mesa, setMesa] = useState<Mesa | null>(null);
  const [pedidoId, setPedidoId] = useState<number | null>(null);
  const [pedidoMesaId, setPedidoMesaId] = useState<number | null>(null);
  const [asignando, setAsignando] = useState(false);
  const [pinEnviar, setPinEnviar] = useState(false);
  const [tabletCocina, setTabletCocina] = useState(false);
  const [error, setError] = useState("");

  async function cargarSesion() {
    setSesion(await api<Sesion>("/api/sesion"));
  }
  async function cargarPlano() {
    const data = await api<{
      mesas: Mesa[];
      pisos: { id: number; nombre: string; tiene_fondo: number }[];
    }>("/api/mesas");
    setMesas(data.mesas);
    if (data.pisos[0]) {
      setPiso(data.pisos[0].nombre);
      setPisoId(data.pisos[0].id);
      setTieneFondo(Boolean(data.pisos[0].tiene_fondo));
    }
  }
  async function cargarCarta() {
    const data = await api<{ productos: typeof productos }>("/api/carta");
    setProductos(data.productos);
  }
  async function cargarPedido(id: number) {
    const data = await api<{
      pedido: { mesa_id: number | null };
      lineas: typeof lineas;
    }>(`/api/pedidos/${id}`);
    setLineas(data.lineas);
    setPedidoMesaId(data.pedido.mesa_id);
  }
  async function cargarPedidos() {
    const data = await api<{ pedidos: PedidoEnCurso[] }>("/api/pedidos");
    setPedidos(data.pedidos);
  }
  async function cargarComplementos() {
    const data = await api<{ mensajes: string[] }>("/api/complementos");
    setMensajes(data.mensajes);
  }
  async function cargarConfig() {
    const data = await api<{ tablet_cocina: boolean }>("/api/config");
    setTabletCocina(data.tablet_cocina);
  }

  useEffect(() => {
    cargarSesion().catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!sesion?.abierta) return;
    cargarPlano().catch((e) => setError(String(e)));
    cargarCarta().catch((e) => setError(String(e)));
    cargarPedidos().catch((e) => setError(String(e)));
    cargarComplementos().catch((e) => setError(String(e)));
    cargarConfig().catch((e) => setError(String(e)));
  }, [sesion?.abierta]);

  async function conError(fn: () => Promise<void>) {
    try {
      setError("");
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function abrirPedido(id: number) {
    setPedidoId(id);
    setVista("pedido");
    await cargarPedido(id);
  }

  if (!sesion?.abierta) {
    return (
      <Login
        error={error}
        onEntrar={(creds) =>
          conError(async () => {
            setSesion(await api<Sesion>("/api/sesion/abrir", { method: "POST", body: JSON.stringify(creds) }));
          })
        }
      />
    );
  }

  return (
    <div className="pos-odoo">
      <nav>
        <button className={vista === "plano" ? "is-on" : undefined} onClick={() => setVista("plano")}>
          Mesas
        </button>
        <button
          className={vista === "pedidos" ? "is-on" : undefined}
          onClick={() => {
            setVista("pedidos");
            cargarPedidos().catch((e) => setError(String(e)));
          }}
        >
          Pedidos
        </button>
        <button className={vista === "complementos" ? "is-on" : undefined} onClick={() => setVista("complementos")}>
          Complementos
        </button>
        <span className="pos-odoo__quien">{sesion.administrador?.nombre}</span>
        <button
          onClick={() =>
            conError(async () => {
              await api("/api/sesion/cerrar", { method: "POST" });
              setSesion({ abierta: false, administrador: null });
              setVista("plano");
            })
          }
        >
          Cerrar
        </button>
      </nav>
      {error ? <p role="alert">{error}</p> : null}
      <main>
        {pinEnviar ? (
          <PinPad
            titulo="PIN para Enviar"
            onPin={(pin) =>
              conError(async () => {
                if (!pedidoId) return;
                setPinEnviar(false);
                await api(`/api/pedidos/${pedidoId}/enviar`, { method: "POST", body: JSON.stringify({ pin }) });
                await cargarPedido(pedidoId);
                await cargarPedidos();
                await cargarPlano();
              })
            }
            onCancelar={() => setPinEnviar(false)}
          />
        ) : null}
        {!pinEnviar && vista === "plano" ? (
          <Plano
            piso={piso}
            mesas={mesas}
            asignando={asignando}
            fondoUrl={tieneFondo && pisoId ? `/api/pisos/${pisoId}/fondo?t=${fondoTick}` : null}
            onNuevoPedido={() =>
              conError(async () => {
                const r = await api<{ pedidoId: number }>("/api/pedidos", { method: "POST", body: JSON.stringify({}) });
                setAsignando(false);
                await abrirPedido(r.pedidoId);
                await cargarPlano();
              })
            }
            onFondo={(dataUrl) =>
              conError(async () => {
                if (!pisoId) return;
                await api(`/api/pisos/${pisoId}/fondo`, { method: "POST", body: JSON.stringify({ dataUrl }) });
                setTieneFondo(true);
                setFondoTick((n) => n + 1);
              })
            }
            onMesa={(m) =>
              conError(async () => {
                if (asignando && pedidoId) {
                  await api(`/api/pedidos/${pedidoId}/asignar-mesa`, {
                    method: "POST",
                    body: JSON.stringify({ mesaId: m.id }),
                  });
                  setAsignando(false);
                  setMesa(m);
                  await abrirPedido(pedidoId);
                  await cargarPlano();
                  return;
                }
                setMesa(m);
                if (m.pedidoId) {
                  await abrirPedido(m.pedidoId);
                } else {
                  const r = await api<{ pedidoId: number }>(`/api/mesas/${m.id}/abrir`, {
                    method: "POST",
                    body: JSON.stringify({ cubiertos: m.asientos || 4 }),
                  });
                  await abrirPedido(r.pedidoId);
                  await cargarPlano();
                }
              })
            }
          />
        ) : null}
        {!pinEnviar && vista === "pedido" ? (
          <Pedido
            productos={productos}
            lineas={lineas}
            sinMesa={!pedidoMesaId}
            onAsignarMesa={() => {
              setAsignando(true);
              setVista("plano");
            }}
            onAgregar={(productoId) =>
              conError(async () => {
                if (!pedidoId) return;
                await api(`/api/pedidos/${pedidoId}/lineas`, {
                  method: "POST",
                  body: JSON.stringify({ productoId, cantidad: 1 }),
                });
                await cargarPedido(pedidoId);
              })
            }
            onQuitar={(lineaId) =>
              conError(async () => {
                await api(`/api/lineas/${lineaId}/quitar`, { method: "POST" });
                if (pedidoId) await cargarPedido(pedidoId);
                await cargarPedidos();
              })
            }
            onCantidad={(lineaId, cantidad) =>
              conError(async () => {
                await api(`/api/lineas/${lineaId}/cantidad`, {
                  method: "POST",
                  body: JSON.stringify({ cantidad }),
                });
                if (pedidoId) await cargarPedido(pedidoId);
                await cargarPedidos();
              })
            }
            onEnviar={() => setPinEnviar(true)}
            onPrecuenta={() =>
              conError(async () => {
                if (!pedidoId) return;
                await api(`/api/pedidos/${pedidoId}/precuenta`, { method: "POST", body: JSON.stringify({}) });
                await cargarPlano();
              })
            }
            onCaja={() =>
              conError(async () => {
                if (!pedidoId) return;
                await api(`/api/pedidos/${pedidoId}/enviar-caja`, { method: "POST", body: JSON.stringify({}) });
                setVista("plano");
                setPedidoId(null);
                await cargarPlano();
                await cargarPedidos();
              })
            }
          />
        ) : null}
        {!pinEnviar && vista === "pedidos" ? (
          <Pedidos
            tabletCocina={tabletCocina}
            pedidos={pedidos}
            onAbrir={(id) => conError(() => abrirPedido(id))}
            onQuitar={(lineaId) =>
              conError(async () => {
                await api(`/api/lineas/${lineaId}/quitar`, { method: "POST" });
                await cargarPedidos();
                if (pedidoId) await cargarPedido(pedidoId);
              })
            }
            onCantidad={(lineaId, cantidad) =>
              conError(async () => {
                await api(`/api/lineas/${lineaId}/cantidad`, {
                  method: "POST",
                  body: JSON.stringify({ cantidad }),
                });
                await cargarPedidos();
                if (pedidoId) await cargarPedido(pedidoId);
              })
            }
            onEnProceso={(lineaId) =>
              conError(async () => {
                await api(`/api/lineas/${lineaId}/en-proceso`, { method: "POST" });
                await cargarPedidos();
              })
            }
            onTablet={(on) =>
              conError(async () => {
                await api("/api/config", { method: "POST", body: JSON.stringify({ tablet_cocina: on }) });
                setTabletCocina(on);
                await cargarPedidos();
              })
            }
          />
        ) : null}
        {!pinEnviar && vista === "complementos" ? <Complementos mensajes={mensajes} /> : null}
      </main>
    </div>
  );
}
