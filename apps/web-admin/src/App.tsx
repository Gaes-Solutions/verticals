import {
  BadgePercent,
  BarChart3,
  BookOpen,
  Building2,
  ChevronDown,
  CreditCard,
  DollarSign,
  FileText,
  Globe,
  HandCoins,
  HelpCircle,
  KeyRound,
  Languages,
  Link2,
  type LucideIcon,
  Menu,
  MessageCircleQuestion,
  Monitor,
  Package,
  PackageCheck,
  Percent,
  QrCode,
  Receipt,
  Rocket,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Star,
  Tags,
  TrendingUp,
  Truck,
  Upload,
  UserCircle,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { type ComponentType, type FormEvent, useEffect, useState } from "react";
import { Login } from "./components/Login.js";
import { NotificacionesBell } from "./components/NotificacionesBell.js";
import { Signup } from "./components/Signup.js";
import { Tour } from "./components/Tour.js";
import { ApiError, cambiarMiPassword, loadToken, puede, setToken } from "./lib/api.js";
import { AutomatizacionesPage } from "./pages/AutomatizacionesPage.js";
import { AyudaPage } from "./pages/AyudaPage.js";
import { CfdiPage } from "./pages/CfdiPage.js";
import { ClientesB2bPage } from "./pages/ClientesB2bPage.js";
import { CobrosPage } from "./pages/CobrosPage.js";
import { ComisionesPage } from "./pages/ComisionesPage.js";
import { ComprasPage } from "./pages/ComprasPage.js";
import { ConfiguracionPage } from "./pages/ConfiguracionPage.js";
import { ContabilidadPage } from "./pages/ContabilidadPage.js";
import { CxcPage } from "./pages/CxcPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { DevolucionesPage } from "./pages/DevolucionesPage.js";
import { DominioB2bPage } from "./pages/DominioB2bPage.js";
import { EnviosPage } from "./pages/EnviosPage.js";
import { EtiquetasPage } from "./pages/EtiquetasPage.js";
import { GuiaInicioPage } from "./pages/GuiaInicioPage.js";
import { ImportadorPage } from "./pages/ImportadorPage.js";
import { InventarioInsightsPage } from "./pages/InventarioInsightsPage.js";
import { InventarioPage } from "./pages/InventarioPage.js";
import { KioskosPage } from "./pages/KioskosPage.js";
import { MonederoPage } from "./pages/MonederoPage.js";
import { PedidosPage } from "./pages/PedidosPage.js";
import { PreciosPage } from "./pages/PreciosPage.js";
import { PreguntasPage } from "./pages/PreguntasPage.js";
import { ProductosPage } from "./pages/ProductosPage.js";
import { PromocionesPage } from "./pages/PromocionesPage.js";
import { ReportesPage } from "./pages/ReportesPage.js";
import { ResenasPage } from "./pages/ResenasPage.js";
import { SeguridadPage } from "./pages/SeguridadPage.js";
import { SuscripcionPage } from "./pages/SuscripcionPage.js";
import { TiendaPage } from "./pages/TiendaPage.js";
import { UsuariosRolesPage } from "./pages/UsuariosRolesPage.js";
import { VentasPage } from "./pages/VentasPage.js";

export interface AdminSession {
  nombre: string;
  tenantSlug: string;
}

type Seccion =
  | "inicio"
  | "dashboard"
  | "reportes"
  | "productos"
  | "inventario"
  | "inventario-iq"
  | "etiquetas"
  | "ventas"
  | "cobros"
  | "cxc"
  | "promociones"
  | "monedero"
  | "pedidos"
  | "devoluciones"
  | "preguntas"
  | "envios"
  | "resenas"
  | "automatizaciones"
  | "importador"
  | "compras"
  | "cfdi"
  | "contabilidad"
  | "precios"
  | "clientes-b2b"
  | "comisiones"
  | "usuarios"
  | "seguridad"
  | "configuracion"
  | "kioskos"
  | "contabilidad"
  | "suscripcion"
  | "portal-b2b"
  | "tienda"
  | "ayuda";

interface NavItem {
  key: Seccion;
  label: string;
  icon: LucideIcon;
  perm: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

// `perm` = permiso de lectura que exige la ruta de ese módulo. La UI oculta el
// item si el usuario no lo tiene (el dueño con "*" ve todo). Defensa en
// profundidad: el backend revalida igual con requirePerm.
const NAV_GROUPS: NavGroup[] = [
  {
    title: "Inicio",
    items: [
      { key: "inicio", label: "Guía de inicio", icon: Rocket, perm: "reportes.ventas" },
      { key: "dashboard", label: "Resumen", icon: BarChart3, perm: "reportes.ventas" },
      { key: "reportes", label: "Reportes", icon: BarChart3, perm: "reportes.ventas" },
      { key: "ayuda", label: "Ayuda", icon: HelpCircle, perm: "public" },
    ],
  },
  {
    title: "Ventas",
    items: [
      { key: "ventas", label: "Ventas", icon: Receipt, perm: "ventas.leer" },
      { key: "cobros", label: "Cobros / Links", icon: Link2, perm: "ventas.crear" },
      { key: "cxc", label: "Cuentas por cobrar", icon: HandCoins, perm: "cxc.leer" },
      { key: "devoluciones", label: "Devoluciones", icon: RotateCcw, perm: "ventas.leer" },
    ],
  },
  {
    title: "Catálogo e inventario",
    items: [
      { key: "productos", label: "Productos", icon: Package, perm: "productos.leer" },
      { key: "inventario", label: "Inventario", icon: Tags, perm: "inventario.leer" },
      { key: "etiquetas", label: "Etiquetas y códigos", icon: QrCode, perm: "productos.leer" },
      { key: "importador", label: "Carga masiva", icon: Upload, perm: "productos.bulk_import" },
      {
        key: "inventario-iq",
        label: "Inteligencia inventario",
        icon: TrendingUp,
        perm: "reportes.ventas",
      },
      { key: "compras", label: "Compras (OC)", icon: ShoppingBag, perm: "compras_oc.leer" },
    ],
  },
  {
    title: "Tienda online",
    items: [
      { key: "tienda", label: "Tienda online", icon: ShoppingCart, perm: "ecommerce.configurar" },
      {
        key: "pedidos",
        label: "Pedidos online",
        icon: PackageCheck,
        perm: "ecommerce.pedidos_leer",
      },
      { key: "envios", label: "Envíos", icon: Truck, perm: "ecommerce.envios_gestionar" },
      {
        key: "preguntas",
        label: "Preguntas",
        icon: MessageCircleQuestion,
        perm: "ecommerce.resenas_moderar",
      },
      { key: "resenas", label: "Reseñas", icon: Star, perm: "ecommerce.resenas_moderar" },
    ],
  },
  {
    title: "Clientes y marketing",
    items: [
      { key: "clientes-b2b", label: "Clientes mayoreo", icon: Building2, perm: "clientes.leer" },
      { key: "precios", label: "Listas de precios", icon: DollarSign, perm: "precios.leer" },
      {
        key: "promociones",
        label: "Promociones",
        icon: BadgePercent,
        perm: "promociones.gestionar",
      },
      { key: "monedero", label: "Monedero / Gift cards", icon: Wallet, perm: "ventas.crear" },
      { key: "comisiones", label: "Comisiones", icon: Percent, perm: "comisiones.gestionar" },
      {
        key: "automatizaciones",
        label: "Automatizaciones",
        icon: Zap,
        perm: "plantillas.gestionar",
      },
      {
        key: "portal-b2b",
        label: "Portal mayorista",
        icon: Globe,
        perm: "configuracion.actualizar",
      },
    ],
  },
  {
    title: "Administración",
    items: [
      { key: "cfdi", label: "Facturación", icon: FileText, perm: "cfdi.leer" },
      { key: "contabilidad", label: "Contabilidad", icon: FileText, perm: "cfdis_recibidos.leer" },
      { key: "usuarios", label: "Usuarios y permisos", icon: Users, perm: "usuarios.leer" },
      { key: "seguridad", label: "Seguridad", icon: ShieldCheck, perm: "configuracion.leer" },
      { key: "configuracion", label: "Configuración", icon: Settings, perm: "configuracion.leer" },
      { key: "kioskos", label: "Kioskos de precios", icon: Monitor, perm: "configuracion.leer" },
      { key: "suscripcion", label: "Mi suscripción", icon: CreditCard, perm: "*" },
    ],
  },
];

const PAGE_COMPONENTS: Record<Seccion, ComponentType> = {
  inicio: GuiaInicioPage,
  dashboard: DashboardPage,
  reportes: ReportesPage,
  productos: ProductosPage,
  inventario: InventarioPage,
  "inventario-iq": InventarioInsightsPage,
  etiquetas: EtiquetasPage,
  importador: ImportadorPage,
  compras: ComprasPage,
  cfdi: CfdiPage,
  usuarios: UsuariosRolesPage,
  seguridad: SeguridadPage,
  configuracion: ConfiguracionPage,
  kioskos: KioskosPage,
  ventas: VentasPage,
  cobros: CobrosPage,
  cxc: CxcPage,
  promociones: PromocionesPage,
  monedero: MonederoPage,
  pedidos: PedidosPage,
  devoluciones: DevolucionesPage,
  envios: EnviosPage,
  resenas: ResenasPage,
  automatizaciones: AutomatizacionesPage,
  preguntas: PreguntasPage,
  contabilidad: ContabilidadPage,
  precios: PreciosPage,
  "clientes-b2b": ClientesB2bPage,
  comisiones: ComisionesPage,
  "portal-b2b": DominioB2bPage,
  suscripcion: SuscripcionPage,
  tienda: TiendaPage,
  ayuda: AyudaPage,
};

export function App() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [seccion, setSeccion] = useState<Seccion>("inicio");
  const [restoring, setRestoring] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [helpPanel, setHelpPanel] = useState<"ayuda" | "manual" | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);

  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<string>).detail;
      if (typeof d === "string") {
        setSeccion(d as Seccion);
        setMenuOpen(false);
      }
    };
    window.addEventListener("gaes-nav", h);
    return () => window.removeEventListener("gaes-nav", h);
  }, []);

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.perm === "public" || puede(item.perm)),
  })).filter((group) => group.items.length > 0);
  const visibleNav = visibleGroups.flatMap((group) => group.items);

  // Si la sección activa no es visible para este rol, caer a la primera permitida.
  useEffect(() => {
    if (!session || visibleNav.length === 0) return;
    if (!visibleNav.some((n) => n.key === seccion)) {
      setSeccion(visibleNav[0].key);
    }
  }, [session, seccion, visibleNav]);

  useEffect(() => {
    if (!loadToken()) {
      setRestoring(false);
      return;
    }
    // El token vive; intentamos usarlo, si falla el primer fetch el usuario re-loguea.
    setSession({ nombre: "Administrador", tenantSlug: "" });
    setRestoring(false);
  }, []);

  function handleLogout() {
    setToken(null);
    setSession(null);
  }

  if (restoring) {
    return <div className="flex h-full items-center justify-center text-slate-400">Cargando…</div>;
  }

  if (!session) {
    if (registrando) return <Signup onVolver={() => setRegistrando(false)} />;
    return <Login onLogin={setSession} onCrearCuenta={() => setRegistrando(true)} />;
  }

  function navegar(s: Seccion) {
    setSeccion(s);
    setMenuOpen(false);
    setUserMenuOpen(false);
  }

  function abrirLink(link: string) {
    if (link.startsWith("/pedidos")) navegar("pedidos");
  }

  function abrirAyuda() {
    navegar("ayuda");
    setUserMenuOpen(false);
    setAccountOpen(false);
  }

  function abrirManual() {
    setHelpPanel("manual");
    setUserMenuOpen(false);
    setAccountOpen(false);
  }

  function abrirPassword() {
    setPasswordOpen(true);
    setUserMenuOpen(false);
    setAccountOpen(false);
  }

  function abrirCuenta() {
    setAccountOpen(true);
    setUserMenuOpen(false);
  }

  const ActivePage = PAGE_COMPONENTS[seccion];

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Barra superior móvil */}
      <header className="flex items-center justify-between bg-slate-900 px-4 py-3 text-slate-100 md:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menú del sistema"
            className="rounded p-2 hover:bg-slate-800"
          >
            <Menu size={22} />
          </button>
          <span className="text-lg font-bold text-brand">GaesSoft</span>
        </div>
        <div className="flex items-center gap-1">
          <NotificacionesBell onOpenLink={abrirLink} />
          <UserMenu
            session={session}
            open={userMenuOpen}
            onToggle={() => setUserMenuOpen((v) => !v)}
            onOpenAccount={abrirCuenta}
            onGoSecurity={() => navegar("seguridad")}
            onChangePassword={abrirPassword}
            onHelp={abrirAyuda}
            onManual={abrirManual}
            onLogout={handleLogout}
            align="right"
          />
        </div>
      </header>

      {/* Overlay al abrir el drawer en móvil */}
      {menuOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 text-slate-100 transition-transform md:static md:z-auto md:w-56 md:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Cerrar menú del sistema"
            className="rounded p-2 text-slate-100 hover:bg-slate-800"
          >
            <X size={22} />
          </button>
          <span className="text-lg font-bold text-brand">GaesSoft</span>
        </div>
        <div className="hidden px-5 py-4 md:block">
          <p className="text-lg font-bold text-brand">GaesSoft</p>
          <p className="text-slate-400 text-xs">Ventas</p>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pt-3 md:pt-0">
          {visibleGroups.map((group) => (
            <section key={group.title} className="mb-4">
              <h2 className="mb-1 rounded-md bg-slate-800/80 px-3 py-1.5 font-semibold text-[11px] text-slate-300 uppercase tracking-wide">
                {group.title}
              </h2>
              {group.items.map((n) => (
                <button
                  key={n.key}
                  type="button"
                  data-tour={`nav-${n.key}`}
                  onClick={() => navegar(n.key)}
                  className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                    seccion === n.key ? "bg-brand text-white" : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  <n.icon size={18} strokeWidth={1.75} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{n.label}</span>
                </button>
              ))}
            </section>
          ))}
        </nav>
        <div className="border-t border-slate-800 px-4 py-3 text-xs">
          <p className="text-slate-500">Sesión activa</p>
          <p className="truncate text-slate-300">{session.nombre}</p>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-slate-100 p-4 md:p-6">
        <div className="mb-4 hidden items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm md:flex">
          <div>
            <p className="font-semibold text-slate-800 text-sm">Panel del negocio</p>
            <p className="text-slate-500 text-xs">{session.tenantSlug || "GaesSoft Ventas"}</p>
          </div>
          <div className="flex items-center gap-2">
            <NotificacionesBell onOpenLink={abrirLink} />
            <UserMenu
              session={session}
              open={userMenuOpen}
              onToggle={() => setUserMenuOpen((v) => !v)}
              onOpenAccount={abrirCuenta}
              onGoSecurity={() => navegar("seguridad")}
              onChangePassword={abrirPassword}
              onHelp={abrirAyuda}
              onManual={abrirManual}
              onLogout={handleLogout}
              align="right"
            />
          </div>
        </div>
        <ActivePage />
      </main>

      <Tour />
      {accountOpen && (
        <AccountPanel
          session={session}
          onClose={() => setAccountOpen(false)}
          onChangePassword={abrirPassword}
          onHelp={abrirAyuda}
          onManual={abrirManual}
          onGoSecurity={() => {
            setAccountOpen(false);
            navegar("seguridad");
          }}
        />
      )}
      {helpPanel && (
        <HelpPanel
          visibleGroups={visibleGroups}
          onClose={() => setHelpPanel(null)}
          onNavigate={(target) => {
            setHelpPanel(null);
            navegar(target);
          }}
        />
      )}
      {passwordOpen && <ChangePasswordModal onClose={() => setPasswordOpen(false)} />}
    </div>
  );
}

