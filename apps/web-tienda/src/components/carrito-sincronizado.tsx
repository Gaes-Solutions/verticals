"use client";
import { type CarritoRemoto as Cart, esRespuestaCarrito } from "@/lib/carrito-contract";
import {
  type CarritoLineaLocal,
  configurarCarrito,
  fijarCarritoVersion,
  guardarCarrito,
  leerCarrito,
  leerCarritoPendiente,
  leerLineasGuardadas,
  mismasCantidades,
  recibirCarrito,
} from "@/lib/carrito-store";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
const SYNC_ERROR =
  "No pudimos sincronizar tu carrito. Tu selección se conserva; vuelve a intentarlo.";
function errorRespuesta(data: unknown) {
  const error = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return Object.assign(new Error(typeof error.message === "string" ? error.message : SYNC_ERROR), {
    code: error.code,
  });
}
export function CarritoSincronizado({ owner }: { owner: string | null }) {
  const path = usePathname();
  const [message, setMessage] = useState("");
  const refreshRef = useRef<() => void>(() => {});
  const pathRef = useRef(path);
  pathRef.current = path;
  const [local, setLocal] = useState<CarritoLineaLocal[]>([]);
  useEffect(() => {
    let alive = true;
    let busy = false;
    let ready = false;
    let dirty = false;
    let syncFailed = false;
    let revision = 0;
    let version: string | null = null;
    let coupon: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pendingKey = `gaespos_carrito_pendiente:${owner}`;
    const pending = leerCarritoPendiente(localStorage.getItem(pendingKey));
    setLocal(
      owner ? (pending?.items ?? leerLineasGuardadas(localStorage.getItem("gaespos_carrito"))) : [],
    );
    fijarCarritoVersion(null);
    setMessage(owner ? "Sincronizando carrito…" : "");
    function apply(cart: Cart | null) {
      const previous = new Map(leerCarrito().map((item) => [item.varianteId, item]));
      version = cart?.version ?? null;
      fijarCarritoVersion(version);
      coupon = cart?.cuponCodigo ?? null;
      recibirCarrito(
        cart?.items.map((item) => ({
          ...previous.get(item.varianteId),
          varianteId: item.varianteId,
          cantidad: Number(item.cantidad),
          titulo: item.nombre,
          precio: item.precioUnitario,
        })) ?? [],
      );
    }
    async function request(body?: unknown) {
      const res = await fetch("/api/cuenta/carrito", {
        method: body ? "POST" : "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(16000),
        ...(body
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
          : {}),
      }).catch(() => {
        throw new Error(
          "No pudimos sincronizar tu carrito. Tu selección se conserva; vuelve a intentarlo.",
        );
      });
      const data = await res.json().catch(() => null);
      if (!alive) return null;
      if (!res.ok) throw errorRespuesta(data);
      if (!esRespuestaCarrito(data, owner)) throw new Error(SYNC_ERROR);
      return data;
    }
    async function sync() {
      if (!owner || !alive || busy || document.visibilityState === "hidden") return;
      // A pending checkout owns its cart; its outcome must be resolved first.
      if (pathRef.current.startsWith("/checkout") && ready && !dirty) return;
      busy = true;
      syncFailed = false;
      const start = revision;
      try {
        if (!ready || !dirty) {
          const result = await request();
          if (!result || !alive) return;
          const remoteVersion = result.cart?.version ?? null;
          let saved = leerCarritoPendiente(localStorage.getItem(pendingKey));
          const guestRaw = localStorage.getItem("gaespos_carrito");
          const guest = leerLineasGuardadas(guestRaw);
          if (!saved && !result.cart?.items.length && guest.length > 0) {
            // Move the guest selection into this empty account durably before clearing it.
            saved = { version: remoteVersion, items: guest };
            localStorage.setItem(pendingKey, JSON.stringify(saved));
            if (localStorage.getItem("gaespos_carrito") === guestRaw)
              localStorage.removeItem("gaespos_carrito");
          }
          if (saved && mismasCantidades(saved.items, result.cart?.items ?? [])) {
            // The server may have saved a POST whose response was lost.
            localStorage.removeItem(pendingKey);
            dirty = false;
            setLocal([]);
            setMessage("");
            apply(result.cart);
          } else if (saved && saved.version !== undefined && saved.version === remoteVersion) {
            // Resume only against the original version; the API still enforces CAS.
            version = remoteVersion;
            coupon = result.cart?.cuponCodigo ?? null;
            fijarCarritoVersion(version);
            recibirCarrito(saved.items);
            dirty = true;
            revision++;
            setLocal([]);
            setMessage("Guardando carrito…");
          } else {
            if (saved || revision !== start) {
              setLocal(saved?.items ?? leerCarrito());
              dirty = false;
              setMessage(
                "El carrito cambió en otro dispositivo. Puedes agregar tu selección guardada abajo.",
              );
            } else setMessage("");
            apply(result.cart);
          }
          ready = true;
        } else {
          const result = await request({
            owner,
            expectedVersion: version,
            items: leerCarrito().map(({ varianteId, cantidad }) => ({ varianteId, cantidad })),
            ...(coupon ? { cuponCodigo: coupon } : {}),
          });
          if (!result || !alive) return;
          version = result.cart?.version ?? null;
          fijarCarritoVersion(version);
          if (revision === start) {
            dirty = false;
            apply(result.cart);
            localStorage.removeItem(pendingKey);
            setMessage("");
          }
        }
      } catch (error) {
        syncFailed = true;
        if (!alive) return;
        if ((error as { code?: string }).code === "CART_CHANGED") {
          setLocal(leerCarrito());
          dirty = false;
          ready = false;
        }
        setMessage(error instanceof Error ? error.message : "No pudimos sincronizar tu carrito.");
      } finally {
        busy = false;
        if (alive && dirty && ready && revision !== start)
          timer = setTimeout(() => void sync(), 600);
      }
    }
    configurarCarrito(
      owner,
      owner
        ? () => {
            dirty = true;
            revision++;
            localStorage.setItem(pendingKey, JSON.stringify({ version, items: leerCarrito() }));
            setMessage("Guardando carrito…");
            clearTimeout(timer);
            timer = setTimeout(() => void sync(), 600);
          }
        : null,
      owner
        ? async () => {
            clearTimeout(timer);
            const deadline = Date.now() + 20000;
            for (let pass = 0; pass < 3; pass++) {
              while (busy && alive && Date.now() < deadline)
                await new Promise((resolve) => setTimeout(resolve, 30));
              if (!alive || busy || Date.now() >= deadline)
                throw new Error(
                  "No pudimos terminar de guardar tu carrito. Reintenta antes de pagar.",
                );
              if (ready && !dirty && !localStorage.getItem(pendingKey)) return;
              await sync();
              if (syncFailed || (ready && !dirty && localStorage.getItem(pendingKey))) break;
            }
            if (!ready || dirty || localStorage.getItem(pendingKey))
              throw new Error(
                "Tu carrito tiene cambios por sincronizar. Actualízalo antes de pagar; tu selección se conserva.",
              );
          }
        : null,
    );
    refreshRef.current = () => void sync();
    void sync();
    const refresh = () => {
      void sync();
    };
    const poll = setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    const completed = () => {
      dirty = false;
      ready = false;
      version = null;
      fijarCarritoVersion(null);
      localStorage.removeItem(pendingKey);
      void sync();
    };
    window.addEventListener("carrito-finalizado", completed);
    const changed = (event: StorageEvent) => {
      if (event.key?.startsWith("gaespos_carrito")) refresh();
    };
    window.addEventListener("storage", changed);
    return () => {
      alive = false;
      clearInterval(poll);
      clearTimeout(timer);
      configurarCarrito(null, null);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("storage", changed);
      window.removeEventListener("carrito-finalizado", completed);
    };
  }, [owner]);
  useEffect(() => {
    pathRef.current = path;
    refreshRef.current();
  }, [path]);
  if (!owner) return null;
  return (
    <div className="tienda-shell" aria-live="polite">
      {message && (
        <p className="my-2 text-sm text-slate-600">
          {message}{" "}
          <button type="button" className="underline" onClick={() => refreshRef.current()}>
            Actualizar
          </button>
        </p>
      )}
      {local.length > 0 && (
        <div className="my-2 rounded-xl border bg-white p-3 text-sm">
          Tienes {local.length} artículos guardados en este navegador.{" "}
          <button
            type="button"
            className="font-semibold text-marca underline"
            onClick={() => {
              const merged = new Map(leerCarrito().map((item) => [item.varianteId, item]));
              for (const item of local) {
                const current = merged.get(item.varianteId);
                merged.set(item.varianteId, {
                  ...item,
                  cantidad: Math.max(item.cantidad, current?.cantidad ?? 0),
                });
              }
              guardarCarrito([...merged.values()]);
              localStorage.removeItem("gaespos_carrito");
              setLocal([]);
            }}
          >
            Agregar a este carrito
          </button>
        </div>
      )}
    </div>
  );
}
