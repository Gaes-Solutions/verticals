import type { PlatformPermission } from "@gaespos/permissions";
import { useEffect, useState } from "react";
import { Login } from "./components/Login.js";
import { ScreenBoundary } from "./components/ScreenBoundary.js";
import {
  StorageGate,
  esErrorAlmacenamiento,
  useStorageRecovery,
} from "./components/StorageGate.js";
import { api, loadToken, setPlatformAccess, setToken } from "./lib/api.js";
import { AuditPage } from "./pages/AuditPage.js";
import { CatalogoPage } from "./pages/CatalogoPage.js";
import { ClientesPage } from "./pages/ClientesPage.js";
import { CobranzaPage } from "./pages/CobranzaPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { EquipoPage } from "./pages/EquipoPage.js";
import { FacturasPage } from "./pages/FacturasPage.js";
import { MarketplacePage } from "./pages/MarketplacePage.js";
import { ObservabilidadPage } from "./pages/ObservabilidadPage.js";
import { PartnersPage } from "./pages/PartnersPage.js";
import { RolesPredefinidosPage } from "./pages/RolesPredefinidosPage.js";
import { SuscripcionesPage } from "./pages/SuscripcionesPage.js";
import { TicketsPage } from "./pages/TicketsPage.js";
import { UsoHoyPage } from "./pages/UsoHoyPage.js";

export interface AdminSession {
  nombre: string;
  email: string;
  role: string;
  permissions?: string[];
}

type Seccion =
  | "dashboard"
  | "clientes"
  | "roles"
  | "uso"
  | "cobranza"
  | "facturas"
  | "suscripciones"
  | "partners"
  | "catalogo"
  | "observabilidad"
  | "soporte"
  | "marketplace"
  | "audit"
  | "equipo";

interface NavItem {
  key: Seccion;
  label: string;
  icon: string;
  soloSuper?: boolean;
  permission?: PlatformPermission;
}

const NAV: NavItem[] = [
  { permission: "metrics.read", key: "dashboard", label: "Dashboard", icon: "📊" },
  { permission: "tenants.read", key: "clientes", label: "Clientes", icon: "🏪" },
  { permission: "roles.read", key: "roles", label: "Roles predefinidos", icon: "🧩" },
  { permission: "usage.read", key: "uso", label: "Uso en vivo", icon: "📈" },
  { permission: "billing.read", key: "cobranza", label: "Cobranza", icon: "💳" },
  { permission: "billing.read", key: "facturas", label: "Facturas", icon: "🧾" },
  { permission: "billing.read", key: "suscripciones", label: "Suscripciones", icon: "🔁" },
  { permission: "partners.read", key: "partners", label: "Partners", icon: "🤝" },
  { permission: "catalog.read", key: "catalogo", label: "Planes y cupones", icon: "🏷️" },
  { permission: "observability.read", key: "observabilidad", label: "Observabilidad", icon: "🩺" },
  { permission: "tickets.read", key: "soporte", label: "Soporte", icon: "🎫" },
  { permission: "marketplace.read", key: "marketplace", label: "Marketplace", icon: "🩺" },
  { key: "audit", label: "Auditoría", icon: "📜", soloSuper: true },
  { key: "equipo", label: "Equipo", icon: "👥", soloSuper: true },
];

export function App() {
  return (
    <StorageGate>
      <SessionApp />
    </StorageGate>
  );
}

