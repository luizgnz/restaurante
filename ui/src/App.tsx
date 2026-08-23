import { useEffect, useRef, useState } from "react";
import { api } from "./api.ts";
import { pedidosAtrasados, ultimosPedidos } from "../../src/modules/salon/barras.ts";
import { esperaMinutos, nivelEspera } from "../../src/modules/tiempo.ts";
import { Barra, type Destino } from "./pantallas/Barra.tsx";
import { Backend } from "./pantallas/Backend.tsx";
import { Categorias } from "./pantallas/Categorias.tsx";
import { ComandaEnPantalla, type ComandaUi } from "./pantallas/ComandaEnPantalla.tsx";
import { ConfirmarCierreCuenta } from "./pantallas/ConfirmarCierreCuenta.tsx";
import { ConstructorOrden, type ConfigContornosUi, type ProductoCarta } from "./pantallas/ConstructorOrden.tsx";
import { type Categoria } from "./pantallas/CrearProducto.tsx";
import { CuentaMesa, type CuentaDetalleUi, type OrdenCuentaUi } from "./pantallas/CuentaMesa.tsx";
import { EditarMapa } from "./pantallas/EditarMapa.tsx";
import { Login } from "./pantallas/Login.tsx";
import { ModalCrearProducto } from "./pantallas/ModalCrearProducto.tsx";
import { ModalEditarOrden } from "./pantallas/ModalEditarOrden.tsx";
import { ModalOrdenesCuenta } from "./pantallas/ModalOrdenesCuenta.tsx";
import type { SlotArmadoUi } from "./pantallas/ModalArmadoPlato.tsx";
import { Opciones, type OpcionesValores } from "./pantallas/Opciones.tsx";
import { Pedidos, type CuentaEnCursoUi } from "./pantallas/Pedidos.tsx";
import { PinPad } from "./pantallas/PinPad.tsx";
import { PrecuentaEnPantalla, type PrecuentaUi } from "./pantallas/PrecuentaEnPantalla.tsx";
import { Plano, type Mesa, type PedidoBarra, type Piso } from "./pantallas/Plano.tsx";
import { VistaPreviaComanda } from "./pantallas/VistaPreviaComanda.tsx";
import {
  type BorradorOrden,
  cargarBorrador,
  claveBorrador,
  eliminarBorrador,
  guardarBorrador,
} from "./lib/borradores.ts";
import {
  completarEnvioBorrador,
  contextoNuevaOrdenDeCuenta,
  ejecutarAccionModal,
  vistaTrasAccionCuenta,
  type ContextoOrden,
} from "./lib/flujo-cuentas.ts";

type PinPendiente =
  | { tipo: "enviar-orden"; borrador: BorradorOrden }
  | { tipo: "precuenta"; cuentaId: number }
  | { tipo: "enviar-caja"; cuentaId: number };

type EdicionOrden = { orden: OrdenCuentaUi; modo: "editar" | "anular" };

type Vista = Destino;
type Administrador = { id: number; nombre: string; derecho: string };
type Sesion = { abierta: boolean; administrador: Administrador | null };

