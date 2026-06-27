import { CalendarDays, FolderHeart, type LucideIcon, Menu, Stethoscope } from "lucide-react";
import { type ComponentType, useEffect, useState } from "react";
import { Login } from "./components/Login.js";
import { loadToken, puede, setToken } from "./lib/api.js";
import { AgendaPage } from "./pages/AgendaPage.js";
import { ExpedientesPage } from "./pages/ExpedientesPage.js";

export interface Session {
  nombre: string;
}

type Seccion = "agenda" | "expedientes";

// `perm` = permiso de lectura que exige la pantalla. La UI oculta el item si el
// rol no lo tiene (el dueño con "*" ve todo). El backend revalida igual.
const NAV: { key: Seccion; label: string; icon: LucideIcon; perm: string }[] = [
  { key: "agenda", label: "Agenda del día", icon: CalendarDays, perm: "citas.leer" },
  { key: "expedientes", label: "Expedientes", icon: FolderHeart, perm: "mascotas.leer" },
];

const PAGE_COMPONENTS: Record<Seccion, ComponentType> = {
  agenda: AgendaPage,
  expedientes: ExpedientesPage,
};

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [seccion, setSeccion] = useState<Seccion>("agenda");
  const [restoring, setRestoring] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const visibleNav = NAV.filter((n) => puede(n.perm));

  useEffect(() => {
    if (!session || visibleNav.length === 0) return;
    if (!visibleNav.some((n) => n.key === seccion)) {
      const primera = visibleNav[0];
      if (primera) setSeccion(primera.key);
    }
  }, [session, seccion, visibleNav]);

  useEffect(() => {
    if (!loadToken()) {
      setRestoring(false);
      return;
    }
    setSession({ nombre: "Profesional" });
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

  const ActivePage = PAGE_COMPONENTS[seccion];

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Barra superior móvil */}
      <header className="flex items-center justify-between bg-slate-900 px-4 py-3 text-slate-100 md:hidden">
        <span className="flex items-center gap-2 font-bold text-brand">
          <Stethoscope size={20} /> GaesSoft Clínica
        </span>
        <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="Menú">
          <Menu size={22} />
        </button>
      </header>

      {/* Overlay móvil */}
      {menuOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
        />
      )}

      {/* Sidebar / drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-slate-900 text-slate-100 transition-transform md:static md:z-0 md:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="hidden items-center gap-2 px-5 py-4 font-bold text-brand text-lg md:flex">
          <Stethoscope size={22} /> GaesSoft Clínica
        </div>
        <nav className="flex flex-col gap-1 px-3 py-2">
          {visibleNav.map((n) => {
            const Icon = n.icon;
            const activo = n.key === seccion;
            return (
              <button
                key={n.key}
                type="button"
                onClick={() => navegar(n.key)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                  activo ? "bg-brand text-white" : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <Icon size={18} /> {n.label}
              </button>
            );
          })}
        </nav>
        <div className="absolute inset-x-0 bottom-0 border-slate-800 border-t p-3">
          <p className="mb-2 px-2 text-slate-400 text-xs">{session.nombre}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded-lg px-3 py-2 text-left text-slate-300 text-sm hover:bg-slate-800"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-slate-100 p-4 md:p-6">
        <ActivePage />
      </main>
    </div>
  );
}
