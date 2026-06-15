import { useEffect, useState } from "react";
import { Login } from "./components/Login.js";
import { NotificacionesBell } from "./components/NotificacionesBell.js";
import { loadToken, setToken } from "./lib/api.js";
import { CfdiPage } from "./pages/CfdiPage.js";
import { ComprasPage } from "./pages/ComprasPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { DevolucionesPage } from "./pages/DevolucionesPage.js";
import { EnviosPage } from "./pages/EnviosPage.js";
import { ImportadorPage } from "./pages/ImportadorPage.js";
import { InventarioPage } from "./pages/InventarioPage.js";
import { PedidosPage } from "./pages/PedidosPage.js";
import { PreguntasPage } from "./pages/PreguntasPage.js";
import { ProductosPage } from "./pages/ProductosPage.js";
import { ReportesPage } from "./pages/ReportesPage.js";
import { ResenasPage } from "./pages/ResenasPage.js";
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
  | "ventas"
  | "pedidos"
  | "devoluciones"
  | "preguntas"
  | "envios"
  | "resenas"
  | "importador"
  | "compras"
  | "cfdi"
  | "usuarios"
  | "tienda";

const NAV: { key: Seccion; label: string; icon: string }[] = [
  { key: "dashboard", label: "Resumen", icon: "📊" },
  { key: "reportes", label: "Reportes", icon: "📈" },
  { key: "productos", label: "Productos", icon: "📦" },
  { key: "inventario", label: "Inventario", icon: "🏷️" },
  { key: "importador", label: "Carga masiva", icon: "⬆️" },
  { key: "compras", label: "Compras (OC)", icon: "🧾" },
  { key: "ventas", label: "Ventas", icon: "🧾" },
  { key: "pedidos", label: "Pedidos online", icon: "📬" },
  { key: "devoluciones", label: "Devoluciones", icon: "↩️" },
  { key: "envios", label: "Envíos", icon: "🚚" },
  { key: "resenas", label: "Reseñas", icon: "⭐" },
  { key: "preguntas", label: "Preguntas", icon: "❓" },
  { key: "cfdi", label: "Facturación", icon: "🧾" },
  { key: "usuarios", label: "Usuarios y permisos", icon: "👥" },
  { key: "tienda", label: "Tienda online", icon: "🛒" },
];

export function App() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [seccion, setSeccion] = useState<Seccion>("dashboard");
  const [restoring, setRestoring] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

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

  if (!session) return <Login onLogin={setSession} />;

  function navegar(s: Seccion) {
    setSeccion(s);
    setMenuOpen(false);
  }

  function abrirLink(link: string) {
    if (link.startsWith("/pedidos")) navegar("pedidos");
  }

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
            ☰
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
          {NAV.map((n) => (
            <button
              key={n.key}
              type="button"
              onClick={() => navegar(n.key)}
              className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                seccion === n.key ? "bg-brand text-white" : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <span>{n.icon}</span>
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
        {seccion === "dashboard" && <DashboardPage />}
        {seccion === "reportes" && <ReportesPage />}
        {seccion === "productos" && <ProductosPage />}
        {seccion === "inventario" && <InventarioPage />}
        {seccion === "importador" && <ImportadorPage />}
        {seccion === "compras" && <ComprasPage />}
        {seccion === "cfdi" && <CfdiPage />}
        {seccion === "usuarios" && <UsuariosRolesPage />}
        {seccion === "ventas" && <VentasPage />}
        {seccion === "pedidos" && <PedidosPage />}
        {seccion === "devoluciones" && <DevolucionesPage />}
        {seccion === "envios" && <EnviosPage />}
        {seccion === "resenas" && <ResenasPage />}
        {seccion === "preguntas" && <PreguntasPage />}
        {seccion === "tienda" && <TiendaPage />}
      </main>
    </div>
  );
}
