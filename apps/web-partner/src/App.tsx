import { useEffect, useState } from "react";
import { Login } from "./components/Login.js";
import { type PerfilPartner, api, loadToken, setToken } from "./lib/api.js";
import { ComisionesPage } from "./pages/ComisionesPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { PayoutsPage } from "./pages/PayoutsPage.js";
import { ReferidosPage } from "./pages/ReferidosPage.js";

type Seccion = "dashboard" | "referidos" | "comisiones" | "payouts";

const NAV: Array<{ key: Seccion; label: string; icon: string }> = [
  { key: "dashboard", label: "Mi programa", icon: "🤝" },
  { key: "referidos", label: "Referidos", icon: "🏪" },
  { key: "comisiones", label: "Comisiones", icon: "💰" },
  { key: "payouts", label: "Pagos", icon: "🏦" },
];

const NIVEL_LABEL: Record<string, string> = {
  bronze: "🥉 Bronze",
  silver: "🥈 Silver",
  gold: "🥇 Gold",
  diamond: "💎 Diamond",
};

export function App() {
  const [perfil, setPerfil] = useState<PerfilPartner | null>(null);
  const [seccion, setSeccion] = useState<Seccion>("dashboard");
  const [restoring, setRestoring] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loadToken()) {
      setRestoring(false);
      return;
    }
    api<PerfilPartner>("/partner/me")
      .then(setPerfil)
      .catch(() => setToken(null))
      .finally(() => setRestoring(false));
  }, []);

  if (restoring) {
    return <div className="flex h-full items-center justify-center text-slate-400">Cargando…</div>;
  }
  if (!perfil) return <Login onLogin={setPerfil} />;

  function navegar(s: Seccion) {
    setSeccion(s);
    setMenuOpen(false);
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      <header className="flex items-center justify-between bg-slate-900 px-4 py-3 text-slate-100 md:hidden">
        <span className="font-bold text-brand text-lg">GaesSoft Partners</span>
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
          <p className="font-bold text-brand text-lg">GaesSoft Partners</p>
          <p className="text-slate-400 text-xs">{NIVEL_LABEL[perfil.nivel] ?? perfil.nivel}</p>
        </div>
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
        <div className="border-slate-800 border-t px-4 py-3 text-xs">
          <p className="mb-2 truncate text-slate-400">{perfil.razonSocial}</p>
          <button
            type="button"
            onClick={() => {
              setToken(null);
              setPerfil(null);
            }}
            className="rounded bg-slate-800 px-3 py-1 text-slate-200 hover:bg-slate-700"
          >
            Salir
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-slate-100 p-4 md:p-6">
        {seccion === "dashboard" && <DashboardPage perfil={perfil} onPerfil={setPerfil} />}
        {seccion === "referidos" && <ReferidosPage />}
        {seccion === "comisiones" && <ComisionesPage />}
        {seccion === "payouts" && <PayoutsPage />}
      </main>
    </div>
  );
}
