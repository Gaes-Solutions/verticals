import { useEffect, useState } from "react";
import { Login } from "./components/Login.js";
import { PosScreen } from "./components/PosScreen.js";
import { loadToken, setToken } from "./lib/api.js";
import { resolverSession } from "./lib/session.js";
import type { Caja, Sucursal } from "./lib/types.js";

export interface Session {
  cajeroNombre: string;
  sucursal: Sucursal;
  caja: Caja | null;
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);

  // Restaura sesión si hay token válido (recarga de página).
  useEffect(() => {
    const token = loadToken();
    if (!token) {
      setRestoring(false);
      return;
    }
    (async () => {
      try {
        setSession(await resolverSession("Cajero"));
      } catch {
        setToken(null);
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  function handleLogout() {
    setToken(null);
    setSession(null);
  }

  if (restoring) {
    return <div className="flex h-full items-center justify-center text-slate-400">Cargando…</div>;
  }

  if (!session) return <Login onLogin={setSession} />;

  return <PosScreen session={session} onLogout={handleLogout} />;
}
