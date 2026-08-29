import { useEffect, useState } from "react";
import { CheckCircle2, CircleUserRound, EthernetPort, FilePenLine, LoaderCircle, Network, Plus, Printer, RefreshCw, ShieldCheck, SlidersHorizontal, Users, Wifi, XCircle } from "lucide-react";
import { api } from "../api.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";

export type ImpresoraConfigUi = { habilitada: boolean; nombre: string; host: string; puerto: number; ancho_mm: 58 | 80 };
export type PlantillaImpresionUi = { titulo: string; encabezado: string; pie: string };
export type OpcionesValores = {
  nombre_local: string;
  logo_data: string | null;
  tipografia: "sans" | "serif" | "redondeada";
  tamano_ui: "compacto" | "normal" | "grande";
  pin_habilitado: boolean;
  pin_momento: "crear_orden" | "enviar";
  confirmar_comanda: boolean;
  auditoria_anulaciones: boolean;
  justificacion_anulacion: boolean;
  precuenta_obligatoria_antes_de_caja: boolean;
  enviar_a_caja_requiere_avanzado: boolean;
  impresora_comanda: ImpresoraConfigUi;
  impresora_boleta: ImpresoraConfigUi;
  plantilla_comanda: PlantillaImpresionUi;
  plantilla_boleta: PlantillaImpresionUi;
  servidor_red_habilitado: boolean;
  nombre_servidor: string;
};

type RolClave = "administrador" | "mesero" | "cocina" | "caja" | "inventario";
type RolUi = { clave: RolClave; nombre: string; descripcion: string };
type UsuarioUi = { id: number; nombre: string; usuario: string | null; activo: boolean; roles: RolClave[] };
type EstadoRed = { habilitado: boolean; nombre: string; puerto: number; urls: string[]; salud: string };
type TrabajoImpresion = { id: number; tipo: string; estado: string; intentos: number; ultimoError: string | null; creadoEn: string };
type Props = { valores: OpcionesValores; onCambiar: (patch: Partial<OpcionesValores>) => void };

function leerImagen(file: File, cb: (url: string) => void) {
  const reader = new FileReader();
  reader.onload = () => cb(String(reader.result));
  reader.readAsDataURL(file);
}

function NavOpciones() {
  return <nav className="settings-nav" aria-label="Secciones de opciones">
    <a href="#general" aria-label="General" title="General"><SlidersHorizontal size={17} aria-hidden="true" /><span>General</span></a>
    <a href="#impresion" aria-label="Impresión" title="Impresión"><Printer size={17} aria-hidden="true" /><span>Impresión</span></a>
    <a href="#usuarios" aria-label="Usuarios" title="Usuarios"><Users size={17} aria-hidden="true" /><span>Usuarios</span></a>
    <a href="#red-local" aria-label="Red local" title="Red local"><Network size={17} aria-hidden="true" /><span>Red local</span></a>
  </nav>;
}

