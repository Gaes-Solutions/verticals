import { type ReactNode, createContext, useCallback, useContext, useState } from "react";

const KEYS = ["gaespos_pos_token", "gaespos_pos_permisos", "gaespos_pos_slug"];
const Recovery = createContext<() => void>(() => {});
export const useStorageRecovery = () => useContext(Recovery);

export function esErrorAlmacenamiento(error: unknown): boolean {
  return (
    error instanceof Error &&
    ["SecurityError", "QuotaExceededError", "InvalidStateError"].includes(error.name)
  );
}

function accesible(): boolean {
  try {
    for (const key of KEYS) localStorage.getItem(key);
    return true;
  } catch {
    return false;
  }
}

/** A failed browser read is neither a missing session nor permission to erase it. */
export function StorageGate({ children }: { children: ReactNode }) {
  const [unavailable, setUnavailable] = useState(() => !accesible());
  const recover = useCallback(() => setUnavailable(true), []);
  if (unavailable) {
    return (
      <section role="alert" className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="font-bold text-lg">No podemos acceder al almacenamiento del navegador</h1>
        <p>
          Permite los datos de este sitio y vuelve a intentar. Tu sesión guardada no se ha
          eliminado.
        </p>
        <button
          type="button"
          className="gx-btn-primary"
          onClick={() => setUnavailable(!accesible())}
        >
          Reintentar acceso
        </button>
      </section>
    );
  }
  return <Recovery.Provider value={recover}>{children}</Recovery.Provider>;
}