function SessionApp() {
  const storageUnavailable = useStorageRecovery();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [seccion, setSeccion] = useState<Seccion>("dashboard");
  const [restoring, setRestoring] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let busy = false;
    async function refresh() {
      let token: string | null;
      try {
        token = loadToken();
      } catch {
        storageUnavailable();
        return;
      }
      if (!token) {
        if (alive) {
          setSession(null);
          setRestoring(false);
        }
        return;
      }
      if (busy) return;
      busy = true;
      try {
        const me = await api<{ name: string; email: string; role: string; permissions: string[] }>(
          "/auth/me",
        );
        if (!alive || loadToken() !== token) return;
        setPlatformAccess(me.role, me.permissions);
        setSession({
          nombre: me.name,
          email: me.email,
          role: me.role,
          permissions: me.permissions,
        });
      } catch (error) {
        if (esErrorAlmacenamiento(error)) {
          if (alive) storageUnavailable();
          return;
        }
        // A failed restore never renders a cached administrator's permissions.
        try {
          if (alive && loadToken() === token) setSession(null);
        } catch {
          if (alive) storageUnavailable();
        }
      } finally {
        busy = false;
        if (alive) setRestoring(false);
      }
    }
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30000);
    const focus = () => void refresh();
    const storage = (event: StorageEvent) => {
      if (event.key === "gaespos_super_token") {
        setToken(event.newValue);
        void refresh();
      }
    };
    window.addEventListener("storage", storage);
    window.addEventListener("focus", focus);
    window.addEventListener("platform-access-refresh", focus);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", focus);
      window.removeEventListener("platform-access-refresh", focus);
    };
  }, [storageUnavailable]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await api("/auth/logout", { method: "POST", auth: false });
      setToken(null);
      setSession(null);
    } catch {
      setLogoutError("No se pudo cerrar la sesión. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setLoggingOut(false);
    }
  }

  if (restoring) {
    return <div className="flex h-full items-center justify-center text-slate-400">Cargando…</div>;
  }
  if (!session)
    return (
      <Login
        onLogin={(value) => {
          setSession(value);
          setSeccion(
            value.role === "support"
              ? "soporte"
              : value.role === "billing"
                ? "cobranza"
                : "dashboard",
          );
        }}
      />
    );

  function navegar(s: Seccion) {
    setSeccion(s);
    setMenuOpen(false);
  }

  const visibles = NAV.filter(
    (n) =>
      session.role === "superadmin" ||
      (!n.soloSuper && !!n.permission && session.permissions?.includes(n.permission)),
  );
  const defaultSection: Seccion =
    session.role === "support" ? "soporte" : session.role === "billing" ? "cobranza" : "dashboard";
  const activeSection = visibles.some((n) => n.key === seccion)
    ? seccion
    : (visibles.find((n) => n.key === defaultSection)?.key ?? visibles[0]?.key);

  return (
    <div className="flex h-full flex-col md:flex-row">
      <header className="flex items-center justify-between bg-slate-900 px-4 py-3 text-slate-100 md:hidden">
        <span className="font-bold text-brand text-lg">GaesSoft</span>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menú"
          className="rounded p-2 hover:bg-slate-800"
        >
          ☰
        </button>
      </header>

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
        <div className="hidden px-5 py-4 md:block">
          <p className="font-bold text-brand text-lg">GaesSoft</p>
          <p className="text-slate-400 text-xs">Plataforma</p>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pt-3 md:pt-0">
          {visibles.map((n) => (
            <button
              key={n.key}
              type="button"
              onClick={() => navegar(n.key)}
              className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                activeSection === n.key
                  ? "bg-brand text-white"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <span>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="border-slate-800 border-t px-4 py-3 text-xs">
          <p className="mb-2 break-all text-slate-400">
            {session.email || session.nombre}
            <span className="ml-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
              {session.role}
            </span>
          </p>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="rounded bg-slate-800 px-3 py-1 text-slate-200 hover:bg-slate-700"
          >
            {loggingOut ? "Saliendo…" : "Salir"}
          </button>
          {logoutError && (
            <p role="alert" className="mt-2 text-red-300">
              {logoutError}
            </p>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto bg-slate-100 p-4 md:p-6">
        <ScreenBoundary key={activeSection}>
          {activeSection === "dashboard" && <DashboardPage />}
          {activeSection === "clientes" && <ClientesPage />}
          {activeSection === "roles" && <RolesPredefinidosPage />}
          {activeSection === "uso" && <UsoHoyPage />}
          {activeSection === "cobranza" && <CobranzaPage />}
          {activeSection === "facturas" && <FacturasPage />}
          {activeSection === "suscripciones" && <SuscripcionesPage />}
          {activeSection === "partners" && <PartnersPage />}
          {activeSection === "catalogo" && <CatalogoPage />}
          {activeSection === "observabilidad" && <ObservabilidadPage />}
          {activeSection === "soporte" && <TicketsPage />}
          {activeSection === "marketplace" && <MarketplacePage />}
          {activeSection === "audit" && <AuditPage />}
          {activeSection === "equipo" && session.role === "superadmin" && <EquipoPage />}
        </ScreenBoundary>
      </main>
    </div>
  );
}
