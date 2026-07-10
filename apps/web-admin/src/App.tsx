import {
  BadgePercent,
  BarChart3,
  CreditCard,
  FileText,
  HandCoins,
  Link2,
  type LucideIcon,
  Menu,
  MessageCircleQuestion,
  Package,
  PackageCheck,
  QrCode,
  Receipt,
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
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { type ComponentType, useEffect, useState } from "react";
import { Login } from "./components/Login.js";
import { NotificacionesBell } from "./components/NotificacionesBell.js";
import { Signup } from "./components/Signup.js";
import { loadToken, puede, setToken } from "./lib/api.js";
import { AutomatizacionesPage } from "./pages/AutomatizacionesPage.js";
import { CfdiPage } from "./pages/CfdiPage.js";
import { CobrosPage } from "./pages/CobrosPage.js";
import { ComprasPage } from "./pages/ComprasPage.js";
import { ContabilidadPage } from "./pages/ContabilidadPage.js";
import { ConfiguracionPage } from "./pages/ConfiguracionPage.js";
import { CxcPage } from "./pages/CxcPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { DevolucionesPage } from "./pages/DevolucionesPage.js";
import { EnviosPage } from "./pages/EnviosPage.js";
import { EtiquetasPage } from "./pages/EtiquetasPage.js";
import { ImportadorPage } from "./pages/ImportadorPage.js";
import { InventarioInsightsPage } from "./pages/InventarioInsightsPage.js";
import { InventarioPage } from "./pages/InventarioPage.js";
import { MonederoPage } from "./pages/MonederoPage.js";
import { PedidosPage } from "./pages/PedidosPage.js";
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
  | "usuarios"
  | "seguridad"
  | "configuracion"
  | "contabilidad"
  | "suscripcion"
  | "tienda";

// `perm` = permiso de lectura que exige la ruta de ese módulo. La UI oculta el
// item si el usuario no lo tiene (el dueño con "*" ve todo). Defensa en
// profundidad: el backend revalida igual con requirePerm.
const NAV: { key: Seccion; label: string; icon: LucideIcon; perm: string }[] = [
  { key: "dashboard", label: "Resumen", icon: BarChart3, perm: "reportes.ventas" },
  { key: "reportes", label: "Reportes", icon: BarChart3, perm: "reportes.ventas" },
  { key: "productos", label: "Productos", icon: Package, perm: "productos.leer" },
  { key: "inventario", label: "Inventario", icon: Tags, perm: "inventario.leer" },
  {
    key: "inventario-iq",
    label: "Inteligencia inventario",
    icon: TrendingUp,
    perm: "reportes.ventas",
  },
  { key: "etiquetas", label: "Etiquetas y códigos", icon: QrCode, perm: "productos.leer" },
  { key: "importador", label: "Carga masiva", icon: Upload, perm: "productos.bulk_import" },
  { key: "compras", label: "Compras (OC)", icon: ShoppingBag, perm: "compras_oc.leer" },
  { key: "ventas", label: "Ventas", icon: Receipt, perm: "ventas.leer" },
  { key: "cobros", label: "Cobros / Links", icon: Link2, perm: "ventas.crear" },
  { key: "cxc", label: "Cuentas por cobrar", icon: HandCoins, perm: "cxc.leer" },
  { key: "promociones", label: "Promociones", icon: BadgePercent, perm: "promociones.gestionar" },
  { key: "monedero", label: "Monedero / Gift cards", icon: Wallet, perm: "ventas.crear" },
  { key: "pedidos", label: "Pedidos online", icon: PackageCheck, perm: "ecommerce.pedidos_leer" },
  { key: "devoluciones", label: "Devoluciones", icon: RotateCcw, perm: "ventas.leer" },
  { key: "envios", label: "Envíos", icon: Truck, perm: "ecommerce.envios_gestionar" },
  { key: "resenas", label: "Reseñas", icon: Star, perm: "ecommerce.resenas_moderar" },
  { key: "automatizaciones", label: "Automatizaciones", icon: Zap, perm: "plantillas.gestionar" },
  {
    key: "preguntas",
    label: "Preguntas",
    icon: MessageCircleQuestion,
    perm: "ecommerce.resenas_moderar",
  },
  { key: "cfdi", label: "Facturación", icon: FileText, perm: "cfdi.leer" },
  { key: "usuarios", label: "Usuarios y permisos", icon: Users, perm: "usuarios.leer" },
  { key: "seguridad", label: "Seguridad", icon: ShieldCheck, perm: "configuracion.leer" },
  { key: "configuracion", label: "Configuración", icon: Settings, perm: "configuracion.leer" },
  { key: "contabilidad", label: "Contabilidad", icon: FileText, perm: "cfdis_recibidos.leer" },
  { key: "suscripcion", label: "Mi suscripción", icon: CreditCard, perm: "*" },
  { key: "tienda", label: "Tienda online", icon: ShoppingCart, perm: "ecommerce.configurar" },
];

const PAGE_COMPONENTS: Record<Seccion, ComponentType> = {
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
  suscripcion: SuscripcionPage,
  tienda: TiendaPage,
};

export function App() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [seccion, setSeccion] = useState<Seccion>("dashboard");
  const [restoring, setRestoring] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [registrando, setRegistrando] = useState(false);

  const visibleNav = NAV.filter((n) => puede(n.perm));

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
  }

  function abrirLink(link: string) {
    if (link.startsWith("/pedidos")) navegar("pedidos");
  }

  const ActivePage = PAGE_COMPONENTS[seccion];

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Barra superior móvil */}
      <header className="flex items-center justify-between bg-slate-900 px-4 py-3 text-slate-100 md:hidden">
        <span className="text-lg font-bold text-brand">GaesSoft</span>
        <div className="flex items-center gap-1">
          <NotificacionesBell onOpenLink={abrirLink} />
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menú"
            className="rounded p-2 hover:bg-slate-800"
          >
            <Menu size={22} />
          </button>
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
        <div className="hidden px-5 py-4 text-lg font-bold text-brand md:block">GaesSoft</div>
        <nav className="flex-1 overflow-y-auto px-2 pt-3 md:pt-0">
          {visibleNav.map((n) => (
            <button
              key={n.key}
              type="button"
              onClick={() => navegar(n.key)}
              className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                seccion === n.key ? "bg-brand text-white" : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <n.icon size={18} strokeWidth={1.75} className="shrink-0" />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-slate-800 px-4 py-3 text-xs">
          <p className="mb-2 text-slate-400">{session.nombre}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded bg-slate-800 px-3 py-1 text-slate-200 hover:bg-slate-700"
          >
            Salir
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-slate-100 p-4 md:p-6">
        <div className="mb-4 hidden justify-end md:flex">
          <NotificacionesBell onOpenLink={abrirLink} />
        </div>
        <ActivePage />
      </main>
    </div>
  );
}