function UserMenu({
  session,
  open,
  onToggle,
  onOpenAccount,
  onGoSecurity,
  onChangePassword,
  onHelp,
  onManual,
  onLogout,
  align = "right",
}: {
  session: AdminSession;
  open: boolean;
  onToggle: () => void;
  onOpenAccount: () => void;
  onGoSecurity: () => void;
  onChangePassword: () => void;
  onHelp: () => void;
  onManual: () => void;
  onLogout: () => void;
  align?: "right" | "left";
}) {
  const iniciales =
    session.nombre
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "US";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-10 items-center gap-2 rounded-lg border border-brand/30 bg-white px-2 text-slate-700 shadow-sm ring-2 ring-brand/10 hover:bg-slate-50 md:px-3"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand font-bold text-sm text-white">
          {iniciales}
        </span>
        <span className="hidden max-w-36 truncate font-semibold text-sm md:inline">
          {session.nombre}
        </span>
        <ChevronDown size={16} className="hidden text-slate-400 md:block" />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute top-12 z-50 w-64 rounded-lg border border-slate-200 bg-white py-2 shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <div className="border-slate-100 border-b px-3 pb-2">
            <p className="truncate font-semibold text-slate-800 text-sm">{session.nombre}</p>
            <p className="truncate text-slate-500 text-xs">{session.tenantSlug || "Mi negocio"}</p>
          </div>
          <MenuItem icon={UserCircle} label="Mi cuenta" onClick={onOpenAccount} />
          <MenuItem icon={KeyRound} label="Cambiar contraseña" onClick={onChangePassword} />
          <MenuItem icon={HelpCircle} label="Ayuda completa" onClick={onHelp} />
          <MenuItem icon={BookOpen} label="Manual rápido" onClick={onManual} />
          <MenuItem icon={Languages} label="Idioma: Español" disabled />
          {puede("configuracion.leer") && (
            <MenuItem icon={ShieldCheck} label="Seguridad del sistema" onClick={onGoSecurity} />
          )}
          <div className="mt-1 border-slate-100 border-t pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={onLogout}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 text-sm hover:bg-red-50"
            >
              Salir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountPanel({
  session,
  onClose,
  onChangePassword,
  onHelp,
  onManual,
  onGoSecurity,
}: {
  session: AdminSession;
  onClose: () => void;
  onChangePassword: () => void;
  onHelp: () => void;
  onManual: () => void;
  onGoSecurity: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <aside className="h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-slate-200 border-b bg-white px-5 py-4">
          <div>
            <h2 className="font-bold text-slate-800 text-xl">Mi cuenta</h2>
            <p className="text-slate-500 text-sm">Preferencias y acceso de usuario.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-5 p-5">
          <section className="rounded-lg border border-slate-200 p-4">
            <p className="text-slate-500 text-xs uppercase tracking-wide">Usuario</p>
            <p className="mt-1 truncate font-semibold text-slate-800">{session.nombre}</p>
            <p className="truncate text-slate-500 text-sm">{session.tenantSlug || "Mi negocio"}</p>
          </section>

          <section className="space-y-2">
            <AccountAction icon={KeyRound} label="Cambiar contraseña" onClick={onChangePassword} />
            <AccountAction icon={HelpCircle} label="Ayuda completa" onClick={onHelp} />
            <AccountAction icon={BookOpen} label="Manual rápido" onClick={onManual} />
            <AccountAction icon={Languages} label="Idioma: Español" disabled />
            {puede("configuracion.leer") && (
              <AccountAction
                icon={ShieldCheck}
                label="Seguridad del sistema"
                onClick={onGoSecurity}
              />
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

function AccountAction({
  icon: Icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-left text-slate-700 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
    >
      <Icon size={18} />
      <span className="font-medium">{label}</span>
    </button>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
    >
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );
}

function HelpPanel({
  visibleGroups,
  onClose,
  onNavigate,
}: {
  visibleGroups: NavGroup[];
  onClose: () => void;
  onNavigate: (target: Seccion) => void;
}) {
  const manualChapters = [
    {
      title: "Cómo usar el sistema",
      body: [
        "El menú lateral izquierdo es para módulos de trabajo: ventas, inventario, tienda, clientes y administración.",
        "El avatar de la esquina superior derecha es solo para tu usuario: mi cuenta, contraseña, ayuda, manual, idioma y salir.",
        "Cada usuario ve únicamente las secciones permitidas por su rol. Si una opción no aparece, normalmente es por permisos.",
      ],
      targets: ["inicio", "ayuda"] as Seccion[],
    },
    {
      title: "Antes de empezar a vender",
      body: [
        "Entra a Productos y da de alta lo que vendes. Lo mínimo para operar es nombre y precio.",
        "Si manejas existencias, entra a Inventario y registra entradas para que el stock sea correcto.",
        "Si tienes muchos productos, usa Carga masiva para subirlos desde archivo en lugar de capturarlos uno por uno.",
        "Revisa Configuración, Seguridad y Usuarios si quieres definir reglas, accesos y protección de cuenta.",
      ],
      targets: ["productos", "inventario", "importador", "usuarios", "configuracion"] as Seccion[],
    },
    {
      title: "Operación diaria",
      body: [
        "Al iniciar el día revisa Resumen para ver ventas, actividad y pendientes.",
        "Consulta Ventas para revisar tickets ya generados; el cobro en mostrador se realiza desde el POS.",
        "Usa Cobros / Links cuando quieras cobrar a distancia y enviar un link al cliente.",
        "Si vendes a crédito, revisa Cuentas por cobrar y registra abonos conforme te paguen.",
        "Si un cliente regresa mercancía, usa Devoluciones para dejar el movimiento registrado.",
      ],
      targets: ["dashboard", "ventas", "cobros", "cxc", "devoluciones"] as Seccion[],
    },
    {
      title: "Inventario y compras",
      body: [
        "Productos define el catálogo comercial: nombre, precio, códigos y datos para vender.",
        "Inventario controla cantidades disponibles por producto. Cada venta descuenta stock automáticamente.",
        "Compras sirve para pedir mercancía al proveedor. El inventario sube cuando marcas la orden como recibida.",
        "Etiquetas y códigos te ayuda a imprimir etiquetas para escanear productos en el POS.",
        "Inteligencia de inventario sirve para detectar qué reponer y qué productos se están quedando parados.",
      ],
      targets: ["productos", "inventario", "compras", "etiquetas", "inventario-iq"] as Seccion[],
    },
    {
      title: "Tienda online",
      body: [
        "Primero configura Tienda online con nombre, datos visibles, productos publicados y reglas básicas.",
        "Los pedidos que lleguen desde internet se atienden en Pedidos online.",
        "Configura Envíos para definir zonas, tarifas y condiciones de entrega.",
        "Preguntas y Reseñas sirven para atender dudas de compradores y moderar opiniones visibles en la tienda.",
      ],
      targets: ["tienda", "pedidos", "envios", "preguntas", "resenas"] as Seccion[],
    },
    {
      title: "Clientes, precios y marketing",
      body: [
        "Clientes mayoreo guarda clientes B2B con datos fiscales, crédito y condiciones comerciales.",
        "Listas de precios define precios especiales por cliente o tipo de venta.",
        "Promociones configura descuentos automáticos para POS y tienda cuando aplique.",
        "Monedero / Gift cards ayuda a generar lealtad y saldos a favor.",
        "Comisiones calcula cuánto gana cada vendedor según las reglas que definas.",
        "Automatizaciones envía mensajes o campañas cuando ocurre un evento del negocio.",
      ],
      targets: [
        "clientes-b2b",
        "precios",
        "promociones",
        "monedero",
        "comisiones",
        "automatizaciones",
      ] as Seccion[],
    },
    {
      title: "Administración",
      body: [
        "Facturación emite o consulta CFDI relacionados con ventas.",
        "Contabilidad concentra facturas recibidas y clasificación contable para facilitar revisión.",
        "Usuarios y permisos define quién entra, qué rol tiene y qué puede hacer.",
        "Seguridad protege cuentas con 2FA y passkeys cuando el rol lo permite.",
        "Mi suscripción muestra plan, pagos y conexión para aceptar cobros con tarjeta.",
      ],
      targets: ["cfdi", "contabilidad", "usuarios", "seguridad", "suscripcion"] as Seccion[],
    },
  ];
  const visibleByKey = new Map(
    visibleGroups.flatMap((group) => group.items.map((item) => [item.key, item] as const)),
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <aside className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-slate-200 border-b bg-white px-5 py-4">
          <div>
            <h2 className="font-bold text-slate-800 text-xl">Manual de uso</h2>
            <p className="text-slate-500 text-sm">
              Guia practica para operar el sistema por areas.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-5 p-5">
          <button
            type="button"
            onClick={() => onNavigate("ayuda")}
            className="flex w-full items-center gap-3 rounded-lg border border-brand/30 bg-brand/5 px-4 py-3 text-left text-brand text-sm hover:bg-brand/10"
          >
            <HelpCircle size={18} />
            <span className="font-semibold">
              Abrir ayuda completa con buscador, preguntas y recorridos paso a paso
            </span>
          </button>

          {manualChapters.map((chapter) => {
            const targets = chapter.targets
              .map((target) => visibleByKey.get(target))
              .filter((item): item is NavItem => Boolean(item));
            return (
              <section key={chapter.title} className="rounded-lg border border-slate-200 p-4">
                <h3 className="font-bold text-slate-800">{chapter.title}</h3>
                <ol className="mt-3 space-y-2">
                  {chapter.body.map((step, index) => (
                    <li key={step} className="flex gap-2 text-slate-600 text-sm leading-6">
                      <span className="font-semibold text-brand">{index + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                {targets.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {targets.map((item) => (
                      <button
                        type="button"
                        key={item.key}
                        onClick={() => onNavigate(item.key)}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-600 text-xs hover:bg-slate-50"
                      >
                        <item.icon size={15} className="shrink-0" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          <section className="rounded-lg border border-slate-200 p-4">
            <h3 className="font-bold text-slate-800">Referencia rapida de tu menu</h3>
            <p className="mt-2 text-slate-500 text-sm">
              Estas son las secciones disponibles para tu usuario en este momento.
            </p>
            <div className="mt-4 space-y-3">
              {visibleGroups.map((group) => (
                <div key={group.title}>
                  <h4 className="mb-2 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                    {group.title}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {group.items.map((item) => (
                      <button
                        type="button"
                        key={item.key}
                        onClick={() => onNavigate(item.key)}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-slate-600 text-xs hover:bg-slate-50"
                      >
                        <item.icon size={15} className="shrink-0" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-bold text-slate-800">Diferencia entre Ayuda y Manual</h3>
            <div className="mt-3 space-y-2 text-slate-600 text-sm leading-6">
              <p>
                <b>Manual:</b> explica el flujo general de trabajo y como se conectan los modulos.
              </p>
              <p>
                <b>Ayuda completa:</b> sirve cuando buscas una funcion especifica, una pregunta o un
                recorrido guiado dentro de una pantalla.
              </p>
              <p>
                <b>Mi cuenta:</b> concentra acciones personales como cambiar contraseña, ayuda,
                manual, idioma y salir.
              </p>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (newPassword !== confirmPassword) {
      setError("La confirmación no coincide.");
      return;
    }
    setBusy(true);
    try {
      await cambiarMiPassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={guardar} className="w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg text-slate-800">Cambiar contraseña</h2>
            <p className="text-slate-500 text-sm">Actualiza tu acceso de usuario.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        <label className="mb-3 block">
          <span className="mb-1 block font-medium text-slate-700 text-sm">Contraseña actual</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
            required
          />
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block font-medium text-slate-700 text-sm">Nueva contraseña</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
            required
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block font-medium text-slate-700 text-sm">
            Confirmar contraseña
          </span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={8}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
            required
          />
        </label>
        {error && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-red-700 text-sm">{error}</p>
        )}
        {saved && (
          <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700 text-sm">
            Contraseña actualizada.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-slate-700 text-sm hover:bg-slate-50"
          >
            Cerrar
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-brand px-4 py-2 font-semibold text-sm text-white disabled:opacity-60"
          >
            {busy ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
