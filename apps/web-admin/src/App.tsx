import { useEffect, useState } from "react";
import { Login } from "./components/Login.js";
import { loadToken, setToken } from "./lib/api.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { InventarioPage } from "./pages/InventarioPage.js";
import { ProductosPage } from "./pages/ProductosPage.js";
import { TiendaPage } from "./pages/TiendaPage.js";
import { VentasPage } from "./pages/VentasPage.js";

export interface AdminSession {
  nombre: string;
  tenantSlug: string;
}

type Seccion = "dashboard" | "productos" | "inventario" | "ventas" | "tienda";

const NAV: { key: Seccion; label: string; icon: string }[] = [
  { key: "dashboard", label: "Resumen", icon: "📊" },
  { key: "productos", label: "Productos", icon: "📦" },
  { key: "inventario", label: "Inventario", icon: "🏷️" },
  { key: "ventas", label: "Ventas", icon: "🧾" },
  { key: "tienda", label: "Tienda online", icon: "🛒" },
];

export function App() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [seccion, setSeccion] = useState<Seccion>("dashboard");
  const [restoring, setRestoring] = useState(true);

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

  return (
    <div className="flex h-full">
      <aside className="flex w-56 flex-col bg-slate-900 text-slate-100">
        <div className="px-5 py-4 text-lg font-bold text-brand">GaesSoft</div>
        <nav className="flex-1 px-2">
          {NAV.map((n) => (
            <button
              key={n.key}
              type="button"
              onClick={() => setSeccion(n.key)}
              className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
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

      <main className="flex-1 overflow-y-auto bg-slate-100 p-6">
        {seccion === "dashboard" && <DashboardPage />}
        {seccion === "productos" && <ProductosPage />}
        {seccion === "inventario" && <InventarioPage />}
        {seccion === "ventas" && <VentasPage />}
        {seccion === "tienda" && <TiendaPage />}
      </main>
    </div>
  );
}
