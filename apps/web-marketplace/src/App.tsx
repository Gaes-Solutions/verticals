import { CalendarHeart, Stethoscope, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { IdentidadModal } from "./components/IdentidadModal.js";
import { getPaciente, setPaciente } from "./lib/api.js";
import { MisReservasPage } from "./pages/MisReservasPage.js";
import { PerfilPage } from "./pages/PerfilPage.js";
import { SearchPage } from "./pages/SearchPage.js";

type Route = { name: "home" } | { name: "perfil"; slug: string } | { name: "mis-reservas" };

function parseHash(): Route {
  const h = window.location.hash.replace(/^#/, "");
  const m = h.match(/^\/p\/([^/]+)/);
  if (m?.[1]) return { name: "perfil", slug: decodeURIComponent(m[1]) };
  if (h.startsWith("/mis-reservas")) return { name: "mis-reservas" };
  return { name: "home" };
}

export function navegar(hash: string): void {
  window.location.hash = hash;
}

export function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [identidadAbierta, setIdentidadAbierta] = useState(false);
  const [paciente, setPacienteState] = useState(getPaciente);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function cerrarSesion() {
    setPaciente(null);
    setPacienteState(null);
  }

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-slate-200 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => navegar("/")}
            className="flex items-center gap-2 font-bold text-brand text-lg"
          >
            <Stethoscope size={22} /> GaesSalud
          </button>
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => navegar("/mis-reservas")}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100"
            >
              <CalendarHeart size={16} /> Mis reservas
            </button>
            {paciente ? (
              <div className="flex items-center gap-2">
                <span className="hidden items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-slate-700 sm:flex">
                  <UserRound size={16} /> {paciente.nombre}
                </span>
                <button
                  type="button"
                  onClick={cerrarSesion}
                  className="rounded-lg px-3 py-2 text-slate-400 hover:text-danger"
                >
                  Salir
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIdentidadAbierta(true)}
                className="gx-btn-primary"
              >
                Identificarme
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {route.name === "home" && <SearchPage />}
        {route.name === "perfil" && (
          <PerfilPage
            slug={route.slug}
            paciente={paciente}
            onPedirIdentidad={() => setIdentidadAbierta(true)}
          />
        )}
        {route.name === "mis-reservas" && (
          <MisReservasPage paciente={paciente} onPedirIdentidad={() => setIdentidadAbierta(true)} />
        )}
      </main>

      {identidadAbierta && (
        <IdentidadModal
          onClose={() => setIdentidadAbierta(false)}
          onListo={(p) => {
            setPacienteState(p);
            setIdentidadAbierta(false);
          }}
        />
      )}
    </div>
  );
}