function SeccionImpresora({ tipo, impresora, plantilla, onImpresora, onPlantilla }: {
  tipo: "comanda" | "boleta";
  impresora: ImpresoraConfigUi;
  plantilla: PlantillaImpresionUi;
  onImpresora: (valor: ImpresoraConfigUi) => void;
  onPlantilla: (valor: PlantillaImpresionUi) => void;
}) {
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<"diagnostico" | "prueba" | null>(null);
  const titulo = tipo === "comanda" ? "Comandas de cocina" : "Boletas y comprobantes";

  async function diagnosticar() {
    setOcupado("diagnostico"); setEstado(null);
    try {
      const resultado = await api<{ conectado: boolean; mensaje: string }>("/api/impresoras/diagnosticar", { method: "POST", body: JSON.stringify({ impresora }) });
      setEstado({ ok: resultado.conectado, texto: resultado.mensaje });
    } catch (error) { setEstado({ ok: false, texto: error instanceof Error ? error.message : String(error) }); }
    finally { setOcupado(null); }
  }

  async function imprimirPrueba() {
    setOcupado("prueba"); setEstado(null);
    try {
      const resultado = await api<{ mensaje: string }>("/api/impresoras/prueba", { method: "POST", body: JSON.stringify({ tipo }) });
      setEstado({ ok: true, texto: resultado.mensaje });
    } catch (error) { setEstado({ ok: false, texto: error instanceof Error ? error.message : String(error) }); }
    finally { setOcupado(null); }
  }

  const ejemplo = [plantilla.encabezado, plantilla.titulo || (tipo === "comanda" ? "COMANDA" : "COMPROBANTE"), "Mesa 4 · Orden 18", tipo === "comanda" ? "2 x Producto de prueba" : "1 x Producto        $5.000\nTOTAL               $5.000", plantilla.pie].filter(Boolean).join("\n");
  return <Card className="printer-card">
    <header className="printer-card__header">
      <div className="settings-icon"><Printer size={21} aria-hidden="true" /></div>
      <div><h3>{titulo}</h3><p>Conexión ESC/POS directa por red, sin controlador instalado en este equipo.</p></div>
      <label className="switch-compacto"><input type="checkbox" checked={impresora.habilitada} onChange={(event) => onImpresora({ ...impresora, habilitada: event.target.checked })} /><span>{impresora.habilitada ? "Activa" : "Inactiva"}</span></label>
    </header>
    <div className="printer-grid">
      <label>Nombre<input value={impresora.nombre} onChange={(event) => onImpresora({ ...impresora, nombre: event.target.value })} placeholder="Ej.: Cocina caliente" /></label>
      <label>IP o nombre de red<input value={impresora.host} onChange={(event) => onImpresora({ ...impresora, host: event.target.value })} placeholder="Ej.: 192.168.1.50" /></label>
      <label>Puerto<input type="number" min={1} max={65535} value={impresora.puerto} onChange={(event) => onImpresora({ ...impresora, puerto: Number(event.target.value) })} /></label>
      <label>Ancho de papel<select value={impresora.ancho_mm} onChange={(event) => onImpresora({ ...impresora, ancho_mm: Number(event.target.value) as 58 | 80 })}><option value={58}>58 mm</option><option value={80}>80 mm</option></select></label>
    </div>
    <div className="printer-actions">
      <Button type="button" variant="outline" disabled={ocupado !== null} onClick={diagnosticar}>{ocupado === "diagnostico" ? <LoaderCircle className="is-spinning" size={18} /> : <EthernetPort size={18} />}Confirmar conexión</Button>
      <Button type="button" disabled={ocupado !== null || !impresora.habilitada} onClick={imprimirPrueba}>{ocupado === "prueba" ? <LoaderCircle className="is-spinning" size={18} /> : <Printer size={18} />}Imprimir prueba</Button>
      {estado ? <span className={`settings-status ${estado.ok ? "is-ok" : "is-error"}`}>{estado.ok ? <CheckCircle2 size={17} /> : <XCircle size={17} />}{estado.texto}</span> : null}
    </div>
    <details className="template-editor"><summary><FilePenLine size={18} aria-hidden="true" />Diseñar plantilla</summary>
      <div className="template-editor__body">
        <div className="template-editor__fields">
          <label>Título<input value={plantilla.titulo} maxLength={60} onChange={(event) => onPlantilla({ ...plantilla, titulo: event.target.value })} /></label>
          <label>Encabezado<textarea rows={3} value={plantilla.encabezado} maxLength={300} onChange={(event) => onPlantilla({ ...plantilla, encabezado: event.target.value })} placeholder="Nombre, dirección o área" /></label>
          <label>Pie<textarea rows={3} value={plantilla.pie} maxLength={300} onChange={(event) => onPlantilla({ ...plantilla, pie: event.target.value })} placeholder="Mensaje final" /></label>
        </div>
        <pre className={`ticket-template-preview ancho-${impresora.ancho_mm}`}>{ejemplo}</pre>
      </div>
    </details>
  </Card>;
}

const usuarioVacio = { id: null as number | null, nombre: "", usuario: "", pin: "", password: "", activo: true, roles: ["mesero"] as RolClave[] };

function GestionUsuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioUi[]>([]);
  const [roles, setRoles] = useState<RolUi[]>([]);
  const [form, setForm] = useState(usuarioVacio);
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState("");
  const [guardando, setGuardando] = useState(false);
  async function cargar() { const data = await api<{ usuarios: UsuarioUi[]; roles: RolUi[] }>("/api/usuarios"); setUsuarios(data.usuarios); setRoles(data.roles); }
  useEffect(() => { cargar().catch((error) => setEstado(error instanceof Error ? error.message : String(error))); }, []);
  function editar(usuario: UsuarioUi) {
    setForm({ id: usuario.id, nombre: usuario.nombre, usuario: usuario.usuario ?? "", pin: "", password: "", activo: usuario.activo, roles: usuario.roles });
    setAbierto(true); setEstado("");
  }
  async function guardar() {
    setGuardando(true); setEstado("");
    try {
      await api(form.id ? `/api/usuarios/${form.id}` : "/api/usuarios", { method: form.id ? "PUT" : "POST", body: JSON.stringify(form) });
      await cargar(); setForm(usuarioVacio); setAbierto(false); setEstado("Usuario guardado");
    } catch (error) { setEstado(error instanceof Error ? error.message : String(error)); }
    finally { setGuardando(false); }
  }
  return <fieldset className="form-odoo__tarjeta settings-card settings-card--wide settings-users" id="usuarios">
    <legend>Usuarios y roles</legend>
    <div className="settings-section-heading"><div><h2>Equipo</h2><p>Cada usuario puede tener uno o más roles. Los permisos se combinan.</p></div><Button type="button" onClick={() => { setForm(usuarioVacio); setAbierto(true); setEstado(""); }}><Plus size={18} />Nuevo usuario</Button></div>
    <div className="users-list">{usuarios.map((usuario) => <button type="button" className="user-row" key={usuario.id} onClick={() => editar(usuario)}>
      <span className="user-row__avatar"><CircleUserRound size={21} /></span>
      <span className="user-row__identity"><strong>{usuario.nombre}</strong><small>{usuario.usuario || "Acceso mediante PIN"}</small></span>
      <span className="user-row__roles">{usuario.roles.map((rol) => <em key={rol}>{roles.find((item) => item.clave === rol)?.nombre ?? rol}</em>)}</span>
      <span className={`user-row__state ${usuario.activo ? "is-active" : ""}`}>{usuario.activo ? "Activo" : "Inactivo"}</span>
    </button>)}</div>
    {abierto ? <Card className="user-editor">
      <header><div><span className="page-eyebrow">{form.id ? "Editar usuario" : "Nuevo usuario"}</span><h3>{form.id ? form.nombre : "Agregar al equipo"}</h3></div><Button type="button" size="icon" variant="ghost" aria-label="Cerrar editor" onClick={() => setAbierto(false)}><XCircle size={20} /></Button></header>
      <div className="user-editor__fields">
        <label>Nombre<input value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} /></label>
        <label>Usuario de acceso<input autoCapitalize="none" value={form.usuario} onChange={(event) => setForm({ ...form, usuario: event.target.value })} placeholder="Obligatorio para iniciar sesión" /></label>
        <label>{form.id ? "Nuevo PIN" : "PIN"}<input type="password" inputMode="numeric" value={form.pin} onChange={(event) => setForm({ ...form, pin: event.target.value })} placeholder={form.id ? "Dejar vacío para conservar" : "Obligatorio"} /></label>
        <label>{form.id ? "Nueva contraseña" : "Contraseña"}<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={form.id ? "Dejar vacío para conservar" : "Obligatoria para iniciar sesión"} /></label>
      </div>
      <fieldset className="role-picker"><legend>Roles</legend>{roles.map((rol) => <label key={rol.clave}><input type="checkbox" checked={form.roles.includes(rol.clave)} onChange={(event) => setForm({ ...form, roles: event.target.checked ? [...form.roles, rol.clave] : form.roles.filter((item) => item !== rol.clave) })} /><span><strong>{rol.nombre}</strong><small>{rol.descripcion}</small></span></label>)}</fieldset>
      {form.id ? <label className="switch-tablet"><input type="checkbox" checked={form.activo} onChange={(event) => setForm({ ...form, activo: event.target.checked })} />Usuario activo</label> : null}
      <div className="user-editor__actions"><Button type="button" variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button><Button type="button" disabled={guardando || !form.nombre.trim() || !form.usuario.trim() || !form.roles.length || (!form.id && (!form.pin.trim() || !form.password.trim()))} onClick={guardar}>{guardando ? "Guardando…" : "Guardar usuario"}</Button></div>
    </Card> : null}
    {estado ? <p className="settings-feedback" role="status">{estado}</p> : null}
  </fieldset>;
}

