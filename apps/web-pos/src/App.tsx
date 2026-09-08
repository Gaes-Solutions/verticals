import { useState } from "react";
import { Login } from "./components/Login.js";
import { PosScreen } from "./components/PosScreen.js";
import { RegisterSetup } from "./components/RegisterSetup.js";
import { loadToken, setToken } from "./lib/api.js";
import type { Caja, Sucursal } from "./lib/types.js";

export interface Session {
  cajeroNombre: string;
  sucursal: Sucursal;
  caja: Caja | null;
}
export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authenticated, setAuthenticated] = useState(() => !!loadToken());
  function handleLogout() {
    setToken(null);
    setSession(null);
    setAuthenticated(false);
  }
  if (!authenticated) return <Login onLogin={() => setAuthenticated(true)} />;
  if (!session) return <RegisterSetup onReady={setSession} onLogout={handleLogout} />;
  return <PosScreen session={session} onLogout={handleLogout} />;
}
