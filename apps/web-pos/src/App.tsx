import { useState } from "react";
import { DesktopCatalogStatus } from "./components/DesktopCatalogStatus.js";
import { Login } from "./components/Login.js";
import { OfflineCatalog } from "./components/OfflineCatalog.js";
import { PosScreen } from "./components/PosScreen.js";
import { RegisterSetup } from "./components/RegisterSetup.js";
import { loadToken, setToken } from "./lib/api.js";
import { type LocalCatalogAccess, clearCatalogResume } from "./lib/local-catalog.js";
import type { CashierIdentity } from "./lib/session.js";
import type { Caja, Sucursal } from "./lib/types.js";

export interface Session {
  identity?: CashierIdentity;
  cajeroNombre: string;
  sucursal: Sucursal;
  caja: Caja | null;
}
export function App() {
  const [offline, setOffline] = useState<LocalCatalogAccess | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authenticated, setAuthenticated] = useState(() => !!loadToken());
  function handleLogout() {
    clearCatalogResume();
    setOffline(null);
    setToken(null);
    setSession(null);
    setAuthenticated(false);
  }
  if (!authenticated) return <Login onLogin={() => setAuthenticated(true)} />;
  if (offline)
    return (
      <OfflineCatalog
        access={offline}
        onReconnect={() => setOffline(null)}
        onLogout={handleLogout}
      />
    );
  if (!session)
    return <RegisterSetup onReady={setSession} onOffline={setOffline} onLogout={handleLogout} />;
  return (
    <div className="flex h-full flex-col">
      <DesktopCatalogStatus session={session} />
      <div className="min-h-0 flex-1">
        <PosScreen session={session} onLogout={handleLogout} />
      </div>
    </div>
  );
}