function EstadoServidor({ valores, onCambiar }: Props) {
  const [estado, setEstado] = useState<EstadoRed | null>(null);
  const [error, setError] = useState("");
  async function cargar() { setError(""); try { setEstado(await api<EstadoRed>("/api/red/estado")); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }
  useEffect(() => { cargar(); }, [valores.servidor_red_habilitado]);
  return <fieldset className="form-odoo__tarjeta settings-card settings-card--wide network-settings" id="red-local">
    <legend>Servidor y red local</legend>
    <div className="settings-section-heading"><div><h2>Acceso desde otros equipos</h2><p>Meseros, cocina y administración pueden abrir la misma web desde la red Wi-Fi o cableada del restaurante.</p></div><Button type="button" variant="outline" onClick={cargar}><RefreshCw size={18} />Diagnosticar</Button></div>
    <label className="switch-tablet"><input type="checkbox" checked={valores.servidor_red_habilitado} onChange={(event) => onCambiar({ servidor_red_habilitado: event.target.checked })} />Permitir conexiones desde la red local</label>
    <label>Nombre del servidor<input maxLength={60} value={valores.nombre_servidor} onChange={(event) => onCambiar({ nombre_servidor: event.target.value })} /></label>
    <div className="network-status"><span className={`network-status__icon ${estado?.habilitado ? "is-online" : ""}`}><Wifi size={23} /></span><div><strong>{estado?.habilitado ? "Servidor disponible" : "Acceso local desactivado"}</strong><span>Puerto {estado?.puerto ?? "—"} · Estado {estado?.salud ?? "comprobando"}</span></div></div>
    <div className="network-addresses"><strong>Direcciones para conectar tablets y teléfonos</strong>{estado?.urls.length ? estado.urls.map((url) => <code key={url}>{url}</code>) : <span>No hay direcciones de red disponibles.</span>}</div>
    <p className="settings-callout"><ShieldCheck size={18} />Los equipos deben estar en la misma red local. Si cambias esta opción, reinicia la aplicación para aplicar el modo de escucha.</p>
    {error ? <p role="alert">{error}</p> : null}
  </fieldset>;
}

function ColaImpresion() {
  const [trabajos, setTrabajos] = useState<TrabajoImpresion[]>([]);
  const [estado, setEstado] = useState("");
  const [ocupado, setOcupado] = useState<number | null>(null);
  async function cargar() {
    setEstado("");
    try {
      const data = await api<{ trabajos: TrabajoImpresion[] }>("/api/impresion/trabajos");
      setTrabajos(data.trabajos);
    } catch (error) {
      setEstado(error instanceof Error ? error.message : String(error));
    }
  }
  useEffect(() => { cargar(); }, []);
  async function reintentar(id: number) {
    setOcupado(id); setEstado("");
    try {
      await api(`/api/impresion/trabajos/${id}/reintentar`, { method: "POST" });
      await cargar();
    } catch (error) {
      setEstado(error instanceof Error ? error.message : String(error));
    } finally {
      setOcupado(null);
    }
  }
  return <Card className="print-queue">
    <header className="settings-section-heading"><div><h3>Cola de impresión</h3><p>Últimos trabajos enviados y errores que necesitan atención.</p></div><Button type="button" size="icon" variant="outline" aria-label="Actualizar cola" onClick={cargar}><RefreshCw size={18} /></Button></header>
    <div className="print-queue__list">
      {trabajos.map((trabajo) => <div className={`print-queue__row is-${trabajo.estado}`} key={trabajo.id}>
        <Printer size={18} aria-hidden="true" />
        <div><strong>#{trabajo.id} · {trabajo.tipo}</strong><span>{new Date(trabajo.creadoEn).toLocaleString("es")} · {trabajo.intentos} intento(s)</span>{trabajo.ultimoError ? <em>{trabajo.ultimoError}</em> : null}</div>
        <BadgeEstadoImpresion estado={trabajo.estado} conError={Boolean(trabajo.ultimoError)} />
        {trabajo.ultimoError || trabajo.estado !== "sent" ? <Button type="button" size="sm" variant="outline" disabled={ocupado === trabajo.id} onClick={() => reintentar(trabajo.id)}>{ocupado === trabajo.id ? "Reintentando…" : "Reintentar"}</Button> : null}
      </div>)}
      {trabajos.length === 0 ? <p className="login-odoo__ayuda">Todavía no hay trabajos de impresión.</p> : null}
    </div>
    {estado ? <p role="alert">{estado}</p> : null}
  </Card>;
}

function BadgeEstadoImpresion({ estado, conError }: { estado: string; conError: boolean }) {
  const texto = estado === "sent" ? "Enviado" : conError || estado === "failed" ? "Con error" : "Pendiente";
  return <span className={`settings-status ${estado === "sent" ? "is-ok" : "is-error"}`}>{texto}</span>;
}

export function Opciones({ valores, onCambiar }: Props) {
  return <section className="page-shell form-odoo opciones-page">
    <header className="page-header"><div><span className="page-eyebrow">Administración del sistema</span><h1>Opciones</h1><p>Configura el restaurante, impresión, permisos y dispositivos conectados.</p></div></header>
    <NavOpciones />
    <fieldset className="form-odoo__tarjeta settings-card" id="general">
      <legend>Identidad</legend>
      <label>Nombre del restaurante<input maxLength={40} value={valores.nombre_local} onChange={(event) => onCambiar({ nombre_local: event.target.value })} onBlur={(event) => onCambiar({ nombre_local: event.target.value.trim() || "Restaurante" })} /></label>
      <label>Logo<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) leerImagen(file, (url) => onCambiar({ logo_data: url })); }} /></label>
      {valores.logo_data ? <><img src={valores.logo_data} alt="" className="form-odoo__foto-vista" /><button type="button" onClick={() => onCambiar({ logo_data: null })}>Quitar logo</button></> : null}
    </fieldset>
    <fieldset className="form-odoo__tarjeta settings-card">
      <legend>Apariencia</legend>
      <label>Tipo de letra<select value={valores.tipografia} onChange={(event) => onCambiar({ tipografia: event.target.value as OpcionesValores["tipografia"] })}><option value="sans">Sans</option><option value="serif">Serif</option><option value="redondeada">Redondeada</option></select></label>
      <label>Tamaño<select value={valores.tamano_ui} onChange={(event) => onCambiar({ tamano_ui: event.target.value as OpcionesValores["tamano_ui"] })}><option value="compacto">Compacto</option><option value="normal">Normal</option><option value="grande">Grande</option></select></label>
      <p className="login-odoo__ayuda">Se aplica a todo el sistema en cuanto lo cambias.</p>
    </fieldset>
    <fieldset className="form-odoo__tarjeta settings-card settings-card--wide">
      <legend>Seguridad y autorizaciones</legend>
      <div className="security-grid">
        <label className="switch-tablet"><input type="checkbox" checked={valores.pin_habilitado} onChange={(event) => onCambiar({ pin_habilitado: event.target.checked })} />Solicitar PIN</label>
        {valores.pin_habilitado ? <label>Momento<select value={valores.pin_momento} onChange={(event) => onCambiar({ pin_momento: event.target.value as OpcionesValores["pin_momento"] })}><option value="crear_orden">Antes de crear la orden</option><option value="enviar">Al hacer clic en Enviar</option></select></label> : null}
        <label className="switch-tablet"><input type="checkbox" checked={valores.confirmar_comanda} onChange={(event) => onCambiar({ confirmar_comanda: event.target.checked })} />Confirmar comanda antes de enviar</label>
        <label className="switch-tablet"><input type="checkbox" checked={valores.precuenta_obligatoria_antes_de_caja} onChange={(event) => onCambiar({ precuenta_obligatoria_antes_de_caja: event.target.checked })} />Pedir precuenta antes de cerrar la cuenta</label>
        <label className="switch-tablet"><input type="checkbox" checked={valores.enviar_a_caja_requiere_avanzado} onChange={(event) => onCambiar({ enviar_a_caja_requiere_avanzado: event.target.checked })} />Pedir permiso avanzado para cerrar la cuenta</label>
        <label className="switch-tablet"><input type="checkbox" checked={valores.auditoria_anulaciones} onChange={(event) => onCambiar({ auditoria_anulaciones: event.target.checked, ...(event.target.checked ? {} : { justificacion_anulacion: false }) })} />Guardar registro de órdenes anuladas</label>
        {valores.auditoria_anulaciones ? <label className="switch-tablet"><input type="checkbox" checked={valores.justificacion_anulacion} onChange={(event) => onCambiar({ justificacion_anulacion: event.target.checked })} />Pedir justificación al anular</label> : null}
      </div>
    </fieldset>
    <fieldset className="form-odoo__tarjeta settings-card settings-card--wide printing-settings" id="impresion">
      <legend>Impresión y diseño</legend>
      <div className="settings-section-heading"><div><h2>Impresoras</h2><p>Configura destinos independientes para cocina y caja.</p></div></div>
      <div className="printer-list">
        <SeccionImpresora tipo="comanda" impresora={valores.impresora_comanda} plantilla={valores.plantilla_comanda} onImpresora={(impresora_comanda) => onCambiar({ impresora_comanda })} onPlantilla={(plantilla_comanda) => onCambiar({ plantilla_comanda })} />
        <SeccionImpresora tipo="boleta" impresora={valores.impresora_boleta} plantilla={valores.plantilla_boleta} onImpresora={(impresora_boleta) => onCambiar({ impresora_boleta })} onPlantilla={(plantilla_boleta) => onCambiar({ plantilla_boleta })} />
      </div>
      <ColaImpresion />
      <p className="settings-callout is-warning"><ShieldCheck size={18} />El comprobante impreso por el sistema no es automáticamente una boleta tributaria. Para validez fiscal se debe integrar el proveedor de facturación o servicio tributario correspondiente.</p>
    </fieldset>
    <GestionUsuarios />
    <EstadoServidor valores={valores} onCambiar={onCambiar} />
  </section>;
}
