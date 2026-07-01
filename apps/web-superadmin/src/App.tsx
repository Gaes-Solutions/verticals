import { useEffect, useState } from "react";
import { Login } from "./components/Login.js";
import { esSuperadmin, loadToken, setToken } from "./lib/api.js";
import { AuditPage } from "./pages/AuditPage.js";
import { CatalogoPage } from "./pages/CatalogoPage.js";
import { ClientesPage } from "./pages/ClientesPage.js";
import { CobranzaPage } from "./pages/CobranzaPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { EquipoPage } from "./pages/EquipoPage.js";
import { FacturasPage } from "./pages/FacturasPage.js";
import { ObservabilidadPage } from "./pages/ObservabilidadPage.js";
import { PartnersPage } from "./pages/PartnersPage.js";
import { RolesPredefinidosPage } from "./pages/RolesPredefinidosPage.js";
import { SuscripcionesPage } from "./pages/SuscripcionesPage.js";
import { UsoHoyPage } from "./pages/UsoHoyPage.js";

export interface AdminSession {
  nombre: string;
  email: string;
  role: string;
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
  | "audit"
  | "equipo";

interface NavItem {
  key: Seccion;
  label: string;
  icon: string;
  soloSuper?: boolean;
}

const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: "📊" },
  { key: "clientes", label: "Clientes", icon: "🏪" },
  { key: "roles", label: "Roles predefinidos", icon: "🧩" },
  { key: "uso", label: "Uso en vivo", icon: "📈" },
  { key: "cobranza", label: "Cobranza", icon: "💳" },
  { key: "facturas", label: "Facturas", icon: "🧾" },
  { key: "suscripciones", label: "Suscripciones", icon: "🔁" },
  { key: "partners", label: "Partners", icon: "🤝" },
  { key: "catalogo", label: "Planes y cupones", icon: "🏷️" },
  { key: "observabilidad", label: "Observabilidad", icon: "🩺" },
  { key: "audit", label: "Auditoría", icon: "📜" },
  { key: "equipo", label: "Equipo", icon: "👥", soloSuper: true },
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
    setSession({
      nombre: "Admin",
      email: "",
      role: localStorage.getItem("gaespos_super_role") ?? "",
    });
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

  const visibles = NAV.filter((n) => !n.soloSuper || esSuperadmin());

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
                seccion === n.key ? "bg-brand text-white" : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <span>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="border-slate-800 border-t px-4 py-3 text-xs">
          <p className="mb-2 text-slate-400">
            {session.email || session.nombre}
            <span className="ml-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
              {session.role}
            </span>
          </p>
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
        {seccion === "dashboard" && <DashboardPage />}
        {seccion === "clientes" && <ClientesPage />}
        {seccion === "roles" && <RolesPredefinidosPage />}
        {seccion === "uso" && <UsoHoyPage />}
        {seccion === "cobranza" && <CobranzaPage />}
        {seccion === "facturas" && <FacturasPage />}
        {seccion === "suscripciones" && <SuscripcionesPage />}
        {seccion === "partners" && <PartnersPage />}
        {seccion === "catalogo" && <CatalogoPage />}
        {seccion === "observabilidad" && <ObservabilidadPage />}
        {seccion === "audit" && <AuditPage />}
        {seccion === "equipo" && esSuperadmin() && <EquipoPage />}
      </main>
    </div>
  );
}