export function App() {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [vista, setVista] = useState<Vista>("plano");
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [piso, setPiso] = useState("Salón");
  const [pisoId, setPisoId] = useState<number | null>(null);
  const [pisos, setPisos] = useState<Piso[]>([]);
  const [tieneFondo, setTieneFondo] = useState(false);
  const [fondoTick, setFondoTick] = useState(0);
  const [productos, setProductos] = useState<ProductoCarta[]>([]);
  const [cuentasEnCurso, setCuentasEnCurso] = useState<CuentaEnCursoUi[]>([]);
  const [cuentaActual, setCuentaActual] = useState<CuentaDetalleUi | null>(null);
  const [contextoOrden, setContextoOrden] = useState<ContextoOrden | null>(null);
  const [borradorOrden, setBorradorOrden] = useState<BorradorOrden | null>(null);
  const [edicionOrden, setEdicionOrden] = useState<EdicionOrden | null>(null);
  const [modalCuentaId, setModalCuentaId] = useState<number | null>(null);
  const [pinPendiente, setPinPendiente] = useState<PinPendiente | null>(null);
  const [previewOrden, setPreviewOrden] = useState<BorradorOrden | null>(null);
  const [comandaReciente, setComandaReciente] = useState<ComandaUi | null>(null);
  const [precuentaReciente, setPrecuentaReciente] = useState<PrecuentaUi | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [barraUltimos, setBarraUltimos] = useState(true);
  const [barraAtrasados, setBarraAtrasados] = useState(true);
  const [nombreLocal, setNombreLocal] = useState("Restaurante");
  const [logoData, setLogoData] = useState<string | null>(null);
  const [tipografia, setTipografia] = useState<OpcionesValores["tipografia"]>("sans");
  const [tamanoUi, setTamanoUi] = useState<OpcionesValores["tamano_ui"]>("normal");
  const [pinHabilitado, setPinHabilitado] = useState(true);
  const [pinMomento, setPinMomento] = useState<OpcionesValores["pin_momento"]>("enviar");
  const [confirmarComanda, setConfirmarComanda] = useState(false);
  const [auditoriaAnulaciones, setAuditoriaAnulaciones] = useState(false);
  const [justificacionAnulacion, setJustificacionAnulacion] = useState(false);
  const [precuentaObligatoria, setPrecuentaObligatoria] = useState(true);
  const [cierreRequiereAvanzado, setCierreRequiereAvanzado] = useState(false);
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [contornosConfig, setContornosConfig] = useState<ConfigContornosUi | null>(null);
  const [crearProductoAbierto, setCrearProductoAbierto] = useState(false);
  const [errorCrearProducto, setErrorCrearProducto] = useState("");
  const [error, setError] = useState("");
  const [errorModal, setErrorModal] = useState("");
  const envioEnCurso = useRef(false);

  async function cargarSesion() {
    setSesion(await api<Sesion>("/api/sesion"));
  }
  async function cargarPlano() {
    const data = await api<{
      mesas: Mesa[];
      pisos: { id: number; nombre: string; tiene_fondo: number }[];
    }>("/api/mesas");
    setMesas(data.mesas);
    setPisos(data.pisos);
    const nextId =
      pisoId != null && data.pisos.some((p) => p.id === pisoId) ? pisoId : (data.pisos[0]?.id ?? null);
    setPisoId(nextId);
    const actual = data.pisos.find((p) => p.id === nextId);
    if (actual) {
      setPiso(actual.nombre);
      setTieneFondo(Boolean(actual.tiene_fondo));
    }
  }
  async function cargarCarta() {
    const data = await api<{ productos: typeof productos }>("/api/carta");
    setProductos(data.productos);
  }
  async function cargarCuenta(id: number) {
    const data = await api<CuentaDetalleUi>(`/api/cuentas/${id}`);
    setCuentaActual(data);
    return data;
  }
  async function cargarCuentasEnCurso() {
    const data = await api<{ cuentas: CuentaEnCursoUi[] }>("/api/cuentas");
    setCuentasEnCurso(data.cuentas);
  }
  async function cargarConfig() {
    const data = await api<OpcionesValores & { barra_ultimos_pedidos: boolean; barra_atrasados: boolean }>(
      "/api/config",
    );
    aplicarConfig(data);
  }

  function aplicarConfig(
    data: Partial<OpcionesValores> & {
      barra_ultimos_pedidos?: boolean;
      barra_atrasados?: boolean;
    },
  ) {
    if (typeof data.barra_ultimos_pedidos === "boolean") setBarraUltimos(data.barra_ultimos_pedidos);
    if (typeof data.barra_atrasados === "boolean") setBarraAtrasados(data.barra_atrasados);
    if (typeof data.nombre_local === "string") setNombreLocal(data.nombre_local);
    if (data.logo_data !== undefined) setLogoData(data.logo_data);
    if (data.tipografia) setTipografia(data.tipografia);
    if (data.tamano_ui) setTamanoUi(data.tamano_ui);
    if (typeof data.pin_habilitado === "boolean") setPinHabilitado(data.pin_habilitado);
    if (data.pin_momento) setPinMomento(data.pin_momento);
    if (typeof data.confirmar_comanda === "boolean") setConfirmarComanda(data.confirmar_comanda);
    if (typeof data.auditoria_anulaciones === "boolean") setAuditoriaAnulaciones(data.auditoria_anulaciones);
    if (typeof data.justificacion_anulacion === "boolean") setJustificacionAnulacion(data.justificacion_anulacion);
    if (typeof data.precuenta_obligatoria_antes_de_caja === "boolean") {
      setPrecuentaObligatoria(data.precuenta_obligatoria_antes_de_caja);
    }
    if (typeof data.enviar_a_caja_requiere_avanzado === "boolean") {
      setCierreRequiereAvanzado(data.enviar_a_caja_requiere_avanzado);
    }
  }

  async function guardarBarras(patch: { barra_ultimos_pedidos?: boolean; barra_atrasados?: boolean }) {
    const data = await api<{
      barra_ultimos_pedidos: boolean;
      barra_atrasados: boolean;
    }>("/api/config", { method: "POST", body: JSON.stringify(patch) });
    setBarraUltimos(data.barra_ultimos_pedidos);
    setBarraAtrasados(data.barra_atrasados);
  }

  async function guardarOpciones(patch: Partial<OpcionesValores>) {
    aplicarConfig(await api<OpcionesValores>("/api/config", { method: "POST", body: JSON.stringify(patch) }));
  }

  useEffect(() => {
    document.documentElement.dataset.tipografia = tipografia;
    document.documentElement.dataset.tamano = tamanoUi;
  }, [tipografia, tamanoUi]);

  function conEspera(lista: CuentaEnCursoUi[]): PedidoBarra[] {
    return lista.map((cuenta) => {
      const abiertaEn = cuenta.abiertaEn ?? new Date().toISOString();
      const espera_min = cuenta.espera_min ?? esperaMinutos(abiertaEn);
      return {
        id: cuenta.id,
        mesa: cuenta.mesa,
        mesero: cuenta.mesero,
        hace: cuenta.hace,
        espera_min,
        nivel: nivelEspera(espera_min),
        abierto_en: abiertaEn,
      };
    });
  }

  useEffect(() => {
    cargarSesion().catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!sesion?.abierta) return;
    cargarPlano().catch((e) => setError(String(e)));
    cargarCarta().catch((e) => setError(String(e)));
    cargarCuentasEnCurso().catch((e) => setError(String(e)));
    cargarConfig().catch((e) => setError(String(e)));
    cargarContornos().catch((e) => setError(String(e)));
  }, [sesion?.abierta]);

  async function conError(fn: () => Promise<void>) {
    try {
      setError("");
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function cargarCategorias() {
    const data = await api<{ categorias: Categoria[] }>("/api/categorias");
    setCategorias(data.categorias);
  }

  async function cargarContornos() {
    const data = await api<ConfigContornosUi>("/api/contornos");
    setContornosConfig({
      grupos: data.grupos.map((grupo) => ({ id: grupo.id, nombre: grupo.nombre })),
      variantes: data.grupos.flatMap((grupo) => grupo.variantes),
    });
  }

  async function slotsDeProducto(productoId: number): Promise<SlotArmadoUi[]> {
    const data = await api<{ slots: SlotArmadoUi[] }>(`/api/productos/${productoId}/slots`);
    return data.slots;
  }

  async function ir(v: Destino) {
    if (v === "pedidos") cargarCuentasEnCurso().catch((e) => setError(String(e)));
    if (v === "plano" || v === "editar-mapa") cargarPlano().catch((e) => setError(String(e)));
    if (v === "categorias") cargarCategorias().catch((e) => setError(String(e)));
    setVista(v);
  }

  function abrirCrearProducto() {
    setErrorCrearProducto("");
    setCrearProductoAbierto(true);
    cargarCategorias().catch((e) => setErrorCrearProducto(String(e)));
  }

  function contextoBorrador(contexto: ContextoOrden) {
    if (contexto.tipo === "general") return { tipo: "general" as const };
    if (contexto.tipo === "mesa") return { tipo: "mesa" as const, mesaId: contexto.mesaId };
    return { tipo: "cuenta" as const, cuentaId: contexto.cuentaId };
  }

  function borradorNuevo(contexto: ContextoOrden): BorradorOrden {
    return {
      version: 1,
      claveIdempotencia: globalThis.crypto.randomUUID(),
      ...(contexto.tipo === "mesa"
        ? { mesaId: contexto.mesaId }
        : contexto.tipo === "cuenta"
          ? { mesaId: contexto.mesaId, cuentaId: contexto.cuentaId }
          : {}),
      lineas: [],
      indicaciones: "",
      actualizadoEn: new Date().toISOString(),
    };
  }

  function abrirConstructor(contexto: ContextoOrden) {
    const clave = claveBorrador(contextoBorrador(contexto));
    const guardado = cargarBorrador(window.localStorage, clave);
    if (contexto.tipo !== "cuenta") setCuentaActual(null);
    setContextoOrden(contexto);
    setBorradorOrden(guardado ?? borradorNuevo(contexto));
    setVista("pedido");
  }

  function cambiarBorrador(borrador: BorradorOrden) {
    if (!contextoOrden) return;
    guardarBorrador(window.localStorage, claveBorrador(contextoBorrador(contextoOrden)), borrador);
    setBorradorOrden(borrador);
  }

  async function enviarOrden(borrador: BorradorOrden, pin?: string) {
    if (!contextoOrden || envioEnCurso.current) return;
    envioEnCurso.current = true;
    setEnviando(true);
    try {
      const ruta =
        contextoOrden.tipo === "cuenta"
          ? `/api/cuentas/${contextoOrden.cuentaId}/ordenes`
          : "/api/ordenes";
      const respuesta = await api<{ cuentaId: number; ordenNumero: number }>(ruta, {
        method: "POST",
        body: JSON.stringify({
          mesaId: borrador.mesaId,
          claveIdempotencia: borrador.claveIdempotencia,
          pin,
          lineas: borrador.lineas.filter((linea) => linea.cantidad > 0),
          indicaciones: borrador.indicaciones,
        }),
      });
      const clave = claveBorrador(contextoBorrador(contextoOrden));
      await completarEnvioBorrador({
        cuentaId: respuesta.cuentaId,
        cargarCuenta,
        eliminarBorrador: () => eliminarBorrador(window.localStorage, clave),
      });
      setComandaReciente({
        mesaNumero: mesas.find((mesa) => mesa.id === borrador.mesaId)?.numero ?? null,
        ordenNumero: respuesta.ordenNumero,
        mesero: sesion?.administrador?.nombre ?? "",
        indicaciones: borrador.indicaciones.trim() ? borrador.indicaciones : null,
        lineas: borrador.lineas
          .filter((linea) => linea.cantidad > 0)
          .map((linea) => ({
            nombre: productos.find((producto) => producto.id === linea.productoId)?.nombre ?? `Producto ${linea.productoId}`,
            cantidad: linea.cantidad,
            nota: linea.nota.trim() ? linea.nota : null,
          })),
      });
      setContextoOrden(null);
      setBorradorOrden(null);
      setPinPendiente(null);
      await Promise.all([cargarPlano(), cargarCuentasEnCurso()]);
    } finally {
      envioEnCurso.current = false;
      setEnviando(false);
    }
  }

  async function empezarEnviarOrden(borrador: BorradorOrden) {
    if (enviando || pinPendiente || previewOrden) return;
    if (confirmarComanda) {
      setPreviewOrden(borrador);
      return;
    }
    if (pinHabilitado) {
      setErrorModal("");
      setPinPendiente({ tipo: "enviar-orden", borrador });
      return;
    }
    await enviarOrden(borrador);
  }

  function textoPreviewOrden(borrador: BorradorOrden) {
    const mesaNumero = mesas.find((mesa) => mesa.id === borrador.mesaId)?.numero;
    const lineas = borrador.lineas.map((linea) => {
      const nombre = productos.find((producto) => producto.id === linea.productoId)?.nombre ?? `Producto ${linea.productoId}`;
      return `${linea.cantidad} × ${nombre}${linea.nota ? ` (${linea.nota})` : ""}`;
    });
    return [`Mesa #${mesaNumero ?? borrador.mesaId ?? "?"}`, ...lineas, borrador.indicaciones ? `Indicaciones: ${borrador.indicaciones}` : ""]
      .filter(Boolean)
      .join("\n");
  }

  async function continuarPreviewOrden() {
    const borrador = previewOrden;
    if (!borrador) return;
    setPreviewOrden(null);
    if (pinHabilitado) {
      setErrorModal("");
      setPinPendiente({ tipo: "enviar-orden", borrador });
      return;
    }
    await enviarOrden(borrador);
  }

  async function accionCuenta(tipo: "precuenta" | "enviar-caja", id: number, pin?: string) {
    if (envioEnCurso.current) return;
    envioEnCurso.current = true;
    setEnviando(true);
    try {
      const respuesta = await api<{ numero: number }>(`/api/cuentas/${id}/${tipo}`, {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      const detalle = await cargarCuenta(id);
      if (tipo === "precuenta") {
        setPrecuentaReciente({
          mesaNumero: detalle.mesa.numero,
          numero: respuesta.numero,
          mesero: sesion?.administrador?.nombre ?? "",
          lineas: detalle.ordenes.flatMap((orden) =>
            orden.lineas
              .filter((linea) => linea.cantidad > 0)
              .map((linea) => ({
                nombre: linea.nombre,
                cantidad: linea.cantidad,
                precioCentavos: linea.precioCentavos,
                nota: linea.nota,
              })),
          ),
          totalCentavos: detalle.totalCentavos,
        });
      }
      await Promise.all([cargarPlano(), cargarCuentasEnCurso()]);
      setPinPendiente(null);
      setVista(vistaTrasAccionCuenta(tipo));
      if (tipo === "enviar-caja") {
        setCuentaActual(null);
        setContextoOrden(null);
        setBorradorOrden(null);
      }
    } finally {
      envioEnCurso.current = false;
      setEnviando(false);
    }
  }

  function empezarAccionCuenta(tipo: "precuenta" | "enviar-caja") {
    if (!cuentaActual || enviando || pinPendiente) return;
    if (pinHabilitado) {
      setErrorModal("");
      setPinPendiente({ tipo, cuentaId: cuentaActual.id });
      return;
    }
    conError(() => accionCuenta(tipo, cuentaActual.id));
  }

  async function resolverPin(pin: string) {
    const pendiente = pinPendiente;
    if (!pendiente || enviando) return;
    if (pendiente.tipo === "enviar-orden") await enviarOrden(pendiente.borrador, pin);
    else await accionCuenta(pendiente.tipo, pendiente.cuentaId, pin);
  }

  async function resolverPinEnModal(pin: string) {
    await ejecutarAccionModal(() => resolverPin(pin), setErrorModal);
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
      <Barra
        vista={vista}
        marca={nombreLocal}
        logo={logoData}
        nombre={sesion.administrador?.nombre ?? ""}
        onMesas={() => ir("plano")}
        onOrdenes={() => ir("pedidos")}
        onCerrarSesion={() =>
          conError(async () => {
            await api("/api/sesion/cerrar", { method: "POST" });
            setSesion({ abierta: false, administrador: null });
            setVista("plano");
          })
        }
        onCrearProducto={abrirCrearProducto}
        onIr={ir}
      />
      {error ? <p role="alert">{error}</p> : null}
      <main>
        {pinPendiente ? (
          <PinPad
            titulo={
              pinPendiente.tipo === "enviar-orden"
                ? "PIN para enviar orden"
                : pinPendiente.tipo === "precuenta"
                  ? "PIN para precuenta"
                  : "PIN para enviar a caja"
            }
            error={errorModal}
            onPin={resolverPinEnModal}
            onCancelar={() => {
              setPinPendiente(null);
              setErrorModal("");
            }}
          />
        ) : null}
        {previewOrden ? (
          <VistaPreviaComanda
            texto={textoPreviewOrden(previewOrden)}
            onVolver={() => setPreviewOrden(null)}
            onContinuar={() => conError(continuarPreviewOrden)}
          />
        ) : null}
        {comandaReciente ? (
          <ComandaEnPantalla
            restaurante={nombreLocal}
            comanda={comandaReciente}
            onCerrar={() => setComandaReciente(null)}
          />
        ) : null}
        {precuentaReciente ? (
          <PrecuentaEnPantalla
            restaurante={nombreLocal}
            precuenta={precuentaReciente}
            onCerrar={() => setPrecuentaReciente(null)}
          />
        ) : null}
        {confirmarCierre && cuentaActual ? (
          <ConfirmarCierreCuenta
            mesaNumero={cuentaActual.mesa.numero}
            totalCentavos={cuentaActual.totalCentavos}
            onCancelar={() => setConfirmarCierre(false)}
            onConfirmar={() => {
              setConfirmarCierre(false);
              empezarAccionCuenta("enviar-caja");
            }}
          />
        ) : null}
        {modalCuentaId != null && cuentaActual?.id === modalCuentaId ? (
          <ModalOrdenesCuenta
            cuenta={cuentaActual}
            onEditarOrden={(orden) => setEdicionOrden({ orden, modo: "editar" })}
            onAnularOrden={(orden) => setEdicionOrden({ orden, modo: "anular" })}
            onCerrar={() => setModalCuentaId(null)}
          />
        ) : null}
        {edicionOrden && cuentaActual ? (
          <ModalEditarOrden
            orden={edicionOrden.orden}
            productos={productos}
            modo={edicionOrden.modo}
            pedirJustificacionAlAnular={auditoriaAnulaciones && justificacionAnulacion}
            onCancelar={() => setEdicionOrden(null)}
            onGuardar={async (cambio, pin) => {
              const ruta =
                edicionOrden.modo === "anular"
                  ? `/api/ordenes/${edicionOrden.orden.id}/anular`
                  : `/api/ordenes/${edicionOrden.orden.id}/correcciones`;
              await api(ruta, {
                method: "POST",
                body: JSON.stringify({
                  ...cambio,
                  pin,
                  ...(edicionOrden.modo === "anular" ? { lineas: undefined, indicaciones: undefined } : {}),
                }),
              });
              await cargarCuenta(cuentaActual.id);
              setEdicionOrden(null);
              await Promise.all([cargarPlano(), cargarCuentasEnCurso()]);
            }}
          />
        ) : null}
        {vista === "plano" ? (
          <Plano
            piso={piso}
            pisoId={pisoId}
            pisos={pisos}
            mesas={mesas}
            bloqueado={Boolean(pinPendiente || previewOrden || edicionOrden)}
            fondoUrl={tieneFondo && pisoId ? `/api/pisos/${pisoId}/fondo?t=${fondoTick}` : null}
            onPiso={(p) => {
              setPiso(p.nombre);
              setPisoId(p.id);
              setTieneFondo(Boolean(p.tiene_fondo));
            }}
            mostrarUltimos={barraUltimos}
            mostrarAtrasados={barraAtrasados}
            ultimos={ultimosPedidos(conEspera(cuentasEnCurso), 5)}
            atrasados={pedidosAtrasados(conEspera(cuentasEnCurso), 5)}
            onPedido={() => setVista("pedidos")}
            onToggleUltimos={() => conError(() => guardarBarras({ barra_ultimos_pedidos: !barraUltimos }))}
            onToggleAtrasados={() => conError(() => guardarBarras({ barra_atrasados: !barraAtrasados }))}
            onOrdenes={() => {
              setVista("pedidos");
              cargarCuentasEnCurso().catch((e) => setError(String(e)));
            }}
            onNuevoPedido={() => abrirConstructor({ tipo: "general" })}
            onMesa={(m) => {
              if (m.cuentaId) {
                conError(async () => {
                  await cargarCuenta(m.cuentaId as number);
                  setContextoOrden(null);
                  setBorradorOrden(null);
                  setVista("pedido");
                });
                return;
              }
              if (m.estado !== "libre") {
                setError(`La Mesa #${m.numero} no está disponible.`);
                return;
              }
              abrirConstructor({ tipo: "mesa", mesaId: m.id, mesaNumero: m.numero });
            }}
          />
        ) : null}
        {vista === "pedido" && contextoOrden && borradorOrden ? (
          <ConstructorOrden
            productos={productos}
            borrador={borradorOrden}
            cuentaId={contextoOrden.tipo === "cuenta" ? contextoOrden.cuentaId : undefined}
            mesaFija={
              contextoOrden.tipo === "mesa" || contextoOrden.tipo === "cuenta"
                ? { id: contextoOrden.mesaId, numero: contextoOrden.mesaNumero }
                : undefined
            }
            mesasSeleccionables={mesas.map((m) => ({
              id: m.id,
              numero: m.numero,
              estado: m.estado === "libre" ? "libre" : "ocupada",
            }))}
            contornos={contornosConfig}
            onSlotsDeProducto={slotsDeProducto}
            onCambiar={cambiarBorrador}
            onEnviar={(borrador) => conError(() => empezarEnviarOrden(borrador))}
            onCancelar={() => {
              setContextoOrden(null);
              setBorradorOrden(null);
              setVista(cuentaActual ? "pedido" : "plano");
            }}
          />
        ) : null}
        {vista === "pedido" && !contextoOrden && cuentaActual ? (
          <CuentaMesa
            cuenta={cuentaActual}
            puedeCerrar={!precuentaObligatoria || cuentaActual.estado === "precuenta_emitida"}
            onNuevaOrden={() => abrirConstructor(contextoNuevaOrdenDeCuenta(cuentaActual))}
            onEditarOrden={(orden) => setEdicionOrden({ orden, modo: "editar" })}
            onAnularOrden={(orden) => setEdicionOrden({ orden, modo: "anular" })}
            onPrecuenta={() => empezarAccionCuenta("precuenta")}
            onCerrarCuenta={() => setConfirmarCierre(true)}
            onNotaPrivada={async (notaPrivada) => {
              await api(`/api/cuentas/${cuentaActual.id}/nota-privada`, {
                method: "POST",
                body: JSON.stringify({ notaPrivada }),
              });
              await cargarCuenta(cuentaActual.id);
            }}
          />
        ) : null}
        {vista === "pedidos" ? (
          <Pedidos
            cuentas={cuentasEnCurso}
            onAbrir={(cuentaId) =>
              conError(async () => {
                await cargarCuenta(cuentaId);
                setModalCuentaId(cuentaId);
              })
            }
          />
        ) : null}
        <ModalCrearProducto
          abierto={crearProductoAbierto}
          categorias={categorias}
          error={errorCrearProducto}
          onCerrar={() => {
            setCrearProductoAbierto(false);
            setErrorCrearProducto("");
          }}
          onGuardar={async (p) => {
            try {
              setErrorCrearProducto("");
              await api("/api/productos", { method: "POST", body: JSON.stringify(p) });
              await cargarCarta();
              setCrearProductoAbierto(false);
            } catch (e) {
              setErrorCrearProducto(e instanceof Error ? e.message : String(e));
            }
          }}
        />
        {vista === "editar-mapa" ? (
          <EditarMapa
            pisos={pisos}
            mesas={mesas}
            onDescartar={() => ir("plano")}
            onGuardar={(payload) =>
              conError(async () => {
                await api("/api/plano", {
                  method: "PUT",
                  body: JSON.stringify({
                    pisos: payload.pisos.map((p) => ({
                      id: p.id,
                      nombre: p.nombre,
                      fondo_color: p.fondo_color,
                      fondo_data: p.fondo_data,
                      fondo_quitar_imagen: p.fondo_quitar_imagen,
                      mesas: p.mesas.map((m) => ({
                        id: m.id > 0 ? m.id : undefined,
                        numero: m.numero,
                        asientos: m.asientos,
                        pos_x: m.pos_x,
                        pos_y: m.pos_y,
                        forma: m.forma,
                        ancho: m.ancho,
                        alto: m.alto,
                        fondo_color: m.fondo_color,
                        fondo_data: m.fondo_data,
                      })),
                    })),
                    quitarMesaIds: payload.quitarMesaIds,
                    quitarPisoIds: payload.quitarPisoIds,
                  }),
                });
                await cargarPlano();
                setVista("plano");
              })
            }
          />
        ) : null}
        {vista === "backend" ? (
          <Backend
            onCrearProducto={abrirCrearProducto}
            onCategorias={() => ir("categorias")}
            onEditarMapa={() => ir("editar-mapa")}
            onMesas={() => ir("plano")}
          />
        ) : null}
        {vista === "categorias" ? (
          <Categorias
            categorias={categorias}
            onCrear={async (nombre) => {
              await api("/api/categorias", { method: "POST", body: JSON.stringify({ nombre }) });
              await cargarCategorias();
            }}
            onVolver={() => ir("backend")}
          />
        ) : null}
        {vista === "opciones" ? (
          <Opciones
            valores={{
              nombre_local: nombreLocal,
              logo_data: logoData,
              tipografia,
              tamano_ui: tamanoUi,
              pin_habilitado: pinHabilitado,
              pin_momento: pinMomento,
              confirmar_comanda: confirmarComanda,
              auditoria_anulaciones: auditoriaAnulaciones,
              justificacion_anulacion: justificacionAnulacion,
              precuenta_obligatoria_antes_de_caja: precuentaObligatoria,
              enviar_a_caja_requiere_avanzado: cierreRequiereAvanzado,
            }}
            onCambiar={(patch) => conError(() => guardarOpciones(patch))}
          />
        ) : null}
      </main>
    </div>
  );
}
