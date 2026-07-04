import { useEffect, useState } from "react";
import { Login } from "./components/Login.js";
import { getUsuario, loadToken, puede, setToken } from "./lib/api.js";
import { leerCola, subirCola } from "./lib/offline.js";
import { ClientesPage } from "./pages/ClientesPage.js";
import { ComisionesPage } from "./pages/ComisionesPage.js";
import { HoyPage } from "./pages/HoyPage.js";
import { PedidoPage } from "./pages/PedidoPage.js";

export type Seccion = "hoy" | "clientes" | "pedido" | "comisiones";

const NAV: Array<{ key: Seccion; label: string; icon: string; perm: string }> = [
  { key: "hoy", label: "Hoy", icon: "📅", perm: "visitas.leer" },
  { key: "clientes", label: "Clientes", icon: "🏪", perm: "clientes.leer" },
  { key: "pedido", label: "Pedido", icon: "🛒", perm: "pedidos.crear" },
  { key: "comisiones", label: "Comisiones", icon: "💰", perm: "comisiones.leer_propias" },
];

export function App() {
  const [nombre, setNombre] = useState<string | null>(null);
  const [seccion, setSeccion] = useState<Seccion>("hoy");
  const [restoring, setRestoring] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [enCola, setEnCola] = useState(leerCola().length);
  const [clientePedido, setClientePedido] = useState<string | null>(null);

  useEffect(() => {
    if (!loadToken()) {
      setRestoring(false);
      return;
    }
    setNombre(getUsuario()?.nombre ?? "Vendedor");
    setRestoring(false);
  }, []);

  useEffect(() => {
    async function flush() {
      setOnline(true);
      const { subidos, rechazados } = await subirCola();
      setEnCola(leerCola().length);
      if (subidos > 0 || rechazados.length > 0) {
        const partes = [];
        if (subidos > 0) partes.push(`${subidos} pedido(s) enviados`);
        for (const r of rechazados) partes.push(`Rechazado (${r.clienteNombre}): ${r.motivo}`);
        window.alert(partes.join("\n"));
      }
    }
    const goOffline = () => setOnline(false);
    window.addEventListener("online", flush);
    window.addEventListener("offline", goOffline);
    if (navigator.onLine && leerCola().length > 0) void flush();
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  function handleLogout() {
    setToken(null);
    setNombre(null);
  }

  function irAPedido(clienteB2bId: string) {
    setClientePedido(clienteB2bId);
    setSeccion("pedido");
  }

  if (restoring) {
    return <div className="flex h-full items-center justify-center text-slate-400">Cargando…</div>;
  }
  if (!nombre) return <Login onLogin={setNombre} />;

  const visibles = NAV.filter((n) => puede(n.perm));

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between bg-slate-900 px-4 py-3 text-slate-100">
        <span className="font-bold text-brand">GaesSoft Vendedor</span>
        <div className="flex items-center gap-3">
          {!online && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-300 text-xs">
              Sin conexión
            </span>
          )}
          {enCola > 0 && (
            <span className="rounded-full bg-brand/20 px-2 py-0.5 text-brand text-xs">
              {enCola} por enviar
            </span>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="text-slate-400 text-xs hover:text-white"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-4 pb-24">
        {seccion === "hoy" && <HoyPage onNuevoPedido={irAPedido} />}
        {seccion === "clientes" && <ClientesPage onNuevoPedido={irAPedido} />}
        {seccion === "pedido" && (
          <PedidoPage
            clienteInicial={clientePedido}
            onEnviado={() => {
              setClientePedido(null);
              setEnCola(leerCola().length);
            }}
          />
        )}
        {seccion === "comisiones" && <ComisionesPage />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-slate-200 border-t bg-white">
        <div className="mx-auto flex max-w-3xl">
          {visibles.map((n) => (
            <button
              key={n.key}
              type="button"
              onClick={() => setSeccion(n.key)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
                seccion === n.key ? "font-semibold text-brand" : "text-slate-500"
              }`}
            >
              <span className="text-lg">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
