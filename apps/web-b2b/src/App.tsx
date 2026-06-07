import { useEffect, useState } from "react";
import { Login } from "./components/Login.js";
import { loadToken, setToken } from "./lib/api.js";
import { leer, onCambio } from "./lib/carrito.js";
import { CarritoPage } from "./pages/CarritoPage.js";
import { CatalogoPage } from "./pages/CatalogoPage.js";
import { CotizacionesPage } from "./pages/CotizacionesPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { EstadoCuentaPage } from "./pages/EstadoCuentaPage.js";
import { PedidosPage } from "./pages/PedidosPage.js";

export interface B2bSession {
  nombre: string;
  rol: "admin" | "comprador";
  empresa: string;
}

type Seccion = "dashboard" | "catalogo" | "carrito" | "pedidos" | "cotizaciones" | "cuenta";

const NAV: { key: Seccion; label: string; icon: string }[] = [
  { key: "dashboard", label: "Inicio", icon: "🏠" },
  { key: "catalogo", label: "Catálogo", icon: "📦" },
  { key: "carrito", label: "Mi pedido", icon: "🛒" },
  { key: "pedidos", label: "Mis pedidos", icon: "📬" },
  { key: "cotizaciones", label: "Cotizaciones", icon: "📝" },
  { key: "cuenta", label: "Estado de cuenta", icon: "💳" },
];

export function App() {
  const [session, setSession] = useState<B2bSession | null>(null);
  const [seccion, setSeccion] = useState<Seccion>("dashboard");
  const [restoring, setRestoring] = useState(true);
  const [carritoCount, setCarritoCount] = useState(0);

  useEffect(() => {
    if (!loadToken()) {
      setRestoring(false);
      return;
    }
    setSession({ nombre: "Cliente", rol: "comprador", empresa: "" });
    setRestoring(false);
  }, []);

  useEffect(() => {
    const recount = () => setCarritoCount(leer().reduce((a, i) => a + i.cantidad, 0));
    recount();
    return onCambio(recount);
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
        <div className="px-5 py-4 text-lg font-bold text-brand">Portal Mayorista</div>
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
              <span className="flex-1">{n.label}</span>
              {n.key === "carrito" && carritoCount > 0 && (
                <span className="rounded-full bg-brand px-2 text-xs font-bold text-white">
                  {carritoCount}
                </span>
              )}
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
        {seccion === "dashboard" && <DashboardPage irA={setSeccion} />}
        {seccion === "catalogo" && <CatalogoPage onAgregado={() => setSeccion("catalogo")} />}
        {seccion === "carrito" && <CarritoPage onPedidoCreado={() => undefined} />}
        {seccion === "pedidos" && <PedidosPage />}
        {seccion === "cotizaciones" && <CotizacionesPage />}
        {seccion === "cuenta" && <EstadoCuentaPage />}
      </main>
    </div>
  );
}
